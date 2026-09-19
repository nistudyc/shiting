use anyhow::{Context, Result};
use ort::{
    session::{Session, SessionInputValue},
    value::{DynValue, Tensor},
};
use serde::Deserialize;
use std::{collections::BTreeMap, path::Path};

#[derive(Deserialize)]
pub struct Generation {
    pub decoder_start_token_id: u32,
    pub eos_token_id: u32,
    pub max_length: usize,
    #[serde(default)]
    pub suppress_tokens: Vec<u32>,
    #[serde(default)]
    pub begin_suppress_tokens: Vec<u32>,
    #[serde(default)]
    pub forced_decoder_ids: Vec<(usize, u32)>,
    pub no_timestamps_token_id: Option<u32>,
    pub pad_token_id: Option<u32>,
}

pub fn session(path: &Path) -> Result<Session> {
    Session::builder()?
        .with_intra_threads(4)?
        .commit_from_file(path)
        .with_context(|| format!("load {}", path.display()))
}

pub fn generate(
    session: &Session,
    hidden: &DynValue,
    mask: Option<&DynValue>,
    config: &Generation,
) -> Result<Vec<u32>> {
    let mut cache = BTreeMap::<String, DynValue>::new();
    for input in &session.inputs {
        if input.name.starts_with("past_key_values.") {
            cache.insert(
                input.name.clone(),
                Tensor::from_array(ndarray::Array4::<f32>::zeros((1, 8, 0, 64)))?.into_dyn(),
            );
        }
    }
    let mut tokens = vec![config.decoder_start_token_id];
    for step in 1..config.max_length.min(512) {
        let last = i64::from(*tokens.last().context("decoder has no start token")?);
        let ids = Tensor::from_array(([1, 1], vec![last]))?.into_dyn();
        let branch = Tensor::from_array(([1], vec![step > 1]))?.into_dyn();
        let mut inputs: Vec<(String, SessionInputValue<'_>)> = vec![
            ("input_ids".into(), ids.view().into()),
            ("encoder_hidden_states".into(), hidden.view().into()),
            ("use_cache_branch".into(), branch.view().into()),
        ];
        if let Some(mask) = mask {
            inputs.push(("encoder_attention_mask".into(), mask.view().into()));
        }
        inputs.extend(
            cache
                .iter()
                .map(|(name, tensor)| (name.clone(), tensor.view().into())),
        );
        let mut output = session.run(inputs)?;
        let next = {
            let logits = output["logits"].try_extract_tensor::<f32>()?;
            let slice = logits.as_slice().context("non-contiguous logits")?;
            let vocab = *logits
                .shape()
                .last()
                .context("missing vocabulary dimension")?;
            let scores = &slice[slice.len() - vocab..];
            choose(scores, config, step)?
        };
        if next == config.eos_token_id {
            break;
        }
        tokens.push(next);
        for (name, tensor) in &mut cache {
            // Merged decoders emit empty encoder KV on cached runs: retain the first result.
            if step > 1 && name.contains(".encoder.") {
                continue;
            }
            let present = name.replacen("past_key_values.", "present.", 1);
            *tensor = output
                .remove(&present)
                .with_context(|| format!("missing {present}"))?;
        }
    }
    Ok(tokens)
}

fn choose(scores: &[f32], config: &Generation, step: usize) -> Result<u32> {
    if let Some((_, token)) = config
        .forced_decoder_ids
        .iter()
        .find(|(position, _)| *position == step)
    {
        return Ok(*token);
    }
    let begin = config
        .forced_decoder_ids
        .iter()
        .map(|(position, _)| *position)
        .max()
        .unwrap_or(0)
        + 1;
    let mut best = None;
    for (index, score) in scores.iter().copied().enumerate() {
        let token = u32::try_from(index)?;
        if !score.is_finite()
            || config.suppress_tokens.contains(&token)
            || (step == begin && config.begin_suppress_tokens.contains(&token))
            || config
                .no_timestamps_token_id
                .is_some_and(|limit| token >= limit)
            || (config.no_timestamps_token_id.is_none() && config.pad_token_id == Some(token))
        {
            continue;
        }
        if best.is_none_or(|(_, previous)| score > previous) {
            best = Some((token, score));
        }
    }
    best.map(|(token, _)| token)
        .context("all decoder candidates were suppressed")
}

#[cfg(test)]
mod tests {
    use super::{Generation, choose};

    fn config() -> Generation {
        Generation {
            decoder_start_token_id: 0,
            eos_token_id: 1,
            max_length: 8,
            suppress_tokens: vec![2],
            begin_suppress_tokens: vec![1],
            forced_decoder_ids: vec![(1, 4)],
            no_timestamps_token_id: Some(4),
            pad_token_id: Some(1),
        }
    }

    #[test]
    fn forced_prefix_precedes_suppression() -> anyhow::Result<()> {
        let config = config();
        let selected = choose(&[0.0, 1.0, 2.0, 3.0, 4.0], &config, 1)?;
        assert_eq!(selected, 4);
        Ok(())
    }

    #[test]
    fn first_text_token_suppresses_eos_and_timestamps() -> anyhow::Result<()> {
        let config = config();
        let selected = choose(&[0.0, 10.0, 20.0, 3.0, 40.0], &config, 2)?;
        assert_eq!(selected, 3);
        Ok(())
    }

    #[test]
    fn later_text_can_end_normally() -> anyhow::Result<()> {
        let config = config();
        let selected = choose(&[0.0, 10.0, 20.0, 3.0, 40.0], &config, 3)?;
        assert_eq!(selected, 1);
        Ok(())
    }
}
