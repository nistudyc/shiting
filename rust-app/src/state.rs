use crate::inference::Engine;
use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::{
    path::PathBuf,
    sync::{Arc, Mutex},
};
use tokio::sync::RwLock;

#[derive(Clone, Copy, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Provider {
    #[default]
    Local,
    Google,
    Volcano,
}

#[derive(Clone, Debug, Serialize)]
pub struct Status {
    pub phase: &'static str,
    pub message: String,
    pub file: String,
    pub progress: u8,
}

#[derive(Clone, Default)]
pub struct Credentials {
    pub google: String,
    pub ak: String,
    pub sk: String,
}

#[derive(Clone)]
pub struct AppState {
    pub token: Arc<String>,
    pub root: Arc<PathBuf>,
    pub status: Arc<RwLock<Status>>,
    pub engine: Arc<Mutex<Option<Engine>>>,
    pub preparing: Arc<tokio::sync::Mutex<()>>,
    pub has_translation: Arc<std::sync::atomic::AtomicBool>,
    pub credentials: Arc<RwLock<Credentials>>,
    pub media: Arc<RwLock<crate::media::Media>>,
    pub client: reqwest::Client,
}

impl AppState {
    pub fn new() -> Result<Self> {
        let root = dirs::data_dir()
            .context("无法定位应用数据目录")?
            .join("shiting/models");
        Ok(Self {
            token: Arc::new(uuid::Uuid::new_v4().to_string()),
            root: Arc::new(root),
            status: Arc::new(RwLock::new(Status {
                phase: "idle",
                message: "首次开启会下载本机模型".into(),
                file: String::new(),
                progress: 0,
            })),
            engine: Arc::new(Mutex::new(None)),
            preparing: Arc::default(),
            has_translation: Arc::default(),
            credentials: Arc::default(),
            media: Arc::default(),
            client: reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(120))
                .build()?,
        })
    }
}
