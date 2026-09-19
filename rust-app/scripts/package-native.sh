#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
cargo build --release --no-default-features --locked --bin shiting
app='dist/视听.app'
mkdir -p "$app/Contents/MacOS" "$app/Contents/Frameworks" "$app/Contents/Resources"
xcrun swiftc -sdk /Library/Developer/CommandLineTools/SDKs/MacOSX26.5.sdk -swift-version 6 -O -target arm64-apple-macos26.0 -module-cache-path /private/tmp/shiting-swift-module-cache native/*.swift -o "$app/Contents/MacOS/shiting-native"
cp target/release/shiting "$app/Contents/MacOS/shiting-service"
cp runtime/libonnxruntime.1.20.1.dylib "$app/Contents/Frameworks/"
cp runtime/ONNXRUNTIME-LICENSE "$app/Contents/Resources/"
cat > "$app/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleName</key><string>视听</string>
<key>CFBundleDisplayName</key><string>视听</string>
<key>CFBundleExecutable</key><string>shiting-native</string>
<key>CFBundleIdentifier</key><string>local.shiting.player.native</string>
<key>CFBundleVersion</key><string>2.1.0</string>
<key>CFBundleShortVersionString</key><string>2.1.0</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>LSMinimumSystemVersion</key><string>26.0</string>
<key>NSHighResolutionCapable</key><true/>
<key>NSAppTransportSecurity</key><dict><key>NSAllowsLocalNetworking</key><true/></dict>
</dict></plist>
PLIST
codesign --force --deep --sign - "$app"
codesign --verify --deep --strict "$app"
ditto -c -k --sequesterRsrc --keepParent "$app" dist/Shiting-macOS-LiquidGlass-arm64.zip
shasum -a 256 dist/Shiting-macOS-LiquidGlass-arm64.zip
