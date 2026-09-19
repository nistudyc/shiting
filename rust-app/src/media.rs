use crate::state::AppState;
use anyhow::{Context, Result};
use axum::{
    body::Body,
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
};
use std::{
    collections::{BTreeMap, HashMap},
    net::IpAddr,
};
use url::Url;

#[derive(Default)]
pub struct Media {
    pub source: Option<Url>,
    urls: HashMap<String, Url>,
    reverse: HashMap<Url, (String, u64)>,
    recent: BTreeMap<u64, Url>,
    sequence: u64,
}

pub fn parse_source(text: &str) -> Result<Url> {
    let url = Url::parse(text)?;
    anyhow::ensure!(
        matches!(url.scheme(), "https" | "http")
            && url.username().is_empty()
            && url.password().is_none()
            && text.len() <= 4096,
        "请输入有效的 HTTP(S) 地址"
    );
    Ok(url)
}

pub fn is_youtube(url: &Url) -> bool {
    matches!(
        url.host_str(),
        Some(
            "youtube.com" | "www.youtube.com" | "m.youtube.com" | "music.youtube.com" | "youtu.be"
        )
    )
}

pub async fn open_youtube(url: &Url) -> Result<()> {
    anyhow::ensure!(
        is_youtube(url) && url.scheme() == "https",
        "仅允许打开 HTTPS YouTube 页面"
    );
    let status = std::process::Command::new("/usr/bin/open")
        .args(["-a", "Google Chrome", url.as_str()])
        .status()?;
    anyhow::ensure!(
        status.success(),
        "无法打开 Chrome，请确认已安装 Google Chrome"
    );
    Ok(())
}

fn public_address(address: IpAddr) -> bool {
    match address {
        IpAddr::V4(ip) => {
            let [a, b, _, _] = ip.octets();
            !(ip.is_private()
                || ip.is_loopback()
                || ip.is_link_local()
                || ip.is_broadcast()
                || ip.is_documentation()
                || a == 0
                || a >= 224
                || a == 100 && (64..128).contains(&b))
        }
        IpAddr::V6(ip) => match ip.to_ipv4_mapped() {
            Some(v4) => public_address(IpAddr::V4(v4)),
            None => {
                !(ip.is_loopback()
                    || ip.is_unspecified()
                    || ip.is_multicast()
                    || (ip.segments()[0] & 0xfe00) == 0xfc00
                    || (ip.segments()[0] & 0xffc0) == 0xfe80)
            }
        },
    }
}

async fn fetch(url: Url, headers: &HeaderMap) -> Result<(reqwest::Response, Url)> {
    let mut target = url;
    for _ in 0..5 {
        let host = target.host_str().context("地址缺少主机")?;
        let addresses: Vec<_> =
            tokio::net::lookup_host((host, target.port_or_known_default().context("无效端口")?))
                .await?
                .collect();
        anyhow::ensure!(
            !addresses.is_empty() && addresses.iter().all(|address| public_address(address.ip())),
            "只支持公网视频地址"
        );
        let client = reqwest::Client::builder()
            .resolve_to_addrs(host, &addresses)
            .redirect(reqwest::redirect::Policy::none())
            .timeout(std::time::Duration::from_secs(25))
            .build()?;
        let mut request = client.get(target.clone());
        if let Some(range) = headers.get("range") {
            request = request.header("range", range);
        }
        let response = request.send().await?;
        if response.status().is_redirection() {
            let next = response
                .headers()
                .get("location")
                .context("重定向缺少地址")?
                .to_str()?;
            target = parse_source(target.join(next)?.as_str())?;
            continue;
        }
        return Ok((response.error_for_status()?, target));
    }
    anyhow::bail!("播放源重定向过多")
}

impl Media {
    pub fn set(&mut self, url: Url) {
        self.source = Some(url);
        self.urls.clear();
        self.reverse.clear();
        self.recent.clear();
        self.sequence = 0;
    }
    fn register(&mut self, text: &str, base: &Url) -> Result<String> {
        let url = base.join(text)?;
        self.sequence += 1;
        if let Some((id, touched)) = self.reverse.get_mut(&url) {
            self.recent.remove(touched);
            *touched = self.sequence;
            self.recent.insert(*touched, url);
            return Ok(format!("/media/item/{id}"));
        }
        if self.urls.len() >= 12000
            && let Some((_, oldest)) = self.recent.pop_first()
            && let Some((id, _)) = self.reverse.remove(&oldest)
        {
            self.urls.remove(&id);
        }
        let id = uuid::Uuid::new_v4().to_string();
        self.reverse
            .insert(url.clone(), (id.clone(), self.sequence));
        self.recent.insert(self.sequence, url.clone());
        self.urls.insert(id.clone(), url);
        Ok(format!("/media/item/{id}"))
    }
    fn rewrite(&mut self, body: &str, base: &Url) -> Result<String> {
        anyhow::ensure!(
            body.trim_start().starts_with("#EXTM3U"),
            "地址返回的内容不是 HLS 播放清单"
        );
        let regex = regex::Regex::new(r#"URI="([^"]+)""#)?;
        let mut lines = Vec::new();
        for line in body.lines() {
            if line.trim().is_empty() {
                lines.push(String::new());
            } else if line.starts_with('#') {
                let mut result = line.to_owned();
                for capture in regex.captures_iter(line) {
                    let value = capture.get(1).context("无效播放清单 URI")?.as_str();
                    result = result.replace(
                        &format!("URI=\"{value}\""),
                        &format!("URI=\"{}\"", self.register(value, base)?),
                    );
                }
                lines.push(result);
            } else {
                lines.push(self.register(line.trim(), base)?);
            }
        }
        Ok(lines.join("\n"))
    }
}

pub async fn serve(state: &AppState, path: &str, headers: &HeaderMap) -> Result<Response> {
    let address = {
        let media = state.media.read().await;
        if path == "main.m3u8" {
            media.source.clone()
        } else {
            media.urls.get(path.trim_start_matches("item/")).cloned()
        }
    }
    .context("请先载入播放源，或重新载入已过期的片段")?;
    let (response, url) = fetch(address, headers).await?;
    let content_type = response
        .headers()
        .get("content-type")
        .and_then(|value| value.to_str().ok())
        .unwrap_or("application/octet-stream")
        .to_owned();
    if path == "main.m3u8" || url.path().ends_with(".m3u8") || content_type.contains("mpegurl") {
        let body = response.text().await?;
        let playlist = state.media.write().await.rewrite(&body, &url)?;
        return Ok((
            [
                ("content-type", "application/vnd.apple.mpegurl"),
                ("cache-control", "no-store"),
            ],
            playlist,
        )
            .into_response());
    }
    let status = StatusCode::from_u16(response.status().as_u16())?;
    let mut builder = Response::builder()
        .status(status)
        .header("content-type", content_type)
        .header("cache-control", "no-store");
    for name in ["content-range", "accept-ranges", "content-length"] {
        if let Some(value) = response.headers().get(name) {
            builder = builder.header(name, value);
        }
    }
    Ok(builder.body(Body::from_stream(response.bytes_stream()))?)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn repeated_live_playlist_keeps_segment_addresses() -> Result<()> {
        let mut media = Media::default();
        let base = Url::parse("https://example.com/live/index.m3u8")?;
        let playlist = format!(
            "#EXTM3U\n{}",
            (0..1875)
                .map(|i| format!("{i}.ts"))
                .collect::<Vec<_>>()
                .join("\n")
        );
        let first = media.rewrite(&playlist, &base)?;
        for _ in 0..8 {
            assert!(
                media.rewrite(&playlist, &base)? == first,
                "playlist refresh changed segment addresses"
            );
        }
        assert_eq!(media.urls.len(), 1875);
        Ok(())
    }
    #[test]
    fn capacity_evicts_old_segments_without_clearing_recent_ones() -> Result<()> {
        let mut media = Media::default();
        let base = Url::parse("https://example.com/live/index.m3u8")?;
        for i in 0..12000 {
            media.register(&format!("{i}.ts"), &base)?;
        }
        let recent = media.register("11999.ts", &base)?;
        media.register("12000.ts", &base)?;
        assert!(
            media
                .urls
                .contains_key(recent.trim_start_matches("/media/item/"))
        );
        assert_eq!(media.urls.len(), 12000);
        Ok(())
    }
    #[test]
    fn youtube_routes_only_real_hosts() -> Result<()> {
        assert!(is_youtube(&parse_source("https://youtu.be/abc")?));
        assert!(!is_youtube(&parse_source(
            "https://youtube.com.evil.test/watch"
        )?));
        assert!(parse_source("file:///etc/passwd").is_err());
        Ok(())
    }
    #[test]
    fn playlist_rewrites_segments_and_keys() -> Result<()> {
        let mut media = Media::default();
        let body = media.rewrite(
            "#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI=\"key\"\nsegment.ts",
            &Url::parse("https://example.com/live/index.m3u8")?,
        )?;
        assert_eq!(media.urls.len(), 2);
        assert!(body.contains("URI=\"/media/item/"));
        assert!(!body.contains("segment.ts"));
        Ok(())
    }
}
