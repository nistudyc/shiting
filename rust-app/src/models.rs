use crate::{
    inference::Engine,
    state::{AppState, Provider},
};
use anyhow::{Context, Result};
use futures_util::StreamExt;
use std::sync::atomic::Ordering;
use tokio::io::AsyncWriteExt;

const SPEECH: &str = "onnx-community/whisper-base.en";
const TRANSLATION: &str = "Xenova/opus-mt-en-zh";
const FILES: &[&str] = &[
    "config.json",
    "tokenizer.json",
    "tokenizer_config.json",
    "generation_config.json",
    "onnx/encoder_model_quantized.onnx",
    "onnx/decoder_model_merged_quantized.onnx",
];

pub async fn prepare(state: AppState, provider: Provider) -> Result<()> {
    let _guard = state.preparing.lock().await;
    let translation =
        matches!(provider, Provider::Local) || state.has_translation.load(Ordering::Relaxed);
    if state.status.read().await.phase == "ready"
        && (!translation || state.has_translation.load(Ordering::Relaxed))
    {
        return Ok(());
    }
    {
        let mut status = state.status.write().await;
        status.phase = "loading";
        status.message = "正在准备本机字幕模型…".into();
    }
    let result = async {
        download(&state, SPEECH).await?;
        if translation {
            download(&state, TRANSLATION).await?;
        }
        let root = std::sync::Arc::clone(&state.root);
        let engine =
            tokio::task::spawn_blocking(move || Engine::load(&root, translation)).await??;
        *state
            .engine
            .lock()
            .map_err(|_| anyhow::anyhow!("推理服务状态异常"))? = Some(engine);
        state.has_translation.store(translation, Ordering::Relaxed);
        Ok::<(), anyhow::Error>(())
    }
    .await;
    let mut status = state.status.write().await;
    status.file.clear();
    match &result {
        Ok(()) => {
            status.phase = "ready";
            status.message = "本机模型已就绪".into();
            status.progress = 100;
        }
        Err(error) => {
            status.phase = "error";
            status.message = format!("模型准备失败：{error}");
        }
    }
    result
}

async fn download(state: &AppState, model: &str) -> Result<()> {
    for file in FILES {
        let destination = state.root.join(model).join(file);
        if tokio::fs::metadata(&destination)
            .await
            .is_ok_and(|meta| meta.len() > 0)
        {
            continue;
        }
        tokio::fs::create_dir_all(destination.parent().context("无效模型目录")?).await?;
        let temporary = destination.with_extension("partial");
        let response = state
            .client
            .get(format!(
                "https://huggingface.co/{model}/resolve/main/{file}"
            ))
            .send()
            .await?
            .error_for_status()?;
        let total = response.content_length().unwrap_or(0);
        let mut stream = response.bytes_stream();
        let mut output = tokio::fs::File::create(&temporary).await?;
        let mut downloaded = 0_u64;
        while let Some(chunk) = stream.next().await {
            let chunk = chunk?;
            output.write_all(&chunk).await?;
            downloaded += u64::try_from(chunk.len())?;
            let mut status = state.status.write().await;
            status.file = format!("{model}/{file}");
            status.progress = u8::try_from(
                downloaded
                    .saturating_mul(100)
                    .checked_div(total)
                    .unwrap_or(0)
                    .min(100),
            )?;
        }
        output.flush().await?;
        if downloaded == 0 || total > 0 && downloaded != total {
            anyhow::bail!("模型下载不完整，请重试");
        }
        tokio::fs::rename(temporary, destination).await?;
    }
    Ok(())
}

pub async fn recognize(state: AppState, audio: Vec<f32>) -> Result<String> {
    tokio::task::spawn_blocking(move || {
        let mut guard = state
            .engine
            .lock()
            .map_err(|_| anyhow::anyhow!("推理服务状态异常"))?;
        guard.as_mut().context("模型尚未就绪")?.recognize(&audio)
    })
    .await?
}

pub async fn translate(state: AppState, text: String) -> Result<String> {
    tokio::task::spawn_blocking(move || {
        let mut guard = state
            .engine
            .lock()
            .map_err(|_| anyhow::anyhow!("推理服务状态异常"))?;
        guard.as_mut().context("模型尚未就绪")?.translate(&text)
    })
    .await?
}
