# 视听 · Shiting

macOS 原生 Liquid Glass 视频播放器，支持 HLS 直播、本机英文语音识别和中英双语字幕。

## 下载

[下载 v2.1.0 安装包](https://github.com/nistudyc/shiting/releases/download/v2.1.0/Shiting-macOS-LiquidGlass-arm64.zip) · [全部版本](https://github.com/nistudyc/shiting/releases)

- **系统要求：Apple Silicon（M 系列）Mac，macOS 26 或更新版本。**
- 解压后打开「视听.app」，也可以将它拖入「应用程序」。
- 安装包采用本机临时签名，尚未进行 Apple Developer ID 签名或公证，其他 Mac 可能显示安全提示。
- 安装包不含模型、API 密钥和观看记录；首次使用字幕需联网下载模型，之后复用本机缓存。

## 使用

1. 启动画面直接粘贴 HTTP(S) HLS 播放地址，或点击「浏览频道」。
2. 顶部「频道」和「设置」都支持搜索选台；设置也可输入新的播放地址。
3. 播放后自动准备双语字幕。英文首轮识别立即显示，中文独立跟译，后续随上下文校正。
4. 底部可暂停、继续、开关字幕和全屏；按 Escape 退出全屏。
5. 设置中可调整外观、字幕语言和背景透明度，查看、导出或清空本次字幕记录。

频道列表包含 70 个去重地址，其中 4 个 DASH/UHD 项标为暂不支持。频道地址可能失效、受地区限制或暂时没有节目，不保证全部可播放；也可以输入自己的播放地址。

## v2.1.0 更新

- 使用 SwiftUI/AppKit 原生按钮、设置和弹窗，采用系统 Liquid Glass；顶部和底部控制区更紧凑。
- Rust 本机服务承担媒体代理、语音识别和翻译，随 App 启停；无需安装 Node.js 或 Electron。
- 修复 BBC HLS 清单刷新时分片地址变化导致的播放错误。
- 修复 WebKit 音轨采集全零问题，通过 HLS 音频片段解码并按播放时间取样。
- 英文不再等待多轮稳定结果；中文更新间隔从 2.4 秒缩短到 1 秒。
- 已在打包 App 中实测 BBC News HD/BBC News、频道切换、双语字幕、暂停/继续、全屏和重开。未逐台验收全部频道。

## 字幕与隐私

默认在本机运行 ONNX Whisper 英文识别和 Marian 英译中，不上传原始音频。模型缓存位于 `~/Library/Application Support/shiting/models/`。

- 识别模型：[onnx-community/whisper-base.en](https://huggingface.co/onnx-community/whisper-base.en)。
- 翻译模型：[Xenova/opus-mt-en-zh](https://huggingface.co/Xenova/opus-mt-en-zh)。
- 可选 Google Cloud Translation 或火山引擎翻译；选择后仅发送待翻译文字，密钥只保存在本次服务内存中，退出后清除。真实云账号调用尚未验收。
- 不请求麦克风或屏幕录制权限。字幕记录只保留本次运行最近 120 条，退出后不保存。

识别和翻译存在延迟，处理速度随语音长度和机器负载变化；本机实测曾显示单次识别 0.4 秒，这不是端到端字幕延迟保证。人名、口音、数字和背景音乐可能影响准确性，持续语音会校正文字，积压时可能跳过旧音频。

当前支持英语识别、简体中文翻译及公网 HTTP(S) HLS，不支持 DRM 解密和 DASH 播放。

## 源码构建

新版源码位于 [`rust-app/`](rust-app/)。仓库根目录的 Electron 实现保留作为历史版本。

需要 Rust（支持 edition 2024）、macOS Apple Silicon 和支持 Liquid Glass 的 Swift/macOS SDK。当前打包脚本使用 Command Line Tools 中的 macOS 26.5 SDK；使用其他 SDK 时调整脚本的 `-sdk` 路径。macOS 27 SDK 的 SwiftUI 宏需要匹配的编译插件。

准备官方 ONNX Runtime 1.20.1：

```sh
cd rust-app
mkdir -p runtime
curl -fL https://github.com/microsoft/onnxruntime/releases/download/v1.20.1/onnxruntime-osx-arm64-1.20.1.tgz -o runtime/onnxruntime.tgz
tar -xzf runtime/onnxruntime.tgz -C runtime
cp runtime/onnxruntime-osx-arm64-1.20.1/lib/libonnxruntime.1.20.1.dylib runtime/
cp runtime/onnxruntime-osx-arm64-1.20.1/LICENSE runtime/ONNXRUNTIME-LICENSE
sh scripts/package-native.sh
```

产物：`rust-app/dist/视听.app` 和 `rust-app/dist/Shiting-macOS-LiquidGlass-arm64.zip`。原生 App 版本为 2.1.0，内部 Rust 服务包版本仍为 2.0.0。

测试：

```sh
cd rust-app
cargo test --locked --no-default-features
node --test tests/*.test.mjs
```

Chrome 扩展源码位于 `rust-app/extension/`，仍待真实浏览器联调，本次 Release 不分发扩展。第三方依赖与模型遵循各自许可证，App 内保留 ONNX Runtime 许可。
