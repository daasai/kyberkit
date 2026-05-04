//! Kevin desktop shell — Tauri entry. Spawns Bun Sidecar when not already running (dev workflow).

use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::Duration;

use tauri::path::BaseDirectory;
use tauri::{App, Manager, RunEvent};

/// Bun Sidecar child process (if we started it). Not `Serialize`; managed only on the Rust side.
pub struct SidecarProcess(pub Mutex<Option<Child>>);

const SIDECAR_PORT: u16 = 3001;

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
      for _ in 0..8 {
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

fn maybe_start_sidecar(app: &mut App) -> Result<(), Box<dyn std::error::Error>> {
  if std::env::var("KEVIN_SKIP_SIDECAR_SPAWN").ok().as_deref() == Some("1") {
    log::info!("KEVIN_SKIP_SIDECAR_SPAWN=1 — not spawning Bun sidecar.");
    app.manage(SidecarProcess(Mutex::new(None)));
    return Ok(());
  }

  if sidecar_already_running() {
    log::info!("Port {SIDECAR_PORT} open — assuming sidecar already running; skip spawn.");
    app.manage(SidecarProcess(Mutex::new(None)));
    return Ok(());
  }

  let repo = resolve_repo_root(app);
  let script = repo.join("src-sidecar").join("index.ts");
  if !script.is_file() {
    log::warn!(
      "Sidecar script not found at {} — UI may fail until you start Sidecar manually.",
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
      log::info!("Started Kevin Bun sidecar (pid={})", child.id());
      app.manage(SidecarProcess(Mutex::new(Some(child))));
    }
    Err(e) => {
      log::error!("Failed to spawn Bun sidecar: {e}");
      app.manage(SidecarProcess(Mutex::new(None)));
    }
  }
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
    log::info!("Stopped Kevin Bun sidecar");
  }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      maybe_start_sidecar(app)?;

      // Brief yield so sidecar can bind before first WebView fetch (best-effort).
      std::thread::sleep(Duration::from_millis(200));

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
