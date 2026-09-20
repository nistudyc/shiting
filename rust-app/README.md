# 视听 · macOS 原生播放器

Apple Silicon、macOS 26+。原声播放，本机英语识别与中文翻译；原生 SwiftUI 控件、全屏、字幕与历史回看。首次字幕使用会下载模型，安装包不含模型或密钥。

## 安装

从 [GitHub Releases](https://github.com/nistudyc/shiting/releases) 下载最新 DMG，先退出旧版，再打开 DMG 将“视听.app”拖进 Applications，最后从应用程序打开新版。当前未做 Apple Developer ID 签名或公证；新 Mac 首次打开可能需要在系统设置的隐私与安全性中确认。

[让智能体帮你安装](../AGENT-INSTALL.md)

## v2.2.1

- 液态玻璃背景透明度0–100%，全局字体85–140%，即时保存；系统菜单和系统对话框保持macOS字号。
- 默认维持现有即时字幕方式。设置可选择额外 3／4／5 秒字幕缓冲，下次载入来源生效；画面与原声一起延迟，字幕处理尽量提前，来不及不阻塞播放。
- 播放时闲置约 3 秒，底栏状态和操作按钮一起收起；移动鼠标或操作键盘恢复。字幕保持原大小。
- 点击“字幕”打开回看侧栏；附属菜单保留字幕开关和语言。侧栏支持上滚、复制、导出、回到最新，最多保留本次运行最近 120 条。上滚阅读不被新字幕拉回底部。
- 菜单和设置有“检查更新”。默认自动检查 GitHub Release、验签、下载，由 Sparkle 完成安装及重启，亦可退出时安装。v2.1.0 及之前需手动安装一次新版。

## 边界

缓冲不会提高模型持续处理能力；较慢电脑仍可能出现字幕晚到或跳过过期片段。支持当前可解码 HLS 路径，后备播放路径无法提前读音轨时会明确提示。暂停直播后恢复会回到新的直播位置；录播恢复不重复启动等待。

原始音频本机处理，云翻译只发送文字。播放地址、历史和云密钥不持久保存；缓冲、字体、玻璃透明度及更新偏好保存在本机。全屏和已存在的小窗能力沿用现状。Chrome 扩展不在本次改动范围。

用户要求本次不做播放性测试，因此本版没有新增真实音画同步、直播延迟精度或翻译及时率的播放验收结论。非播放逻辑测试与编译、安装包检查单独记录。

## 开发与发布

发布源码以 [v2.2.1标签](https://github.com/nistudyc/shiting/tree/v2.2.1/rust-app) 为准。

`node --test tests/*.test.mjs` 检查字幕、音频分段和缓冲逻辑；`cargo test --no-default-features --locked` 检查 Rust 逻辑。打包入口 `sh scripts/package-native.sh`，输出 `dist/release-版本/`。

[安装和更新发布说明](https://github.com/nistudyc/shiting/blob/v2.2.1/rust-app/docs/UPDATES.md) · [改进方案](https://github.com/nistudyc/shiting/blob/v2.2.1/rust-app/docs/DELAYED-PLAYBACK-PLAN-20260919.md)
