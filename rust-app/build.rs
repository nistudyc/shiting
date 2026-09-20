fn main() {
    println!("cargo:rerun-if-changed=public");
    #[cfg(feature = "desktop")]
    tauri_build::build();
}
