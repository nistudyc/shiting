# v2.2.0 实施与发布记录

## 授权与边界

按改进文档实现可选字幕缓冲、闲置底栏、字幕回看侧栏；新增 GitHub Release 自动更新及标准拖拽安装 DMG，并直接发布 Release。用户明确要求不做播放性测试，验证采用纯逻辑、编译、无播放窗口检查、签名和安装包检查。第二项全屏／小窗保持现状。

## 计划

1. 已完成源码实现：媒体缓冲与字幕时间队列、原生设置／底栏／侧栏、Sparkle 更新。
2. 已完成基础检查与边界修复：27项非播放测试通过。最终发布审查等待签名安装包，不视为已通过。
3. 用户已明确授权在本机钥匙串创建更新签名密钥；密钥已创建，仅公钥进入源码。正在完成签名应用、DMG、更新归档与 appcast。
4. 待完成：发布分支已在本机提交，尚未推送、创建 PR 或发布 Release；继续最终审查、发布与下载回验。

## 基线

- GitHub：nistudyc/shiting，main 为 d0a8d6d；最新 Release v2.1.0。
- 本地工作目录无 Git 元数据，独立克隆位于 /private/tmp/shiting-release-20260919，集成时只同步本项目源码。
- 当前无 Apple Developer ID 签名身份；本次采用临时代码签名与独立 EdDSA 更新签名，不宣称 Apple 公证。
- Sparkle 官方 2.10.0 发行归档 SHA-256：c2bf58aa8387266ac179357b1415d6f2635f044da8be41042af32425dae6da0c。

## 当前检查证据（2026-09-20）

- Node 27 项纯逻辑／合成 PCM 测试通过；覆盖 3/4/5 秒准备、未来字幕、旧版本翻译失败、串行切源、时间线清理与录播尾句。没有播放媒体。
- Rust 单元测试 12 项通过；release 编译通过。
- Swift 6 在 macOS 26.5 SDK 下全文件类型检查通过，Sparkle 链接编译通过。默认 SDK 存在宏插件不匹配，固定使用现有 26.5 SDK。
- 独立本机服务实际启动；空来源、401鉴权、403跨站拒绝、嵌入资源内容核对通过；未设置来源或调用播放，检查服务已退出。
- 无媒体 SwiftUI 预览可打开字幕侧栏、向上滚动出现“回到最新”、打开设置；仅为布局检查，不作为真实播放证据。截图在 /private/tmp/shiting-ui-evidence，最终液态玻璃侧栏新截图为 history-liquid-glass.png。
- 用户新增要求：发布统一原生 Liquid Glass，样式优先；侧栏已改用系统 glassEffect。
- 首次自动审批拒绝后，用户明确授权钥匙串密钥创建与继续发布；已成功创建，私钥保留在钥匙串。

## 接续位置

源码在当前 rust-app；Git发布分支在 /private/tmp/shiting-release-20260919。钥匙串账户 shiting-nistudyc，公钥保存在 signing/sparkle-public-key.txt。Rust工具链在 /private/tmp/shiting-toolchain；SDK固定26.5。最终包、审查和发布证据追加在工作区 .omo/evidence。

## 本轮补充（2026-09-20）

新增尾句自动断句标记回归，现27项纯逻辑测试通过；四项原边界问题独立复核PASS，对应源码提交e3972f3fc1393f2fa15e9053c6948c03ca53e28a。报告位于当前工作区 .omo/evidence/boundary_fix_review-code-review.md。这是聚焦源码复核，不能代替尚未进行的最终签名包与发布审查。用户现已授权密钥创建并继续发布。
