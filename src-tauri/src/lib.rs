use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{Emitter, Manager};

struct AppState {
    pending: Mutex<Vec<String>>,
    frontend_ready: Mutex<bool>,
}

#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| format!("Failed to read {path}: {e}"))
}

#[tauri::command]
fn write_text_file(path: String, content: String) -> Result<(), String> {
    fs::write(&path, content).map_err(|e| format!("Failed to write {path}: {e}"))
}

#[tauri::command]
fn take_pending_files(state: tauri::State<AppState>) -> Vec<String> {
    let mut ready = state.frontend_ready.lock().unwrap();
    *ready = true;
    let mut guard = state.pending.lock().unwrap();
    std::mem::take(&mut *guard)
}

fn first_file_arg(args: impl IntoIterator<Item = String>) -> Option<String> {
    args.into_iter()
        .skip(1)
        .find(|a| !a.starts_with('-') && PathBuf::from(a).is_file())
}

fn emit_open_file(app: &tauri::AppHandle, path: &str) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.emit("open-file", path);
        let _ = win.set_focus();
    }
}

fn dispatch_open_file(app: &tauri::AppHandle, path: &str) {
    let state: tauri::State<AppState> = app.state();
    let ready = *state.frontend_ready.lock().unwrap();
    if ready {
        emit_open_file(app, path);
    } else {
        state.pending.lock().unwrap().push(path.to_string());
        if let Some(win) = app.get_webview_window("main") {
            let _ = win.set_focus();
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            if let Some(path) = first_file_arg(argv) {
                dispatch_open_file(app, &path);
            } else if let Some(win) = app.get_webview_window("main") {
                let _ = win.set_focus();
            }
        }));
    }

    builder
        .manage(AppState {
            pending: Mutex::new(Vec::new()),
            frontend_ready: Mutex::new(false),
        })
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            read_text_file,
            write_text_file,
            take_pending_files
        ])
        .setup(|app| {
            if let Some(path) = first_file_arg(std::env::args()) {
                let state: tauri::State<AppState> = app.state();
                state.pending.lock().unwrap().push(path);
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app_handle, _event| {
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Opened { urls } = _event {
                for url in urls {
                    if let Ok(path) = url.to_file_path() {
                        if let Some(s) = path.to_str() {
                            dispatch_open_file(_app_handle, s);
                        }
                    }
                }
            }
        });
}
