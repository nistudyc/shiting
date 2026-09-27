# 视听 · macOS 原生播放器

Apple Silicon、macOS 26+。原声播放，本机英语识别与中文翻译；原生 SwiftUI 控件、全屏、字幕与历史回看。首次字幕使用会下载模型，安装包不含模型或密钥。

## 安装

从 [GitHub Releases](https://github.com/nistudyc/shiting/releases) 下载最新 DMG，先退出旧版，再打开 DMG 将“视听.app”拖进 Applications，最后从应用程序打开新版。当前未做 Apple Developer ID 签名或公证；新 Mac 首次打开可能需要在系统设置的隐私与安全性中确认。

[让智能体帮你安装](../AGENT-INSTALL.md)

## v2.2.2

- 全新应用图标。
- 更新提醒小蓝点：检查到新版本时设置齿轮亮起蓝色圆点，设置页与“检查更新”菜单同步提示；更新包后台预下载，确认后自动安装并重启，无需逐步操作。
- 安装映像改用带背景与 Applications 拖放引导的 DMG，内附安装说明；未做 Developer ID 签名时，首次打开若提示“已损坏”或只有“移到废纸篓”，可执行 `xattr -cr /Applications/视听.app` 后重开。
- Chrome 扩展补全图标并修复 YouTube 站内跳转误停直播字幕捕获。
- 沿用 v2.2.1：玻璃透明度与全局字号调节、可选字幕缓冲、闲置收起底栏、字幕回看侧栏、签名自动更新。

## 边界

缓冲不会提高模型持续处理能力；较慢电脑仍可能出现字幕晚到或跳过过期片段。支持当前可解码 HLS 路径，后备播放路径无法提前读音轨时会明确提示。暂停直播后恢复会回到新的直播位置；录播恢复不重复启动等待。

原始音频本机处理，云翻译只发送文字。播放地址、历史和云密钥不持久保存；缓冲、字体、玻璃透明度及更新偏好保存在本机。全屏和已存在的小窗能力沿用现状。Chrome 扩展不在本次改动范围。

用户要求本次不做播放性测试，因此本版没有新增真实音画同步、直播延迟精度或翻译及时率的播放验收结论。非播放逻辑测试与编译、安装包检查单独记录。

## 开发与发布

发布源码以 [v2.2.2标签](https://github.com/nistudyc/shiting/tree/v2.2.2/rust-app) 为准。

`node --test tests/*.test.mjs` 检查字幕、音频分段和缓冲逻辑；`cargo test --no-default-features --locked` 检查 Rust 逻辑。打包入口 `sh scripts/package-native.sh`，输出 `dist/release-版本/`。

[安装和更新发布说明](https://github.com/nistudyc/shiting/blob/v2.2.2/rust-app/docs/UPDATES.md) · [改进方案](https://github.com/nistudyc/shiting/blob/v2.2.2/rust-app/docs/DELAYED-PLAYBACK-PLAN-20260919.md)
