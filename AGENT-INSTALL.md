# 让智能体安装视听

适用：用户明确要求 Codex、豆包工作等有本机文件/应用操作能力的智能体安装或升级视听。仅有聊天能力的智能体应说明无法代替用户操作，并提供 DMG 链接。

## 用户可以直接发这一句话

> 请按照 https://github.com/nistudyc/shiting/blob/main/AGENT-INSTALL.md 帮我安装或升级最新版视听，保留现有设置和模型缓存，完成后打开应用，不播放媒体；需要系统密码时让我在系统窗口自行输入。

## 安装步骤

1. **确认兼容性和现状。** 当前安装包要求 Apple Silicon（arm64）及 macOS 26+。检查 `/Applications/视听.app`、`~/Applications/视听.app` 和实际运行路径的 Info.plist。原生版标识为 `local.shiting.player.native`，旧 Rust 版为 `local.shiting.player.rust`。仅凭名称不要删除其他应用。已安装最新版且签名/启动正常时直接完成。
2. **获取正式版本。** 从 `https://api.github.com/repos/nistudyc/shiting/releases/latest` 读取非草稿、非预发布 Release。选择同一 Release 的 `Shiting-<版本>-macOS-arm64.dmg`（有终端也可选同名 ZIP）和 `SHA256SUMS.txt`。使用返回的 GitHub 下载链接与正常 HTTPS 证书验证；无需安装开发工具、克隆源码或运行构建。
3. **校验后再替换。** 下载到临时目录，核对所选包的 SHA-256 与清单；有 GitHub asset digest 时同时比对。它证明下载完整性，不代替发布者身份认证。只读挂载 DMG 或解压 ZIP，读取应用 Info.plist，确认版本、标识和平台，并运行 `codesign --verify --deep --strict <应用路径>`（有终端时）。任何不一致均停止替换并报告。
4. **安装并保留回退。** 正常退出已确认的旧版；若仍在播放，先说明安装会停止当前播放。把旧应用移到废纸篓或带版本号的备份位置，保留设置与模型缓存 `~/Library/Application Support/shiting/`，也保留 `local.shiting.player.native` 偏好。将完整的新 `视听.app` 复制到 `/Applications/视听.app`。权限不足时交由用户在系统窗口授权；不收集密码。安装失败时恢复旧应用。
5. **最小确认。** 从安装位置打开应用，确认无载入错误、设置中的版本与 Release 一致即可。不要选频道、加载媒体、下载模型或跑播放测试。卸载本次挂载的磁盘镜像；仅在新版可打开后清理本次临时文件。报告版本、安装位置、旧版去向及保留的数据。

## 系统提示与升级边界

- 当前包未做 Apple Developer ID 签名和公证。若 Gatekeeper 拦截，说明来源及此限制，让用户自行在“系统设置 → 隐私与安全性”完成系统确认；不要关闭 Gatekeeper、关闭证书验证或批量移除隔离属性。
- 安装应用不需要读取钥匙串、创建更新签名密钥或导出任何私钥。签名密钥仅供项目发布者使用。
- v2.1.0 及以前需手动安装一次新版；v2.2.0 起自带更新检查、签名验证、自动下载与安装。已可用时优先使用内置“检查更新”；新安装仍用 DMG。
- Windows、Intel Mac、旧 macOS 没有本说明对应的安装包，应明确报告不兼容。不要伪称成功、修改系统版本限制或安装同名第三方应用。
