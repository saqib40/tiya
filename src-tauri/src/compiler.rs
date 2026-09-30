use serde::Serialize;
use std::fs;
use std::io::{Read, Write};
use std::path::Path;
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use tauri_plugin_shell::process::{Command, CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;
use tokio::sync::oneshot;

#[derive(Default)]
pub struct CompilerState {
    gate: tokio::sync::Mutex<()>,
    active: Mutex<Option<(String, oneshot::Sender<()>)>>,
}

#[derive(Clone, Serialize)]
struct CompileEvent<'event> {
    request_id: &'event str,
    kind: &'event str,
    message: &'event str,
}

#[derive(Serialize)]
pub struct CompileResult {
    pub pdf_path: String,
    pub log: String,
}

pub fn cancel(state: &CompilerState, request_id: &str) -> Result<(), String> {
    let mut active = state.active.lock().map_err(|error| error.to_string())?;
    if active.as_ref().is_some_and(|(id, _)| id == request_id) {
        if let Some((_, sender)) = active.take() {
            let _ = sender.send(());
        }
    }
    Ok(())
}

fn append_log(log: &mut String, message: &str) {
    log.push_str(message);
    log.push('\n');
    if log.len() > 524_288 {
        let mut boundary = log.len() - 524_288;
        while !log.is_char_boundary(boundary) {
            boundary += 1;
        }
        log.drain(..boundary);
    }
}

async fn terminate(child: CommandChild, events: &mut tauri::async_runtime::Receiver<CommandEvent>) {
    let _ = child.kill();
    let _ = tokio::time::timeout(Duration::from_secs(5), async {
        while let Some(event) = events.recv().await {
            if matches!(event, CommandEvent::Terminated(_)) {
                break;
            }
        }
    })
    .await;
}

async fn run_command(
    command: Command,
    mut cancelled: oneshot::Receiver<()>,
    limit: Duration,
    output: impl Fn(&str),
) -> Result<String, String> {
    let (mut events, child) = command
        .spawn()
        .map_err(|error| format!("Could not start the LaTeX engine: {error}"))?;
    let timeout = tokio::time::sleep(limit);
    tokio::pin!(timeout);
    let mut log = String::new();
    loop {
        tokio::select! {
            biased;
            _ = &mut cancelled => {
                terminate(child, &mut events).await;
                return Err(format!("Build cancelled.\n{log}"));
            }
            _ = &mut timeout => {
                terminate(child, &mut events).await;
                return Err(format!("Build timed out after {} seconds. Check the network or try again.\n{log}", limit.as_secs()));
            }
            event = events.recv() => match event {
                Some(CommandEvent::Stdout(bytes) | CommandEvent::Stderr(bytes)) => {
                    let message = String::from_utf8_lossy(&bytes);
                    append_log(&mut log, &message);
                    output(&message);
                }
                Some(CommandEvent::Terminated(status)) => {
                    return if status.code == Some(0) { Ok(log) } else { Err(format!("Compilation failed.\n{log}")) };
                }
                Some(CommandEvent::Error(error)) => {
                    terminate(child, &mut events).await;
                    return Err(format!("Compiler process error: {error}\n{log}"));
                }
                None => {
                    terminate(child, &mut events).await;
                    return Err(format!("Compiler stopped without an exit status.\n{log}"));
                }
                _ => {}
            }
        }
    }
}

fn publish_output(source: &Path, destination: &Path, is_pdf: bool) -> Result<(), String> {
    let mut input = fs::File::open(source).map_err(|error| error.to_string())?;
    if is_pdf {
        let mut header = [0; 5];
        input
            .read_exact(&mut header)
            .map_err(|_| "The engine did not produce a complete PDF")?;
        if &header != b"%PDF-" {
            return Err("The engine did not produce a valid PDF".into());
        }
        input = fs::File::open(source).map_err(|error| error.to_string())?;
    }
    let mut temporary = tempfile::Builder::new()
        .prefix(".tiya-output-")
        .tempfile_in(destination.parent().ok_or("Invalid output path")?)
        .map_err(|error| error.to_string())?;
    std::io::copy(&mut input, &mut temporary).map_err(|error| error.to_string())?;
    temporary.flush().map_err(|error| error.to_string())?;
    temporary
        .as_file()
        .sync_all()
        .map_err(|error| error.to_string())?;
    temporary
        .persist(destination)
        .map_err(|error| error.to_string())?;
    Ok(())
}

pub async fn compile(
    app: &AppHandle,
    state: &CompilerState,
    request_id: &str,
    file_path: &Path,
) -> Result<CompileResult, String> {
    let _guard = state.gate.lock().await;
    let root = fs::canonicalize(file_path).map_err(|error| error.to_string())?;
    let parent = root.parent().ok_or("Invalid root document")?;
    let stem = root
        .file_stem()
        .ok_or("Invalid root document name")?
        .to_string_lossy();
    let output_dir = tempfile::Builder::new()
        .prefix(".tiya-build-")
        .tempdir_in(parent)
        .map_err(|error| error.to_string())?;
    let command = app
        .shell()
        .sidecar("tectonic")
        .map_err(|error| error.to_string())?
        .current_dir(parent)
        .args([
            "-X",
            "compile",
            "--keep-logs",
            "--print",
            "--synctex",
            "--untrusted",
            "--outdir",
        ])
        .arg(output_dir.path())
        .arg(&root);
    let (sender, receiver) = oneshot::channel();
    *state.active.lock().map_err(|error| error.to_string())? =
        Some((request_id.to_owned(), sender));
    let _ = app.emit(
        "compile-output",
        CompileEvent {
            request_id,
            kind: "started",
            message: "Starting Tectonic",
        },
    );
    let result = run_command(command, receiver, Duration::from_secs(300), |message| {
        let _ = app.emit(
            "compile-output",
            CompileEvent {
                request_id,
                kind: "output",
                message,
            },
        );
    })
    .await;
    state
        .active
        .lock()
        .map_err(|error| error.to_string())?
        .take();
    let log_path = output_dir.path().join(format!("{stem}.log"));
    if log_path.exists() {
        let _ = publish_output(&log_path, &parent.join(format!("{stem}.log")), false);
    }
    let log = result?;
    let pdf_path = parent.join(format!("{stem}.pdf"));
    let synctex_name = format!("{stem}.synctex.gz");
    let synctex_path = output_dir.path().join(&synctex_name);
    if synctex_path.exists() {
        publish_output(&synctex_path, &parent.join(synctex_name), false)?;
    }
    publish_output(
        &output_dir.path().join(format!("{stem}.pdf")),
        &pdf_path,
        true,
    )?;
    Ok(CompileResult {
        pdf_path: pdf_path.to_string_lossy().into_owned(),
        log,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_command(argument: &str) -> Command {
        let app = tauri::test::mock_builder()
            .plugin(tauri_plugin_shell::init())
            .build(tauri::test::mock_context(tauri::test::noop_assets()))
            .unwrap();
        app.shell()
            .command(std::env::current_exe().unwrap())
            .arg(argument)
    }

    #[tokio::test]
    async fn captures_successful_process_output() {
        let (_sender, receiver) = oneshot::channel();
        let output = run_command(
            test_command("--list"),
            receiver,
            Duration::from_secs(10),
            |_| {},
        )
        .await
        .unwrap();
        assert!(output.contains("compiler::tests"));
    }

    #[tokio::test]
    async fn cancellation_terminates_the_process() {
        let (sender, receiver) = oneshot::channel();
        sender.send(()).unwrap();
        assert!(run_command(
            test_command("--list"),
            receiver,
            Duration::from_secs(10),
            |_| {}
        )
        .await
        .unwrap_err()
        .starts_with("Build cancelled"));
    }

    #[tokio::test]
    async fn timeout_terminates_the_process() {
        let (_sender, receiver) = oneshot::channel();
        let error = run_command(test_command("--list"), receiver, Duration::ZERO, |_| {})
            .await
            .unwrap_err();
        assert!(error.starts_with("Build timed out"));
    }

    #[tokio::test]
    async fn process_failure_preserves_error_output() {
        let (_sender, receiver) = oneshot::channel();
        let command = test_command("--invalid-tiya-test-option");
        let error = run_command(command, receiver, Duration::from_secs(10), |_| {})
            .await
            .unwrap_err();
        assert!(error.contains("Compilation failed"));
        assert!(error.contains("invalid-tiya-test-option"));
    }

    #[test]
    fn invalid_output_cannot_replace_the_last_successful_pdf() {
        let directory = tempfile::tempdir().unwrap();
        let destination = directory.path().join("main.pdf");
        let candidate = directory.path().join("incomplete.pdf");
        fs::write(&destination, "%PDF-existing").unwrap();
        fs::write(&candidate, "partial").unwrap();
        assert!(publish_output(&candidate, &destination, true).is_err());
        assert_eq!(fs::read_to_string(destination).unwrap(), "%PDF-existing");
    }
}
