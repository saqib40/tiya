use serde::Serialize;
use std::fs;
use std::path::Path;
use tauri::Window;

mod filesystem;
mod project;
mod compiler;
mod watcher;

#[tauri::command]
fn load_project(path: String) -> Result<project::ProjectInfo, String> {
    project::load_project(Path::new(&path))
}

#[tauri::command]
async fn create_project(parent_path: String, name: String, template: String) -> Result<project::ProjectInfo, String> {
    tauri::async_runtime::spawn_blocking(move || project::create_project(Path::new(&parent_path), &name, &template))
        .await.map_err(|error| error.to_string())?
}

#[tauri::command]
async fn import_project(archive_path: String, parent_path: String, name: String) -> Result<project::ProjectInfo, String> {
    tauri::async_runtime::spawn_blocking(move || project::import_project(Path::new(&archive_path), Path::new(&parent_path), &name))
        .await.map_err(|error| error.to_string())?
}

#[tauri::command]
fn set_project_root(project_path: String, file_path: String) -> Result<project::ProjectInfo, String> {
    project::set_root(Path::new(&project_path), Path::new(&file_path))
}

#[tauri::command]
fn resolve_project_file(project_path: String, root_file: String, requested_path: String) -> Result<String, String> {
    project::resolve_file(Path::new(&project_path), Path::new(&root_file), Path::new(&requested_path))
        .map(|path| path.to_string_lossy().into_owned())
}

#[derive(Serialize, Clone)]
pub struct FileNode {
    name: String,
    path: String,
    is_dir: bool,
}

#[tauri::command]
fn open_directory(path: String) -> Result<Vec<FileNode>, String> {
    let entries = fs::read_dir(path).map_err(|e| e.to_string())?;
    let mut nodes = Vec::new();

    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        let path_buf = entry.path();
        let name = path_buf
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_string();

        nodes.push(FileNode {
            name,
            path: path_buf.to_string_lossy().to_string(),
            is_dir: path_buf.is_dir(),
        });
    }

    Ok(nodes)
}

#[tauri::command]
fn read_file_content(path: String) -> Result<String, String> {
    filesystem::read_text_file(Path::new(&path)).map_err(|error| error.to_string())
}

#[tauri::command]
async fn import_file(source: String, destination: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || filesystem::import_file(Path::new(&source), Path::new(&destination)))
        .await.map_err(|error| error.to_string())?.map_err(|error| error.to_string())
}

#[tauri::command]
async fn compile_preview(app_handle: tauri::AppHandle, state: tauri::State<'_, compiler::CompilerState>, file_path: String, request_id: String) -> Result<compiler::CompileResult, String> {
    compiler::compile(&app_handle, &state, &request_id, Path::new(&file_path)).await
}

#[tauri::command]
fn cancel_compile(state: tauri::State<'_, compiler::CompilerState>, request_id: String) -> Result<(), String> {
    compiler::cancel(&state, &request_id)
}

#[tauri::command]
fn export_pdf(source: String, destination: String) -> Result<(), String> {
    compiler::export_pdf(Path::new(&source), Path::new(&destination))
}

#[tauri::command]
fn open_pdf(app: tauri::AppHandle, path: String) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    if !Path::new(&path).is_file() || !Path::new(&path).extension().is_some_and(|extension| extension.eq_ignore_ascii_case("pdf")) {
        return Err("Select an existing PDF".into());
    }
    app.opener().open_path(path, None::<&str>).map_err(|error| error.to_string())
}

#[tauri::command]
fn watch_directory(path: String, root_file: Option<String>, watch_id: String, window: Window, state: tauri::State<'_, watcher::WatchState>) -> Result<(), String> {
    watcher::start(&state, Path::new(&path), root_file.map(Into::into), watch_id, window)
}

#[tauri::command]
fn unwatch_directory(watch_id: String, state: tauri::State<'_, watcher::WatchState>) -> Result<(), String> {
    watcher::stop(&state, &watch_id)
}

#[tauri::command]
fn save_file(path: String, content: String, expected_content: String) -> Result<(), filesystem::SaveFailure> {
    filesystem::save_checked(Path::new(&path), &content, &expected_content)
}

#[tauri::command]
fn create_file(path: String) -> Result<(), String> {
    println!("Creating file: {}", path);
    filesystem::create_file(Path::new(&path)).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn create_directory(path: String) -> Result<(), String> {
    println!("Creating directory: {}", path);
    fs::create_dir_all(&path).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn delete_node(path: String) -> Result<(), String> {
    trash::delete(path).map_err(|error| format!("Could not move the item to Trash: {error}"))
}

#[tauri::command]
fn move_node(source: String, destination: String) -> Result<(), String> {
    println!("Moving node from {} to {}", source, destination);
    filesystem::move_node(Path::new(&source), Path::new(&destination)).map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(compiler::CompilerState::default())
        .manage(watcher::WatchState::default())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|_app| {
            // let menu = Menu::default(app.handle())?;
            // app.set_menu(menu)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            load_project,
            create_project,
            import_project,
            set_project_root,
            resolve_project_file,
            open_directory,
            read_file_content,
            import_file,
            compile_preview,
            cancel_compile,
            export_pdf,
            open_pdf,
            save_file,
            create_file,
            create_directory,
            delete_node,
            move_node,
            watch_directory,
            unwatch_directory
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
