use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{Emitter, Window};

#[derive(Default)]
pub struct WatchState {
    active: Mutex<Option<(String, RecommendedWatcher)>>,
}

#[derive(Clone, Serialize)]
struct FileChange {
    watch_id: String,
    paths: Vec<String>,
    error: Option<String>,
}

fn relevant_paths(project: &Path, root_file: Option<&Path>, event: &Event) -> Vec<String> {
    if matches!(event.kind, EventKind::Access(_)) {
        return Vec::new();
    }
    event
        .paths
        .iter()
        .filter(|path| {
            let Ok(relative) = path.strip_prefix(project) else {
                return false;
            };
            if relative.components().any(|part| {
                let name = part.as_os_str().to_string_lossy();
                name.starts_with(".tiya")
                    || matches!(name.as_ref(), ".git" | "node_modules" | "target")
            }) {
                return false;
            }
            if let Some(root) = root_file {
                for extension in [
                    "pdf",
                    "log",
                    "aux",
                    "out",
                    "toc",
                    "synctex.gz",
                    "fls",
                    "fdb_latexmk",
                    "bbl",
                    "blg",
                ] {
                    if **path == root.with_extension(extension) {
                        return false;
                    }
                }
            }
            true
        })
        .map(|path| path.to_string_lossy().into_owned())
        .collect()
}

pub fn start(
    state: &WatchState,
    project: &Path,
    root_file: Option<PathBuf>,
    watch_id: String,
    window: Window,
) -> Result<(), String> {
    let directory = std::fs::canonicalize(project).map_err(|error| error.to_string())?;
    let watched = directory.clone();
    let event_id = watch_id.clone();
    let mut watcher = notify::recommended_watcher(move |result: notify::Result<Event>| {
        let payload = match result {
            Ok(event) => {
                let paths = relevant_paths(&watched, root_file.as_deref(), &event);
                if paths.is_empty() {
                    return;
                }
                FileChange {
                    watch_id: event_id.clone(),
                    paths,
                    error: None,
                }
            }
            Err(error) => FileChange {
                watch_id: event_id.clone(),
                paths: Vec::new(),
                error: Some(error.to_string()),
            },
        };
        let _ = window.emit("fs-change", payload);
    })
    .map_err(|error| error.to_string())?;
    watcher
        .watch(&directory, RecursiveMode::Recursive)
        .map_err(|error| error.to_string())?;
    *state.active.lock().map_err(|error| error.to_string())? = Some((watch_id, watcher));
    Ok(())
}

pub fn stop(state: &WatchState, watch_id: &str) -> Result<(), String> {
    let mut active = state.active.lock().map_err(|error| error.to_string())?;
    if active.as_ref().is_some_and(|(id, _)| id == watch_id) {
        active.take();
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn filters_build_outputs_but_keeps_project_assets() {
        let directory = tempfile::tempdir().unwrap();
        let root = directory.path().join("main.tex");
        let event = Event::new(EventKind::Any)
            .add_path(directory.path().join("main.pdf"))
            .add_path(directory.path().join("main.synctex.gz"))
            .add_path(directory.path().join(".tiya-build-123/main.pdf"))
            .add_path(directory.path().join(".git/index"))
            .add_path(directory.path().join("figures/plot.pdf"))
            .add_path(directory.path().join("references.bib"));
        let paths = relevant_paths(directory.path(), Some(&root), &event);
        assert_eq!(
            paths,
            vec![
                directory.path().join("figures/plot.pdf").to_string_lossy(),
                directory.path().join("references.bib").to_string_lossy()
            ]
        );
    }

    #[test]
    fn ignores_read_events_and_outside_paths() {
        let directory = tempfile::tempdir().unwrap();
        let source = directory.path().join("main.tex");
        let event = Event::new(EventKind::Access(notify::event::AccessKind::Any)).add_path(source);
        assert!(relevant_paths(directory.path(), None, &event).is_empty());
        let outside = tempfile::tempdir().unwrap();
        assert!(relevant_paths(
            directory.path(),
            None,
            &Event::new(EventKind::Any).add_path(outside.path().join("main.tex"))
        )
        .is_empty());
    }
}
