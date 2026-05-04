use std::fs;
use std::path::PathBuf;

fn main() {
  let triple = std::env::var("TARGET").unwrap_or_else(|_| "unknown".to_string());
  println!("cargo:rustc-env=KEVIN_TARGET_TRIPLE={triple}");

  // Tauri validates `externalBin` paths during *every* build. Ship a 0-byte placeholder
  // until `npm run build:sidecar` (see `beforeBuildCommand`) produces the real binary.
  let manifest_dir = PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").unwrap());
  let mut name = format!("kevin-sidecar-{triple}");
  if std::env::var("CARGO_CFG_TARGET_OS").unwrap_or_default() == "windows" {
    name.push_str(".exe");
  }
  let bin = manifest_dir.join("binaries").join(&name);
  if let Some(parent) = bin.parent() {
    fs::create_dir_all(parent).expect("create binaries dir");
  }
  if !bin.exists() {
    fs::write(&bin, []).expect("write sidecar placeholder");
    #[cfg(unix)]
    {
      use std::os::unix::fs::PermissionsExt;
      let mut perms = fs::metadata(&bin).expect("metadata").permissions();
      perms.set_mode(0o755);
      fs::set_permissions(&bin, perms).expect("chmod sidecar placeholder");
    }
  }

  tauri_build::build()
}
