use serde::Serialize;
use std::fs;
use std::path::Path;
use tauri::{Emitter, Window};
use notify::{Watcher, RecursiveMode, RecommendedWatcher, Config};
use std::sync::mpsc::channel;

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
    fs::read_to_string(path).map_err(|e| e.to_string())
}

#[tauri::command]
async fn compile_preview(file_path: String) -> Result<String, String> {
    println!("Compilation requested for: {}", file_path);
    
    let path = Path::new(&file_path);
    let parent_dir = path.parent().ok_or("Invalid file path: no parent directory")?;
    let file_stem = path.file_stem().ok_or("Invalid file name")?.to_string_lossy();
    let pdf_path = parent_dir.join(format!("{}.pdf", file_stem));

    println!("Output directory: {}", parent_dir.display());
    println!("Target PDF: {}", pdf_path.display());

    // Read the source file
    let file_content = fs::read_to_string(&file_path).map_err(|e| format!("Failed to read source file: {}", e))?;

    // Execute Tectonic compilation in a blocking thread to avoid runtime panic
    println!("Starting Tectonic compilation...");
    let pdf_bytes = tauri::async_runtime::spawn_blocking(move || {
        tectonic::latex_to_pdf(file_content).map_err(|e| {
            println!("Tectonic error: {:?}", e);
            format!("Compilation failed: {}", e)
        })
    })
    .await
    .map_err(|e| format!("Runtime error: {}", e))??;

    // Write the output PDF
    fs::write(&pdf_path, pdf_bytes).map_err(|e| format!("Failed to write output PDF: {}", e))?;

    println!("Compilation successful: {}", pdf_path.display());
    Ok(pdf_path.to_string_lossy().to_string())
}

#[tauri::command]
fn watch_directory(path: String, window: Window) {
    std::thread::spawn(move || {
        let (tx, rx) = channel();
        let mut watcher = RecommendedWatcher::new(tx, Config::default()).map_err(|e| e.to_string()).unwrap();

        watcher.watch(Path::new(&path), RecursiveMode::Recursive).map_err(|e| e.to_string()).unwrap();

        println!("Started watching: {}", path);

        for res in rx {
            match res {
                Ok(_event) => {
                    // We emit a simple event to trigger a refresh in the frontend
                    let _ = window.emit("fs-change", {});
                }
                Err(e) => println!("watch error: {:?}", e),
            }
        }
    });
}

#[tauri::command]
fn save_file(path: String, content: String) -> Result<(), String> {
    println!("Saving file to path: {}", path);
    println!("Content length: {} bytes", content.len());
    fs::write(&path, &content).map_err(|e| {
        println!("Error writing file: {}", e);
        e.to_string()
    })?;
    println!("File saved successfully");
    Ok(())
}

#[tauri::command]
fn create_file(path: String) -> Result<(), String> {
    println!("Creating file: {}", path);
    fs::File::create(&path).map_err(|e| e.to_string())?;
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
    println!("Deleting node: {}", path);
    let path_buf = Path::new(&path);
    if path_buf.is_dir() {
        fs::remove_dir_all(path_buf).map_err(|e| e.to_string())?;
    } else {
        fs::remove_file(path_buf).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn move_node(source: String, destination: String) -> Result<(), String> {
    println!("Moving node from {} to {}", source, destination);
    fs::rename(source, destination).map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
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
            open_directory,
            read_file_content,
            compile_preview,
            save_file,
            create_file,
            create_directory,
            delete_node,
            move_node,
            watch_directory
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
