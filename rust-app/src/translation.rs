use crate::state::{AppState, Credentials, Provider};
use anyhow::{Context, Result};
use hmac::{Hmac, Mac};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

#[derive(Serialize)]
struct GoogleRequest<'a> {
    q: &'a str,
    source: &'static str,
    target: &'static str,
    format: &'static str,
}
#[derive(Deserialize)]
struct GoogleResponse {
    data: GoogleData,
}
#[derive(Deserialize)]
struct GoogleData {
    translations: Vec<GoogleTranslation>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GoogleTranslation {
    translated_text: String,
}
#[derive(Serialize)]
#[serde(rename_all = "PascalCase")]
struct VolcanoRequest<'a> {
    source_language: &'static str,
    target_language: &'static str,
    text_list: [&'a str; 1],
}
#[derive(Deserialize)]
#[serde(rename_all = "PascalCase")]
struct VolcanoResponse {
    translation_list: Vec<VolcanoTranslation>,
}
#[derive(Deserialize)]
#[serde(rename_all = "PascalCase")]
struct VolcanoTranslation {
    translation: String,
}

pub async fn translate(state: AppState, provider: Provider, text: String) -> Result<String> {
    let credentials = state.credentials.read().await.clone();
    match provider {
        Provider::Local => crate::models::translate(state, text).await,
        Provider::Google => {
            anyhow::ensure!(!credentials.google.is_empty(), "请先设置 Google API Key");
            let result: GoogleResponse = state
                .client
                .post("https://translation.googleapis.com/language/translate/v2")
                .timeout(std::time::Duration::from_secs(15))
                .header("X-Goog-Api-Key", &credentials.google)
                .json(&GoogleRequest {
                    q: &text,
                    source: "en",
                    target: "zh-CN",
                    format: "text",
                })
                .send()
                .await?
                .error_for_status()?
                .json()
                .await?;
            Ok(result
                .data
                .translations
                .into_iter()
                .next()
                .context("Google 返回空翻译")?
                .translated_text)
        }
        Provider::Volcano => volcano(&state, &credentials, &text).await,
    }
}

fn hmac(key: &[u8], message: &str) -> Result<Vec<u8>> {
    let mut mac = Hmac::<Sha256>::new_from_slice(key)?;
    mac.update(message.as_bytes());
    Ok(mac.finalize().into_bytes().to_vec())
}

async fn volcano(state: &AppState, credentials: &Credentials, text: &str) -> Result<String> {
    anyhow::ensure!(
        !credentials.ak.is_empty() && !credentials.sk.is_empty(),
        "请先设置火山 AK/SK"
    );
    let body = serde_json::to_string(&VolcanoRequest {
        source_language: "en",
        target_language: "zh",
        text_list: [text],
    })?;
    let format = time::macros::format_description!("[year][month][day]T[hour][minute][second]Z");
    let date = time::OffsetDateTime::now_utc().format(format)?;
    let day = date.get(..8).context("日期格式异常")?;
    let hash = hex::encode(Sha256::digest(body.as_bytes()));
    let headers = "content-type;host;x-content-sha256;x-date";
    let scope = format!("{day}/cn-north-1/translate/request");
    let canonical = format!(
        "POST\n/\nAction=TranslateText&Version=2020-06-01\ncontent-type:application/json\nhost:translate.volcengineapi.com\nx-content-sha256:{hash}\nx-date:{date}\n\n{headers}\n{hash}"
    );
    let to_sign = format!(
        "HMAC-SHA256\n{date}\n{scope}\n{}",
        hex::encode(Sha256::digest(canonical.as_bytes()))
    );
    let key = hmac(credentials.sk.as_bytes(), day)?;
    let key = hmac(&key, "cn-north-1")?;
    let key = hmac(&key, "translate")?;
    let key = hmac(&key, "request")?;
    let signature = hex::encode(hmac(&key, &to_sign)?);
    let authorization = format!(
        "HMAC-SHA256 Credential={}/{scope}, SignedHeaders={headers}, Signature={signature}",
        credentials.ak
    );
    let result: VolcanoResponse = state
        .client
        .post("https://translate.volcengineapi.com/?Action=TranslateText&Version=2020-06-01")
        .timeout(std::time::Duration::from_secs(15))
        .header("Content-Type", "application/json")
        .header("X-Date", date)
        .header("X-Content-Sha256", hash)
        .header("Authorization", authorization)
        .body(body)
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;
    Ok(result
        .translation_list
        .into_iter()
        .next()
        .context("火山返回空翻译")?
        .translation)
}
