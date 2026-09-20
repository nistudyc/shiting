#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
cargo build --release --locked --bin shiting
app='dist/视听 Rust.app'
mkdir -p "$app/Contents/MacOS" "$app/Contents/Frameworks" "$app/Contents/Resources"
cp target/release/shiting "$app/Contents/MacOS/shiting"
cp runtime/libonnxruntime.1.20.1.dylib "$app/Contents/Frameworks/"
cp runtime/ONNXRUNTIME-LICENSE "$app/Contents/Resources/"
cat > "$app/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleName</key><string>视听 Rust</string>
<key>CFBundleDisplayName</key><string>视听 Rust</string>
<key>CFBundleExecutable</key><string>shiting</string>
<key>CFBundleIdentifier</key><string>local.shiting.player.rust</string>
<key>CFBundleVersion</key><string>2.0.0</string>
<key>CFBundleShortVersionString</key><string>2.0.0</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>LSMinimumSystemVersion</key><string>11.0</string>
<key>NSHighResolutionCapable</key><true/>
<key>NSAppTransportSecurity</key><dict><key>NSAllowsLocalNetworking</key><true/></dict>
</dict></plist>
PLIST
codesign --force --deep --sign - "$app"
ditto -c -k --sequesterRsrc --keepParent "$app" dist/Shiting-Rust-macOS-arm64.zip
zip -rq dist/Shiting-Chrome-extension.zip extension -x '*/core.test.js' '*/caption-flow.test.js' '*/package.json' '*/DESIGN.md'
shasum -a 256 dist/*.zip > dist/SHA256SUMS.txt
du -sh "$app" dist/*.zip
