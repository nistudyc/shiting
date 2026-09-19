use crate::state::AppState;
use axum::{
    Json,
    extract::{Request, State},
    http::{Method, StatusCode, header},
    middleware::Next,
    response::{IntoResponse, Response},
};
use serde_json::json;

pub async fn security(State(state): State<AppState>, request: Request, next: Next) -> Response {
    let headers = request.headers();
    if headers.get("host").and_then(|h| h.to_str().ok()) != Some("127.0.0.1:48765") {
        return StatusCode::FORBIDDEN.into_response();
    }
    let origin = headers
        .get("origin")
        .and_then(|h| h.to_str().ok())
        .unwrap_or("");
    let extension = origin.starts_with("chrome-extension://")
        && origin.trim_start_matches("chrome-extension://").len() == 32;
    if !origin.is_empty() && origin != "http://127.0.0.1:48765" && !extension {
        return StatusCode::FORBIDDEN.into_response();
    }
    if extension && request.uri().path() == "/api/pairing" {
        return StatusCode::FORBIDDEN.into_response();
    }
    let origin = origin.to_owned();
    if request.method() == Method::OPTIONS {
        return cors(StatusCode::NO_CONTENT.into_response(), &origin);
    }
    if request.uri().path().starts_with("/api/") {
        let expected = format!("Bearer {}", state.token);
        if headers
            .get(header::AUTHORIZATION)
            .and_then(|h| h.to_str().ok())
            != Some(expected.as_str())
        {
            return cors(
                (
                    StatusCode::UNAUTHORIZED,
                    Json(json!({"error":"配对码无效，请从视听设置重新复制"})),
                )
                    .into_response(),
                &origin,
            );
        }
    } else if extension {
        return StatusCode::FORBIDDEN.into_response();
    }
    let mut response = next.run(request).await;
    response.headers_mut().insert(
        "x-content-type-options",
        header::HeaderValue::from_static("nosniff"),
    );
    response.headers_mut().insert(
        "cache-control",
        header::HeaderValue::from_static("no-store"),
    );
    response
        .headers_mut()
        .insert("x-frame-options", header::HeaderValue::from_static("DENY"));
    cors(response, &origin)
}

fn cors(mut response: Response, origin: &str) -> Response {
    if origin.starts_with("chrome-extension://") {
        if let Ok(value) = header::HeaderValue::from_str(origin) {
            response
                .headers_mut()
                .insert("access-control-allow-origin", value);
        }
        response.headers_mut().insert(
            "access-control-allow-headers",
            header::HeaderValue::from_static("authorization, content-type"),
        );
        response.headers_mut().insert(
            "access-control-allow-methods",
            header::HeaderValue::from_static("GET, POST, OPTIONS"),
        );
        response.headers_mut().insert(
            "access-control-allow-private-network",
            header::HeaderValue::from_static("true"),
        );
        response
            .headers_mut()
            .insert("vary", header::HeaderValue::from_static("Origin"));
    }
    response
}
