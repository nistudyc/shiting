# 视听 · Shiting

视频优先的 macOS HLS 播放器，提供本机 ONNX 英文识别与中英双语字幕。设置和字幕记录收在右侧面板，支持全屏、字幕背景透明度和系统深浅色。

**不提供任何频道或播放链接；打开应用后自行添加有权访问的公网 HLS 地址。安装包不包含模型、API 密钥或观看记录。**

## 下载与使用

从 [Releases](https://github.com/nistudyc/shiting/releases) 下载 `Shiting-macOS-arm64.zip`，解压并将「视听.app」放入「应用程序」。当前版本适用于 Apple Silicon（M 系列）Mac，不包含 Intel 版本。应用采用本机临时签名，尚未经过 Apple Developer ID 签名或公证，其他 Mac 可能被 Gatekeeper 阻止。

1. 打开「设置」，粘贴 HLS `.m3u8` 地址，点击「载入并播放」。
2. 点击「开启字幕」。首次使用联网下载模型并显示进度，以后复用本机缓存。
3. 英文先显示稳定识别结果，中文独立跟译，并随当前整句扩展而校正。
4. 全屏时继续显示字幕；在设置中调整字幕语言、背景透明度与外观。
5. 字幕记录仅保留本次运行最近 120 条，可导出为文本。退出后不保存观看记录与播放地址。

## 本机模型

- 英文语音识别：[onnx-community/whisper-base.en](https://huggingface.co/onnx-community/whisper-base.en)，ONNX q8，CPU 推理。
- 英译中：[Xenova/opus-mt-en-zh](https://huggingface.co/Xenova/opus-mt-en-zh)，ONNX q8，CPU 推理。
- 首次选择本机翻译时合计下载约 190 MB，需要能访问 Hugging Face；下载失败可重新开启字幕重试。
- 桌面应用缓存：`~/Library/Application Support/shiting/models/`。模型不写入应用安装包。网页开发模式缓存位于项目 `models/`。
- 模型缓存完成后，识别与本机翻译无需云服务；直播本身仍需要网络。

## Google Cloud Translation

1. 在 [Google Cloud Console](https://console.cloud.google.com/) 创建或选择项目并启用结算。
2. 启用 **Cloud Translation API**。
3. 在「API 和服务 → 凭据」创建 API Key，建议限制到 Cloud Translation API。
4. 应用设置中选择 **Google Cloud Translation**，填入 Key 后保存。

使用 Translation Basic v2 的英译简体中文接口，不是 Gemini API。费用与配额以 Google 账号设置为准。不要给本机服务使用的 Key 添加浏览器 HTTP Referrer 限制。

## 火山引擎机器翻译

1. 在 [火山引擎控制台](https://console.volcengine.com/) 开通机器翻译服务。
2. 在访问控制中为具备机器翻译调用权限的账号创建 Access Key ID 与 Secret Access Key。
3. 应用设置中选择 **火山引擎机器翻译**，填入 AK/SK 后保存。

使用 `TranslateText`（`2020-06-01`）接口，不是豆包 API Key。费用与权限以火山账号配置为准。

两种云翻译只发送待翻译的英文文字，原始音频仍在 Mac 上识别。密钥只保存在本次运行的内存，退出后清除；不写入磁盘、仓库或安装包。云接口已检查请求格式，尚未使用真实账号验证计费调用。

## 限制

- 当前识别语言为英语，翻译目标为简体中文。
- 识别与翻译存在延迟，处理速度取决于硬件与语音内容。持续说话时会增量识别，不固定等待八秒；处理积压时优先追赶直播，可能跳过部分内容。
- 稳定英文不会反复改字，也意味着早期误识别可能保留。中文上下文为当前句，不是跨整段新闻的大模型推理。
- 人名、数字、口音、背景音乐和翻译表达可能不准确。
- 支持公网 HTTP(S) HLS，不提供 DRM 解密、内网源、频道授权或登录后的付费内容访问。
- 不保证所有 HLS 变体、字节范围分片或所有直播源兼容。

## 开发

使用 Electron + 原生 JavaScript 界面、Node 本机服务、Transformers.js / ONNX Runtime。没有为了使用 Rust 而重写现有播放与识别链路。

开发环境：Node.js 24、npm、macOS Apple Silicon。

```sh
npm ci
npm start          # 本机网页：http://127.0.0.1:8765
npm run desktop   # 独立桌面窗口
npm run check     # JavaScript 语法检查
npm run package:mac
```

打包输出：`dist/视听-darwin-arm64/视听.app`。打包脚本仅复制运行文件与生产依赖，不复制 `models/`、配置缓存、开发记录或测试媒体。`.build/`、`dist/`、`models/` 与 `node_modules/` 均不进入 Git。

第三方依赖和模型使用各自的许可证；Electron 分发包保留 Chromium 与其他第三方许可文件。模型在首次使用时从对应作者的仓库下载。
