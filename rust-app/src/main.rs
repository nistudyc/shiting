mod api;
mod inference;
mod media;
mod models;
mod security;
mod state;
mod translation;

use anyhow::{Context, Result};
use std::path::PathBuf;

fn runtime_path() -> Result<PathBuf> {
    let executable = std::env::current_exe()?;
    let directory = executable.parent().context("无法定位应用目录")?;
    let bundled = directory.join("../Frameworks/libonnxruntime.1.20.1.dylib");
    Ok(if bundled.exists() {
        bundled
    } else {
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("runtime/libonnxruntime.1.20.1.dylib")
    })
}

fn main() -> Result<()> {
    ort::init_from(runtime_path()?.to_string_lossy()).commit()?;
    let runtime = tokio::runtime::Builder::new_multi_thread()
        .worker_threads(4)
        .enable_all()
        .build()?;
    let app_state = state::AppState::new()?;
    let listener = runtime
        .block_on(tokio::net::TcpListener::bind("127.0.0.1:48765"))
        .context("无法启动本机字幕端口 48765，请检查是否已运行另一份视听")?;
    let router = api::router(app_state);
    if std::env::args().any(|arg| arg == "--serve") {
        println!("PLAYER_READY http://127.0.0.1:48765");
        return runtime.block_on(async {
            axum::serve(listener, router)
                .with_graceful_shutdown(async {
                    if let Err(error) = tokio::signal::ctrl_c().await {
                        eprintln!("停止监听失败：{error}");
                    }
                })
                .await
                .context("本机字幕服务停止")
        });
    }
    #[cfg(feature = "desktop")]
    {
        let service = runtime.spawn(async move { axum::serve(listener, router).await });
        let result = tauri::Builder::default()
            .setup(|app| {
                tauri::WebviewWindowBuilder::new(
                    app,
                    "main",
                    tauri::WebviewUrl::External("http://127.0.0.1:48765/".parse()?),
                )
                .title("视听")
                .inner_size(1280.0, 840.0)
                .min_inner_size(760.0, 520.0)
                .on_navigation(|url| url.origin().ascii_serialization() == "http://127.0.0.1:48765")
                .build()?;
                Ok(())
            })
            .run(tauri::generate_context!());
        service.abort();
        result.context("无法启动视听窗口")
    }
    #[cfg(not(feature = "desktop"))]
    anyhow::bail!("此构建仅提供服务，请使用 --serve")
}
