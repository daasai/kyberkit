#![allow(dead_code)]
//! Kevin desktop shell — Tauri entry.
//! - **Debug / `tauri dev`**: spawns `bun <repo>/src-sidecar/index.ts` when port 3001 is free.
//! - **Release / `tauri build`**: spawns bundled `kevin-sidecar-$TARGET` (see `externalBin`) with app-data workspace.

use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::Duration;

use tauri::path::BaseDirectory;
use tauri::{App, Manager, RunEvent, WebviewUrl, WebviewWindowBuilder};

/// Bun / native Sidecar child (if we started it).
pub struct SidecarProcess(pub Mutex<Option<Child>>);

const SIDECAR_PORT: u16 = 3001;

fn copy_dir_all(src: &Path, dst: &Path) -> io::Result<()> {
  if !src.is_dir() {
    return Ok(());
  }
  fs::create_dir_all(dst)?;
  for entry in fs::read_dir(src)? {
    let entry = entry?;
    let file_type = entry.file_type()?;
    let from = entry.path();
    let to = dst.join(entry.file_name());
    if file_type.is_dir() {
      copy_dir_all(&from, &to)?;
    } else if let Some(parent) = to.parent() {
      fs::create_dir_all(parent)?;
      fs::copy(&from, &to)?;
    }
  }
  Ok(())
}

fn kevin_app_dir(app: &App) -> Result<PathBuf, String> {
  app
    .path()
    .app_data_dir()
    .map(|p| p.join("Kevin"))
    .map_err(|e| e.to_string())
}

/// First-run: copy bundled templates into writable `spaces/default/data/templates`.
fn init_release_workspace(app: &App) -> Result<PathBuf, String> {
  let root = kevin_app_dir(app)?;
  let spaces_root = root.join("spaces");
  let marker = root.join(".runtime_initialized");
  let templates_dst = spaces_root
    .join("default")
    .join("data")
    .join("templates");

  if !marker.exists() {
    fs::create_dir_all(&templates_dst).map_err(|e| e.to_string())?;
    if let Ok(res_templates) = app.path().resolve(
      "spaces/default/data/templates",
      BaseDirectory::Resource,
    ) {
      if res_templates.is_dir() {
        copy_dir_all(&res_templates, &templates_dst).map_err(|e| e.to_string())?;
      } else {
        log::warn!(
          "Bundled templates missing at {}; quick-start file reads may fail until user adds data.",
          res_templates.display()
        );
      }
    }
    fs::write(&marker, b"1").map_err(|e| e.to_string())?;
  }
  fs::create_dir_all(&spaces_root).map_err(|e| e.to_string())?;
  Ok(spaces_root)
}

fn sidecar_exe_name() -> String {
  let triple = env!("KEVIN_TARGET_TRIPLE");
  #[cfg(windows)]
  {
    format!("kevin-sidecar-{triple}.exe")
  }
  #[cfg(not(windows))]
  {
    format!("kevin-sidecar-{triple}")
  }
}

/// Tauri bundles `externalBin` as `kevin-sidecar` (macOS/Linux) or `kevin-sidecar.exe` (Windows)
/// next to the main binary; development uses the `kevin-sidecar-$TARGET_TRIPLE` filename under `src-tauri/binaries/`.
fn resolve_sidecar_executable(exe_dir: &Path) -> PathBuf {
  #[cfg(windows)]
  let bundled = exe_dir.join("kevin-sidecar.exe");
  #[cfg(not(windows))]
  let bundled = exe_dir.join("kevin-sidecar");
  if bundled.is_file() {
    return bundled;
  }
  exe_dir.join(sidecar_exe_name())
}

fn resolve_repo_root(app: &App) -> PathBuf {
  if let Ok(p) = std::env::var("KYBERKIT_REPO_ROOT") {
    let pb = PathBuf::from(&p);
    if pb.join("src-sidecar").join("index.ts").is_file() {
      return pb;
    }
    log::warn!(
      "KYBERKIT_REPO_ROOT set but src-sidecar/index.ts missing under {}; falling back",
      pb.display()
    );
  }

  if let Ok(exe) = std::env::current_exe() {
    if let Some(mut dir) = exe.parent().map(PathBuf::from) {
      for _ in 0..12 {
        if dir.join("src-sidecar").join("index.ts").is_file() {
          return dir;
        }
        if !dir.pop() {
          break;
        }
      }
    }
  }

  if let Ok(cwd) = std::env::current_dir() {
    if cwd.join("src-sidecar").join("index.ts").is_file() {
      return cwd;
    }
    let parent = cwd.join("..");
    if let Ok(can) = parent.canonicalize() {
      if can.join("src-sidecar").join("index.ts").is_file() {
        return can;
      }
    }
  }

  if let Ok(res) = app.path().resolve("..", BaseDirectory::Resource) {
    if res.join("src-sidecar").join("index.ts").is_file() {
      return res;
    }
  }

  std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."))
}

fn sidecar_already_running() -> bool {
  std::net::TcpStream::connect(("127.0.0.1", SIDECAR_PORT)).is_ok()
}

fn spawn_dev_bun_sidecar(app: &mut App) -> Result<(), String> {
  let repo = resolve_repo_root(app);
  let script = repo.join("src-sidecar").join("index.ts");
  if !script.is_file() {
    log::warn!(
      "Sidecar script not found at {} — start Sidecar manually or set KYBERKIT_REPO_ROOT.",
      script.display()
    );
    app.manage(SidecarProcess(Mutex::new(None)));
    return Ok(());
  }

  let spaces = repo.join("spaces");
  let mut cmd = Command::new("bun");
  cmd.arg(script.as_os_str());
  cmd.current_dir(&repo);
  cmd.env("KYBER_SPACES_ROOT", &spaces);
  cmd.stdin(Stdio::null());
  cmd.stdout(Stdio::inherit());
  cmd.stderr(Stdio::inherit());

  match cmd.spawn() {
    Ok(child) => {
      log::info!("Started Kevin Bun sidecar (dev, pid={})", child.id());
      app.manage(SidecarProcess(Mutex::new(Some(child))));
    }
    Err(e) => {
      log::error!("Failed to spawn Bun sidecar: {e}");
      app.manage(SidecarProcess(Mutex::new(None)));
    }
  }
  Ok(())
}

fn spawn_release_binary_sidecar(app: &mut App) -> Result<(), String> {
  let spaces_root = init_release_workspace(app)?;
  let kevin_root = kevin_app_dir(app)?;
  fs::create_dir_all(&kevin_root).map_err(|e| e.to_string())?;

  let exe_dir = std::env::current_exe()
    .map_err(|e| e.to_string())?
    .parent()
    .ok_or_else(|| "sidecar: no executable parent directory".to_string())?
    .to_path_buf();
  let sidecar_path = resolve_sidecar_executable(&exe_dir);

  if !sidecar_path.is_file() {
    log::warn!(
      "Bundled sidecar not found at {} — run `npm run build:sidecar` before `tauri build`, or start Sidecar manually.",
      sidecar_path.display()
    );
    app.manage(SidecarProcess(Mutex::new(None)));
    return Ok(());
  }

  let agent_def = app
    .path()
    .resolve("agents/kevin/kevin.agent.ts", BaseDirectory::Resource)
    .map_err(|e| e.to_string())?;
  if !agent_def.is_file() {
    log::warn!(
      "Bundled agent definition missing at {}",
      agent_def.display()
    );
  }

  let env_file = app
    .path()
    .app_config_dir()
    .map_err(|e| e.to_string())?
    .join("Kevin")
    .join("kevin.env");
  if let Some(parent) = env_file.parent() {
    fs::create_dir_all(parent).map_err(|e| e.to_string())?;
  }

  let mut cmd = Command::new(&sidecar_path);
  cmd.current_dir(&kevin_root);
  cmd.env("KYBER_SPACES_ROOT", &spaces_root);
  cmd.env("KYBER_AGENT_DEF", agent_def.as_os_str());
  cmd.env("KYBERKIT_ENV_FILE", &env_file);
  cmd.stdin(Stdio::null());
  cmd.stdout(Stdio::inherit());
  cmd.stderr(Stdio::inherit());

  match cmd.spawn() {
    Ok(child) => {
      log::info!(
        "Started Kevin sidecar (release binary, pid={})",
        child.id()
      );
      app.manage(SidecarProcess(Mutex::new(Some(child))));
    }
    Err(e) => {
      log::error!("Failed to spawn bundled sidecar: {e}");
      app.manage(SidecarProcess(Mutex::new(None)));
    }
  }
  Ok(())
}

fn maybe_start_sidecar(app: &mut App) -> Result<(), String> {
  if std::env::var("KEVIN_SKIP_SIDECAR_SPAWN").ok().as_deref() == Some("1") {
    log::info!("KEVIN_SKIP_SIDECAR_SPAWN=1 — not spawning sidecar.");
    app.manage(SidecarProcess(Mutex::new(None)));
    return Ok(());
  }

  if sidecar_already_running() {
    log::info!("Port {SIDECAR_PORT} open — skip sidecar spawn.");
    app.manage(SidecarProcess(Mutex::new(None)));
    return Ok(());
  }

  #[cfg(debug_assertions)]
  {
    spawn_dev_bun_sidecar(app)
  }
  #[cfg(not(debug_assertions))]
  {
    spawn_release_binary_sidecar(app)
  }
}

/// Open a dedicated window for another session/space (A1). Dev uses Vite URL; release uses app index + query.
#[tauri::command]
fn open_and_focus_space_window(app: tauri::AppHandle, target_space_id: String) -> Result<(), String> {
  let label = format!(
    "space-{}",
    std::time::SystemTime::now()
      .duration_since(std::time::UNIX_EPOCH)
      .map(|d| d.as_millis())
      .unwrap_or(0)
  );

  let url: WebviewUrl = if cfg!(debug_assertions) {
    let raw = format!("http://127.0.0.1:5173/?space={}", target_space_id);
    WebviewUrl::External(
      raw
        .parse::<url::Url>()
        .map_err(|e| e.to_string())?,
    )
  } else {
    let path = format!("index.html?space={}", target_space_id);
    WebviewUrl::App(path.into())
  };

  if let Some(w) = app.get_webview_window(&label) {
    w.set_focus().map_err(|e| e.to_string())?;
    return Ok(());
  }

  WebviewWindowBuilder::new(&app, &label, url)
    .title("Kevin")
    .build()
    .map_err(|e| e.to_string())?;
  Ok(())
}

fn stop_sidecar(app_handle: &tauri::AppHandle) {
  let Some(state) = app_handle.try_state::<SidecarProcess>() else {
    return;
  };
  let child_opt = {
    let mut guard = state.0.lock().unwrap_or_else(|e| e.into_inner());
    guard.take()
  };
  if let Some(mut child) = child_opt {
    let _ = child.kill();
    let _ = child.wait();
    log::info!("Stopped Kevin sidecar child process");
  }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![open_and_focus_space_window])
    .setup(|app| {
      app
        .handle()
        .plugin(
          tauri_plugin_log::Builder::default()
            .level(if cfg!(debug_assertions) {
              log::LevelFilter::Info
            } else {
              log::LevelFilter::Warn
            })
            .build(),
        )
        .map_err(|e| e.to_string())?;

      maybe_start_sidecar(app)?;

      std::thread::sleep(Duration::from_millis(300));
      Ok(())
    })
    .build(tauri::generate_context!())
    .expect("error while building tauri application")
    .run(|app_handle, event| {
      if matches!(event, RunEvent::Exit) {
        stop_sidecar(app_handle);
      }
    });
}
