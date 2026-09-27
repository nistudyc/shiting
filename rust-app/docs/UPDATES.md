# 安装与更新发布

## 用户安装

下载 GitHub Release 的 `Shiting-版本-macOS-arm64.dmg`，打开后将“视听.app”拖到 Applications。先退出旧版再替换，之后从“应用程序”打开。要求 Apple Silicon、macOS 26 或以上。

v2.1.0 及更早版本没有应用内更新，需手动安装一次 v2.2.0；此后的版本可由应用内更新。

## 自动更新

使用 Sparkle 2.10.0 标准更新窗口。默认自动检查，每日检查周期；默认自动下载，退出时安装，亦可通过提示立即安装并重启。设置中的两项开关可分别控制自动检查和自动下载；应用菜单及设置均有“检查更新”。网络失败保留当前应用，更新由 Sparkle 验签、解压和替换，不执行从服务器收到的脚本。

更新源是仓库最新正式 Release 的 `appcast.xml`：

`https://github.com/nistudyc/shiting/releases/latest/download/appcast.xml`

每次 Release 必须一起上传签名 appcast、对应 ZIP、DMG 和 SHA256SUMS.txt。不能把没有 appcast 的发布设为 Latest，否则已安装的更新客户端无法检查。

## 发布者操作

- 固定框架版本与 SHA-256 在 `scripts/prepare-sparkle.sh`，从 Sparkle 官方发行包下载并核对后使用。
- 更新公钥位于 `signing/sparkle-public-key.txt` 并嵌入 Info.plist。
- 私钥文件 `signing/sparkle-private-key.txt`（已被 .gitignore 忽略）用于签名 appcast，支持 44 字符（仅种子）或 88 字符（种子+公钥）两种导出格式。备份可用加密 DMG 存放，换机器时拷贝该文件即可；不可随意重新生成密钥，否则旧安装无法信任新更新。`make-appcast.mjs` 使用 Node 内置 Ed25519 签名（Sparkle 自带 sign_update 二进制在部分 macOS 26 环境 Ed25519 实现损坏，签名语义已用 v2.2.1 线上样本逆向验证），并在生成时用公钥自验签与密钥匹配。
- Rust 服务：装有 Cargo 时从源码构建；未安装时复用 `target/release/shiting` 预构建产物（自 v2.2.1 起 Rust 源码未改动时与源码构建等价）。
- 修改 `VERSION`，确保版本递增。安装和更新用的应用版本以它为准。
- 可用工具：Node.js、Xcode Command Line Tools 与 macOS 26.5 SDK、DMG Maker（`/Applications/DMG Maker.app`）。当前打包脚本使用 26.5 SDK，避免本机另一版默认 SDK 的宏插件不匹配。
- 执行 `sh scripts/package-native.sh`：构建 Rust 服务和 SwiftUI 应用，嵌入 Sparkle、签名应用、创建更新 ZIP；`scripts/package-dmg.sh` 通过 DMG Maker 生成带背景与 Applications 拖放引导的安装映像并注入安装说明；`scripts/make-appcast.mjs` 签名更新归档与 appcast。DMG 生成需要挂载磁盘，若在受限沙箱中运行会被拦截，请在普通终端执行。
- 输出在 `dist/release-版本/`。生成后不可改动 ZIP 或 appcast；如有改变，必须重新签名与生成校验文件。
- 使用中文 Git 提交说明，通过发布分支关联源码，Release 的标签必须指向实际构建源码。

## 签名边界

当前构建环境无 Apple Developer ID 证书。本版采用临时代码签名，未做 Apple 公证；首次在新 Mac 安装可能被 Gatekeeper 拦截，DMG 内安装说明与 README 均给出处理命令 `xattr -cr /Applications/视听.app`（或经系统设置“仍要打开”）。EdDSA 更新签名验证发布者与下载完整性，不等同于 Apple 公证，不声称消除首次安装提示。

官方参考：[Sparkle 集成](https://sparkle-project.org/documentation/programmatic-setup/)、[更新配置](https://sparkle-project.org/documentation/customization/)。
