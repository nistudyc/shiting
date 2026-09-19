use crate::{
    media,
    state::{AppState, Provider},
    translation,
};
use anyhow::Context;
use axum::{
    Json, Router,
    body::Body,
    extract::{DefaultBodyLimit, Path, Query, State},
    http::{HeaderMap, StatusCode},
    middleware,
    response::{IntoResponse, Response},
    routing::{get, post},
};
use serde::Deserialize;
use serde_json::json;

macro_rules! ensure_api {
    ($condition:expr, $message:expr) => {
        if !$condition {
            return Err(ApiError(anyhow::anyhow!($message)));
        }
    };
}

static ASSETS: include_dir::Dir<'_> = include_dir::include_dir!("$CARGO_MANIFEST_DIR/public");
pub struct ApiError(anyhow::Error);
impl<E: Into<anyhow::Error>> From<E> for ApiError {
    fn from(error: E) -> Self {
        Self(error.into())
    }
}
impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        (
            StatusCode::BAD_REQUEST,
            Json(json!({"error": self.0.to_string()})),
        )
            .into_response()
    }
}
type ApiResult = std::result::Result<Json<serde_json::Value>, ApiError>;
#[derive(Deserialize)]
struct ProviderQuery {
    #[serde(default)]
    provider: Provider,
}
#[derive(Deserialize)]
struct Source {
    url: String,
}
#[derive(Deserialize)]
struct Text {
    text: String,
}
#[derive(Deserialize)]
#[serde(tag = "provider", rename_all = "lowercase")]
enum Config {
    Google { key: String },
    Volcano { ak: String, sk: String },
}

pub fn router(state: AppState) -> Router {
    Router::new()
        .route("/api/source", get(source).post(set_source))
        .route("/api/config", get(config).post(set_config))
        .route("/api/status", get(status))
        .route("/api/prepare", post(prepare))
        .route("/api/transcribe", post(transcribe))
        .route("/api/translate", post(translate))
        .route("/api/pairing", get(pairing))
        .route("/media/{*path}", get(serve_media))
        .route("/", get(index))
        .route("/{*path}", get(asset))
        .layer(DefaultBodyLimit::max(1_024_000))
        .layer(middleware::from_fn_with_state(
            state.clone(),
            crate::security::security,
        ))
        .with_state(state)
}

async fn source(State(state): State<AppState>) -> ApiResult {
    Ok(Json(
        json!({"url":state.media.read().await.source.as_ref().map_or("", url::Url::as_str)}),
    ))
}
async fn set_source(State(state): State<AppState>, Json(input): Json<Source>) -> ApiResult {
    let url = media::parse_source(&input.url)?;
    if media::is_youtube(&url) {
        media::open_youtube(&url).await?;
        return Ok(Json(json!({"ok":true,"kind":"youtube"})));
    }
    state.media.write().await.set(url);
    Ok(Json(json!({"ok":true,"kind":"hls"})))
}
async fn config(State(state): State<AppState>) -> ApiResult {
    let credentials = state.credentials.read().await;
    Ok(Json(
        json!({"googleConfigured":!credentials.google.is_empty(),"volcanoConfigured":!credentials.ak.is_empty() && !credentials.sk.is_empty()}),
    ))
}
async fn set_config(State(state): State<AppState>, Json(input): Json<Config>) -> ApiResult {
    let mut credentials = state.credentials.write().await;
    match input {
        Config::Google { key } => {
            ensure_api!(
                (20..=256).contains(&key.len()) && !key.chars().any(char::is_whitespace),
                "请输入有效 Google Key"
            );
            credentials.google = key;
        }
        Config::Volcano { ak, sk } => {
            ensure_api!(
                (10..=256).contains(&ak.len()) && (10..=256).contains(&sk.len()),
                "请输入有效火山 AK/SK"
            );
            credentials.ak = ak;
            credentials.sk = sk;
        }
    }
    Ok(Json(json!({"ok":true})))
}
async fn status(State(state): State<AppState>) -> ApiResult {
    Ok(Json(serde_json::to_value(
        state.status.read().await.clone(),
    )?))
}
async fn prepare(State(state): State<AppState>, Query(query): Query<ProviderQuery>) -> ApiResult {
    crate::models::prepare(state.clone(), query.provider).await?;
    status(State(state)).await
}
async fn transcribe(
    State(state): State<AppState>,
    headers: HeaderMap,
    body: bytes::Bytes,
) -> ApiResult {
    ensure_api!(
        headers.get("content-type").and_then(|h| h.to_str().ok())
            == Some("application/octet-stream"),
        "需要 PCM 音频"
    );
    ensure_api!(
        (64_000..=1_024_000).contains(&body.len()) && body.len().is_multiple_of(4),
        "无效音频长度"
    );
    let audio: Vec<f32> = body
        .as_chunks::<4>()
        .0
        .iter()
        .copied()
        .map(f32::from_le_bytes)
        .collect();
    ensure_api!(
        audio
            .iter()
            .all(|sample| sample.is_finite() && sample.abs() <= 2.0),
        "无效音频数据"
    );
    let en = crate::models::recognize(state, audio).await?;
    Ok(Json(json!({"en":en})))
}
async fn translate(
    State(state): State<AppState>,
    Query(query): Query<ProviderQuery>,
    Json(input): Json<Text>,
) -> ApiResult {
    ensure_api!(
        !input.text.trim().is_empty() && input.text.len() <= 8192,
        "翻译文字为空或过长"
    );
    let zh = translation::translate(state, query.provider, input.text).await?;
    Ok(Json(json!({"zh":zh})))
}
async fn pairing(State(state): State<AppState>) -> ApiResult {
    Ok(Json(json!({"token":*state.token})))
}
async fn serve_media(
    State(state): State<AppState>,
    Path(path): Path<String>,
    headers: HeaderMap,
) -> std::result::Result<Response, ApiError> {
    Ok(media::serve(&state, &path, &headers).await?)
}
async fn index(State(state): State<AppState>) -> std::result::Result<Response, ApiError> {
    let html = ASSETS
        .get_file("index.html")
        .and_then(|file| file.contents_utf8())
        .context("缺少应用界面")?;
    let token = serde_json::to_string(state.token.as_str())?;
    let html = html.replace(
        "<head>",
        &format!("<head><script>window.SHITING_TOKEN={token};</script>"),
    );
    Ok(([("content-type", "text/html; charset=utf-8")], html).into_response())
}
async fn asset(Path(path): Path<String>) -> Response {
    let Some(file) = ASSETS.get_file(&path) else {
        return StatusCode::NOT_FOUND.into_response();
    };
    let mime = if path.ends_with(".js") {
        "text/javascript"
    } else if path.ends_with(".css") {
        "text/css"
    } else {
        "application/octet-stream"
    };
    (
        [("content-type", mime)],
        Body::from(file.contents().to_vec()),
    )
        .into_response()
}
