# 视听原生 App

这是 v2.1.0 的 SwiftUI/AppKit + Rust 实现。下载、使用、系统要求、模型和构建说明见[仓库 README](../README.md)。

- `native/`：macOS Liquid Glass 操作界面。
- `src/`：本机媒体服务、ONNX 识别与翻译。
- `public/`：WebKit 视频播放、音轨解码和字幕。
- `scripts/package-native.sh`：原生 App 打包入口。
- `tests/`：音频时间线和字幕回归测试。
- `extension/`：尚未完成真实浏览器验收的 Chrome 扩展。

`cargo` 默认启用历史 Tauri 桌面入口。原生 SwiftUI 版打包时使用 `--no-default-features` 构建后台服务。
