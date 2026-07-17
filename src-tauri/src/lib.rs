use serde::Deserialize;
use serde_json::{json, Value};
use std::{
    fs,
    path::{Component, Path, PathBuf},
};
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    webview::PageLoadEvent,
    AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder,
};

const DEFAULT_DIALOGUE: &str = r#"{
  "default": [
    { "text": "嗯，我在。" },
    { "text": "今天想做什么？" }
  ],
  "triggers": {
    "你好": [{ "text": "你好。" }],
    "晚安": [{ "text": "晚安，早点休息。" }]
  }
}"#;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SaveImagePetInput {
    mode: String,
    id: String,
    name: String,
    description: Option<String>,
    image_bytes: Option<Vec<u8>>,
    image_extension: Option<String>,
}

fn validate_pet_id(pet_id: &str) -> Result<(), String> {
    let lower = pet_id.to_ascii_lowercase();
    let base_name = lower.split('.').next().unwrap_or_default();
    let reserved_windows_name = matches!(base_name, "con" | "prn" | "aux" | "nul")
        || (base_name.len() == 4
            && (base_name.starts_with("com") || base_name.starts_with("lpt"))
            && matches!(base_name.as_bytes()[3], b'1'..=b'9'));
    let valid = !pet_id.is_empty()
        && pet_id == pet_id.trim()
        && pet_id.chars().count() <= 64
        && !matches!(pet_id, "." | "..")
        && !pet_id.ends_with('.')
        && !pet_id.ends_with(' ')
        && !reserved_windows_name
        && !pet_id.chars().any(|character| {
            character.is_control()
                || matches!(
                    character,
                    '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*'
                )
        });
    if valid {
        Ok(())
    } else {
        Err("资源标识不可包含非法路径字符，也不能使用 Windows 保留名称".into())
    }
}

#[cfg(test)]
mod tests {
    use super::{extract_legacy_config, validate_pet_id};
    use serde_json::json;

    #[test]
    fn accepts_unicode_pet_ids() {
        assert!(validate_pet_id("若叶睦").is_ok());
        assert!(validate_pet_id("simple-mimi_01").is_ok());
    }

    #[test]
    fn rejects_unsafe_pet_ids() {
        for pet_id in ["", ".", "..", "../pet", "pet/name", "pet?name", "CON.txt"] {
            assert!(validate_pet_id(pet_id).is_err(), "accepted {pet_id}");
        }
    }

    #[test]
    fn extracts_config_from_legacy_store_document() {
        let legacy = json!({ "config": { "defaultPet": "simple-mimi", "launch": "pet" } });
        assert_eq!(
            extract_legacy_config(legacy),
            json!({ "defaultPet": "simple-mimi", "launch": "pet" })
        );
    }
}

fn portable_root_dir() -> Result<PathBuf, String> {
    #[cfg(debug_assertions)]
    {
        Path::new(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .map(Path::to_path_buf)
            .ok_or_else(|| "无法解析项目根目录".to_string())
    }

    #[cfg(not(debug_assertions))]
    {
        std::env::current_exe()
            .map_err(|error| format!("无法解析程序路径：{error}"))?
            .parent()
            .map(Path::to_path_buf)
            .ok_or_else(|| "无法解析程序所在目录".to_string())
    }
}

fn copy_directory_contents(source: &Path, target: &Path) -> Result<(), String> {
    fs::create_dir_all(target).map_err(|error| format!("无法创建迁移目录：{error}"))?;
    for entry in fs::read_dir(source).map_err(|error| format!("无法读取旧数据：{error}"))? {
        let entry = entry.map_err(|error| format!("无法读取旧数据项：{error}"))?;
        let file_type = entry
            .file_type()
            .map_err(|error| format!("无法识别旧数据项：{error}"))?;
        let destination = target.join(entry.file_name());
        if file_type.is_dir() {
            copy_directory_contents(&entry.path(), &destination)?;
        } else if file_type.is_file() {
            fs::copy(entry.path(), destination)
                .map_err(|error| format!("无法迁移旧数据文件：{error}"))?;
        }
    }
    Ok(())
}

fn extract_legacy_config(document: Value) -> Value {
    document.get("config").cloned().unwrap_or(document)
}

fn migrate_legacy_data(app: &AppHandle, target: &Path) -> Result<(), String> {
    let legacy = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("无法解析旧应用数据目录：{error}"))?;
    if !legacy.is_dir() {
        return Ok(());
    }

    let legacy_config = legacy.join("app-config.json");
    if legacy_config.is_file() {
        let text = fs::read_to_string(&legacy_config)
            .map_err(|error| format!("无法读取旧应用配置：{error}"))?;
        let document: Value = serde_json::from_str(&text)
            .map_err(|error| format!("旧应用配置不是有效 JSON：{error}"))?;
        fs::write(
            target.join("app-config.json"),
            serde_json::to_vec_pretty(&extract_legacy_config(document))
                .map_err(|error| format!("无法转换旧应用配置：{error}"))?,
        )
        .map_err(|error| format!("无法迁移应用配置：{error}"))?;
    }

    let legacy_pets = legacy.join("pets");
    if legacy_pets.is_dir() {
        copy_directory_contents(&legacy_pets, &target.join("pets"))?;
    }
    Ok(())
}

fn portable_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let directory = portable_root_dir()?.join("data");
    let is_first_use = !directory.exists();
    fs::create_dir_all(&directory)
        .map_err(|error| format!("无法创建便携数据目录 {}：{error}", directory.display()))?;

    if is_first_use {
        if let Err(error) = migrate_legacy_data(app, &directory) {
            let _ = fs::remove_dir_all(&directory);
            return Err(error);
        }
    }
    Ok(directory)
}

fn pets_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let directory = portable_data_dir(app)?.join("pets");
    fs::create_dir_all(&directory).map_err(|error| format!("无法创建桌宠目录：{error}"))?;
    Ok(directory)
}

fn pet_dir(app: &AppHandle, pet_id: &str) -> Result<PathBuf, String> {
    validate_pet_id(pet_id)?;
    Ok(pets_dir(app)?.join(pet_id))
}

fn safe_pet_path(app: &AppHandle, pet_id: &str, relative_path: &str) -> Result<PathBuf, String> {
    let relative = Path::new(relative_path);
    if relative.as_os_str().is_empty()
        || relative
            .components()
            .any(|part| !matches!(part, Component::Normal(_)))
    {
        return Err("桌宠资源路径不安全".into());
    }
    Ok(pet_dir(app, pet_id)?.join(relative))
}

#[tauri::command]
fn ensure_pet_storage(app: AppHandle) -> Result<(), String> {
    pets_dir(&app)?;
    Ok(())
}

#[tauri::command]
fn read_app_config(app: AppHandle) -> Result<Value, String> {
    let path = portable_data_dir(&app)?.join("app-config.json");
    if !path.is_file() {
        return Ok(json!({}));
    }
    let text =
        fs::read_to_string(path).map_err(|error| format!("无法读取便携应用配置：{error}"))?;
    serde_json::from_str(&text).map_err(|error| format!("应用配置不是有效 JSON：{error}"))
}

#[tauri::command]
fn write_app_config(app: AppHandle, config: Value) -> Result<(), String> {
    if !config.is_object() {
        return Err("应用配置必须是 JSON 对象".into());
    }
    let path = portable_data_dir(&app)?.join("app-config.json");
    let bytes = serde_json::to_vec_pretty(&config)
        .map_err(|error| format!("无法序列化应用配置：{error}"))?;
    fs::write(path, bytes).map_err(|error| format!("无法保存便携应用配置：{error}"))
}

#[tauri::command]
fn list_pet_ids(app: AppHandle) -> Result<Vec<String>, String> {
    let mut ids = Vec::new();
    for entry in fs::read_dir(pets_dir(&app)?).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        if entry
            .file_type()
            .map_err(|error| error.to_string())?
            .is_dir()
            && entry.path().join("pet.json").is_file()
        {
            if let Some(id) = entry.file_name().to_str() {
                ids.push(id.to_owned());
            }
        }
    }
    ids.sort();
    Ok(ids)
}

#[tauri::command]
fn pet_file_exists(app: AppHandle, pet_id: String, relative_path: String) -> Result<bool, String> {
    Ok(safe_pet_path(&app, &pet_id, &relative_path)?.is_file())
}

#[tauri::command]
fn read_pet_text(app: AppHandle, pet_id: String, relative_path: String) -> Result<String, String> {
    fs::read_to_string(safe_pet_path(&app, &pet_id, &relative_path)?)
        .map_err(|error| format!("无法读取桌宠文本资源：{error}"))
}

#[tauri::command]
fn read_pet_binary(
    app: AppHandle,
    pet_id: String,
    relative_path: String,
) -> Result<Vec<u8>, String> {
    fs::read(safe_pet_path(&app, &pet_id, &relative_path)?)
        .map_err(|error| format!("无法读取桌宠二进制资源：{error}"))
}

#[tauri::command]
fn save_image_pet(app: AppHandle, input: SaveImagePetInput) -> Result<(), String> {
    let pet_id = input.id.trim().to_owned();
    validate_pet_id(&pet_id)?;
    if input.name.trim().is_empty() {
        return Err("桌宠名称不能为空".into());
    }
    if input.mode != "create" && input.mode != "edit" {
        return Err("无效的保存模式".into());
    }

    let directory = pet_dir(&app, &pet_id)?;
    let manifest_path = directory.join("pet.json");
    if input.mode == "create" && manifest_path.exists() {
        return Err("桌宠标识已存在".into());
    }
    if input.mode == "create" && input.image_bytes.is_none() {
        return Err("创建静态桌宠时必须选择图片".into());
    }
    fs::create_dir_all(&directory).map_err(|error| error.to_string())?;

    let mut manifest: Value = if input.mode == "edit" {
        let text = fs::read_to_string(&manifest_path)
            .map_err(|error| format!("无法读取待编辑桌宠：{error}"))?;
        serde_json::from_str(&text).map_err(|error| format!("桌宠配置损坏：{error}"))?
    } else {
        json!({
            "schemaVersion": 1,
            "id": pet_id,
            "appearance": { "type": "image", "source": "./avatar.png" },
            "dialogue": { "type": "preset", "script": "./dialogue.json" }
        })
    };

    manifest["name"] = Value::String(input.name.trim().to_owned());
    match input.description.filter(|value| !value.trim().is_empty()) {
        Some(description) => manifest["description"] = Value::String(description.trim().to_owned()),
        None => {
            if let Some(object) = manifest.as_object_mut() {
                object.remove("description");
            }
        }
    }

    if let Some(bytes) = input.image_bytes {
        let extension = input
            .image_extension
            .unwrap_or_else(|| "png".into())
            .to_ascii_lowercase();
        if !matches!(
            extension.as_str(),
            "png" | "jpg" | "jpeg" | "webp" | "gif" | "svg"
        ) {
            return Err("不支持的图片格式".into());
        }
        let file_name = format!("avatar.{extension}");
        fs::write(directory.join(&file_name), bytes)
            .map_err(|error| format!("无法保存桌宠图片：{error}"))?;
        manifest["appearance"] = json!({ "type": "image", "source": format!("./{file_name}") });
    }

    if !directory.join("dialogue.json").exists() {
        fs::write(directory.join("dialogue.json"), DEFAULT_DIALOGUE)
            .map_err(|error| format!("无法创建预设对话：{error}"))?;
    }
    fs::write(
        manifest_path,
        serde_json::to_vec_pretty(&manifest).map_err(|error| error.to_string())?,
    )
    .map_err(|error| format!("无法保存桌宠配置：{error}"))?;
    Ok(())
}

#[tauri::command]
fn delete_pet(app: AppHandle, pet_id: String) -> Result<(), String> {
    let directory = pet_dir(&app, &pet_id)?;
    if directory.exists() {
        fs::remove_dir_all(directory).map_err(|error| format!("无法删除桌宠：{error}"))?;
    }
    Ok(())
}

#[tauri::command]
fn start_reason() -> &'static str {
    if std::env::args().any(|argument| argument == "--autostart") {
        "autostart"
    } else {
        "manual"
    }
}

fn show_main(app: &AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "主界面窗口不存在".to_string())?;
    window.show().map_err(|error| error.to_string())?;
    window.unminimize().map_err(|error| error.to_string())?;
    window.set_focus().map_err(|error| error.to_string())
}

#[tauri::command]
fn show_main_window(app: AppHandle) -> Result<(), String> {
    show_main(&app)
}

#[tauri::command]
fn hide_main_window(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        window.hide().map_err(|error| error.to_string())?;
    }
    Ok(())
}

fn create_or_show_pet_window(app: AppHandle, pet_id: Option<String>) -> Result<(), String> {
    if let Some(pet_id) = pet_id.as_deref() {
        validate_pet_id(pet_id)?;
    }

    if let Some(window) = app.get_webview_window("pet") {
        if let Some(pet_id) = pet_id.as_deref() {
            window
                .emit("load-pet", pet_id)
                .map_err(|error| error.to_string())?;
        }
        window.show().map_err(|error| error.to_string())?;
        return window.set_focus().map_err(|error| error.to_string());
    }

    let initialization_script = pet_id
        .map(|pet_id| {
            serde_json::to_string(&pet_id)
                .map(|pet_id| format!("window.__MOEMIMI_PET_ID__ = {pet_id};"))
                .map_err(|error| error.to_string())
        })
        .transpose()?
        .unwrap_or_default();

    WebviewWindowBuilder::new(&app, "pet", WebviewUrl::App("index.html".into()))
        .title("MoeMimi 桌宠")
        .inner_size(420.0, 420.0)
        .resizable(false)
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .visible(false)
        .initialization_script(initialization_script)
        .on_page_load(|window, payload| {
            if matches!(payload.event(), PageLoadEvent::Finished) {
                let _ = window.show();
            }
        })
        .build()
        .map_err(|error| format!("无法创建桌宠窗口：{error}"))?;
    Ok(())
}

#[tauri::command]
async fn show_pet_window(app: AppHandle, pet_id: Option<String>) -> Result<(), String> {
    create_or_show_pet_window(app, pet_id)
}

#[tauri::command]
fn hide_pet_window(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("pet") {
        window.hide().map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn close_pet_window(app: AppHandle) -> Result<(), String> {
    show_main(&app)?;
    hide_pet_window(app)
}

#[tauri::command]
fn exit_app(app: AppHandle) {
    app.exit(0);
}

fn setup_tray(app: &tauri::App) -> tauri::Result<()> {
    let open_main = MenuItem::with_id(app, "open-main", "打开主界面", true, None::<&str>)?;
    let show_pet = MenuItem::with_id(app, "show-pet", "显示桌宠", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "退出 MoeMimi", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open_main, &show_pet, &quit])?;

    let mut tray = TrayIconBuilder::new()
        .tooltip("MoeMimi")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "open-main" => {
                let _ = show_main(app);
            }
            "show-pet" => {
                let app = app.clone();
                tauri::async_runtime::spawn(async move {
                    let _ = create_or_show_pet_window(app, None);
                });
            }
            "quit" => app.exit(0),
            _ => {}
        });
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app)?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            let _ = show_main(app);
        }))
        .plugin(
            tauri_plugin_autostart::Builder::new()
                .args(["--autostart"])
                .build(),
        )
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            ensure_pet_storage,
            read_app_config,
            write_app_config,
            list_pet_ids,
            pet_file_exists,
            read_pet_text,
            read_pet_binary,
            save_image_pet,
            delete_pet,
            start_reason,
            show_main_window,
            hide_main_window,
            show_pet_window,
            close_pet_window,
            hide_pet_window,
            exit_app
        ])
        .setup(|app| {
            setup_tray(app)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running MoeMimi");
}
