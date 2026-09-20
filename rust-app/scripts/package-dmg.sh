#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
version=${1:-$(cat VERSION)}
output="$(pwd)/dist/release-$version"
stage=$(mktemp -d -t shiting-dmg)
trap 'rm -rf "$stage"' EXIT
ditto "$output/视听.app" "$stage/视听.app"
ln -s /Applications "$stage/Applications"
cat > "$stage/安装说明.txt" <<'TEXT'
将“视听.app”拖到 Applications（应用程序）文件夹，再从应用程序打开。
替换旧版前请先退出视听。安装完成后可推出此磁盘映像。

系统要求：Apple Silicon（M 系列）Mac，macOS 26 或以上。
应用目前未做 Apple Developer ID 签名与公证。若系统阻止打开，可在确认下载来自 nistudyc/shiting 官方 Release 后，前往系统设置 → 隐私与安全性查看“仍要打开”。

从本版开始，视听会自动检查 GitHub Release，验证更新签名并下载。
可在设置或“视听 → 检查更新”手动检查。安装由标准更新窗口引导，可立即安装并重启，或在退出时完成。
旧版尚无自动更新，需要先手动安装一次本版。
TEXT
hdiutil create -volname "视听 $version" -srcfolder "$stage" -fs HFS+ -format UDZO -ov "$output/Shiting-$version-macOS-arm64.dmg"
hdiutil verify "$output/Shiting-$version-macOS-arm64.dmg"
