mod decoder;
mod mel;

use anyhow::{Context, Result, ensure};
use decoder::Generation;
use ort::{session::Session, value::Tensor};
use std::path::Path;
use tokenizers::Tokenizer;

struct Model {
    encoder: Session,
    decoder: Session,
    tokenizer: Tokenizer,
    generation: Generation,
}

impl Model {
    fn load(root: &Path) -> Result<Self> {
        let config = root.join("generation_config.json");
        let generation = serde_json::from_slice(&std::fs::read(config)?)?;
        let mut tokenizer_json: serde_json::Value =
            serde_json::from_slice(&std::fs::read(root.join("tokenizer.json"))?)?;
        // Xenova exports omit the SentencePiece charsmap; preserve its documented NFKC fallback.
        if tokenizer_json["normalizer"]["type"] == "Precompiled"
            && tokenizer_json["normalizer"]["precompiled_charsmap"].is_null()
        {
            tokenizer_json["normalizer"] = serde_json::json!({"type": "NFKC"});
        }
        let tokenizer = Tokenizer::from_bytes(serde_json::to_vec(&tokenizer_json)?)
            .map_err(|error| anyhow::anyhow!("load tokenizer: {error}"))?;
        Ok(Self {
            encoder: decoder::session(&root.join("onnx/encoder_model_quantized.onnx"))?,
            decoder: decoder::session(&root.join("onnx/decoder_model_merged_quantized.onnx"))?,
            tokenizer,
            generation,
        })
    }

    fn decode(&self, ids: &[u32]) -> Result<String> {
        self.tokenizer
            .decode(ids, true)
            .map(|text| text.trim().to_owned())
            .map_err(|error| anyhow::anyhow!("decode tokenizer: {error}"))
    }
}

pub struct Engine {
    whisper: Model,
    marian: Option<Model>,
}

impl Engine {
    pub fn load(root: &Path, translation: bool) -> Result<Self> {
        Ok(Self {
            whisper: Model::load(&root.join("onnx-community/whisper-base.en"))?,
            marian: if translation {
                Some(Model::load(&root.join("Xenova/opus-mt-en-zh"))?)
            } else {
                None
            },
        })
    }

    pub fn recognize(&mut self, audio: &[f32]) -> Result<String> {
        ensure!(
            !audio.is_empty() && audio.len() <= 480_000,
            "audio must contain 1–480000 mono 16 kHz samples"
        );
        ensure!(
            audio.iter().all(|sample| sample.is_finite()),
            "non-finite PCM samples"
        );
        if audio.iter().map(|sample| sample * sample).sum::<f32>() / (audio.len() as f32) < 1e-8 {
            return Ok(String::new());
        }
        let features = Tensor::from_array(([1, 80, 3000], mel::log_mel(audio)))?;
        let output = self
            .whisper
            .encoder
            .run(ort::inputs!["input_features" => features]?)?;
        let tokens = decoder::generate(
            &self.whisper.decoder,
            &output["last_hidden_state"],
            None,
            &self.whisper.generation,
        )?;
        self.whisper.decode(&tokens)
    }

    pub fn translate(&mut self, text: &str) -> Result<String> {
        if text.trim().is_empty() {
            return Ok(String::new());
        }
        let model = self
            .marian
            .as_ref()
            .context("translation model was not loaded")?;
        let encoding = model
            .tokenizer
            .encode(text, true)
            .map_err(|error| anyhow::anyhow!("encode: {error}"))?;
        ensure!(
            encoding.len() <= 512,
            "translation input exceeds 512 tokens"
        );
        let ids: Vec<i64> = encoding.get_ids().iter().copied().map(i64::from).collect();
        let mask = Tensor::from_array(([1, ids.len()], vec![1_i64; ids.len()]))?.into_dyn();
        let input = Tensor::from_array(([1, ids.len()], ids))?;
        let output = model.encoder.run(vec![
            ("input_ids", ort::session::SessionInputValue::from(input)),
            ("attention_mask", mask.view().into()),
        ])?;
        let tokens = decoder::generate(
            &model.decoder,
            &output["last_hidden_state"],
            Some(&mask),
            &model.generation,
        )?;
        model.decode(&tokens)
    }
}
