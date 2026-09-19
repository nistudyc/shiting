# 视听 · Chrome 双语字幕

无需编译的 Manifest V3 扩展，要求 Chrome 116 或更新版本。

## 安装与使用
1. 启动视听 Rust 桌面端，在设置中复制配对码。
2. Chrome 打开 `chrome://extensions`，开启「开发者模式」，点击「加载已解压的扩展程序」，选择本目录（其中直接包含 manifest.json）。
3. 打开 YouTube 视频，点击扩展图标，粘贴配对码，选择翻译方式，点击「开启当前视频字幕」。
4. 首次使用等待桌面端下载模型；进度显示在弹窗和视频中。开始播放英语视频后显示两行字幕。点击「停止」结束捕获。

Google / 火山密钥在桌面端配置。切换翻译方式须先停止，再开启。刷新页面、跳转视频或关闭标签页时停止；重新点击开启。全屏字幕跟随 YouTube 播放器。字幕为实时识别结果，存在识别/翻译延迟，不保证逐字准确。

## 数据与权限
- 仅捕获用户主动开启的标签页音频；不调用麦克风。
- 原声直接连接 AudioContext 输出，以设备原采样率播放；识别分支通过 AudioWorklet 单独转为 16 kHz 单声道。
- 音频只发往本机 `http://127.0.0.1:48765`。选择云翻译时，由桌面端向所选服务发送英文文本。
- 配对码保存在扩展本地存储，禁止内容脚本访问；不注入网页，不写日志。卸载扩展会移除。
- `activeTab` / `scripting` 用于用户主动开启后注入字幕；`tabCapture` 捕获标签页，`offscreen` 保持音频处理，`storage` 保存配置及状态。本机 host permission 用于桌面连接。

## 桌面协议
所有请求含 `Authorization: Bearer <配对码>`。
- `GET /api/status` → `{phase,message}`。
- `POST /api/prepare?provider=local|google|volcano` → 等待准备完成，成功返回 JSON。
- `POST /api/transcribe`，`application/octet-stream`，16 kHz 单声道 Float32 little endian → `{en}`。
- `POST /api/translate?provider=local|google|volcano`，JSON `{text}` → `{zh}`。

识别和翻译各保持一个处理中请求、最多两个等待语句；同一句的增量音频覆盖旧版本。复用桌面端 StableCaption：英文稳定片段先追加显示，中文根据整段上下文更新；新增英文先清空旧中文，过期翻译不会覆盖新句。停止会中断请求，旧会话响应不更新字幕。无法连接或配对失败在弹窗显示。模型下载最多等待 10 分钟，识别/翻译每次最多等待 2 分钟。

## 验证
本目录运行 `node --test *.test.js`。测试覆盖域名限制、队列上限、PCM 字节序、44.1/48/96 kHz 重采样、翻译服务路由、offscreen 状态转发、英文先显示、句末更新和过期中文抑制。
实际 tabCapture、YouTube 全屏、扬声器原声和本地模型联调必须在 Chrome 加载扩展后验证；普通网页预览不等价于此项验收。不自动修改个人 Chrome 配置或安装扩展。
