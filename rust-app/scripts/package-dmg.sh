#!/bin/sh
# 用 DMG Maker 生成带背景与 Applications 快捷方式的安装映像，
# 再注入安装说明并压回只读 UDZO（背景与图标布局不受影响）。
set -eu
cd "$(dirname "$0")/.."
version=${1:-$(cat VERSION)}
output="$(pwd)/dist/release-$version"
app="$output/视听.app"
[ -d "$app" ] || { echo "缺少 $app，请先完成应用构建" >&2; exit 1; }
volname="视听 $version"
pretty="$output/$volname.dmg"
final="$output/Shiting-$version-macOS-arm64.dmg"
dmg_maker="/Applications/DMG Maker.app/Contents/MacOS/DMG Maker"
[ -x "$dmg_maker" ] || { echo "缺少 DMG Maker（/Applications/DMG Maker.app），请先安装" >&2; exit 1; }

# 1) DMG Maker 生成漂亮映像（背景 + Applications 拖放引导）
rm -f "$pretty"
"$dmg_maker" --app "$app" --name "$volname"
if [ ! -f "$pretty" ]; then
  pretty=$(find "$output" -maxdepth 1 -name '*.dmg' -newer "$app/Contents/Info.plist" -print -quit)
  [ -n "$pretty" ] || { echo "未找到 DMG Maker 的输出文件" >&2; exit 1; }
fi

# 2) 转可写格式并注入安装说明，随后压回只读 UDZO
rw="$output/.rw-$version.dmg"
rm -f "$rw"
hdiutil convert "$pretty" -format UDRW -o "$rw" -ov >/dev/null
mnt=$(mktemp -d /tmp/shiting-dmg.XXXXXX)
trap 'hdiutil detach "$mnt" >/dev/null 2>&1 || true; rm -rf "$mnt" "$rw"' EXIT
hdiutil attach "$rw" -mountpoint "$mnt" -nobrowse >/dev/null
cat > "$mnt/安装说明.txt" <<'TEXT'
将“视听.app”拖到 Applications（应用程序）文件夹，再从应用程序打开。
替换旧版前请先退出视听。安装完成后可推出此磁盘映像。

系统要求：Apple Silicon（M 系列）Mac，macOS 26 或以上。

应用未做 Apple Developer ID 签名与公证。若首次打开提示“已损坏，无法打开”，
或对话框只显示“移到废纸篓”而没有“仍然打开”，请在“终端”执行下面一条命令，然后重新打开：

    xattr -cr /Applications/视听.app

也可以前往 系统设置 → 隐私与安全性，点“仍要打开”。

从 v2.2.0 起视听会自动检查 GitHub Release：验证更新签名、后台预下载，
确认后自动完成安装并重启；有新版本时设置齿轮上会出现蓝色小点。
旧版（v2.1.0 及更早）没有自动更新，需要先手动安装一次本版。
TEXT
hdiutil detach "$mnt" >/dev/null
trap - EXIT
rm -rf "$mnt"
hdiutil convert "$rw" -format UDZO -o "$final" -ov >/dev/null
rm -f "$rw" "$pretty"
hdiutil verify "$final"
echo "安装映像：$final"
