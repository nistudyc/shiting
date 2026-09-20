#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
export PATH="$HOME/.cargo/bin:$PATH"
version=$(cat VERSION)
sparkle=runtime/Sparkle-2.10.0
sh scripts/prepare-sparkle.sh
public_key=$(cat signing/sparkle-public-key.txt)
[ -n "$public_key" ] || { echo '缺少更新公钥' >&2; exit 1; }
cargo build --release --no-default-features --locked --bin shiting
output="dist/release-$version"
app="$output/视听.app"
mkdir -p "$app/Contents/MacOS" "$app/Contents/Frameworks" "$app/Contents/Resources"
xcrun swiftc -sdk /Library/Developer/CommandLineTools/SDKs/MacOSX26.5.sdk -swift-version 6 -O -target arm64-apple-macos26.0 \
  -module-cache-path /private/tmp/shiting-swift-module-cache -F "$sparkle" -framework Sparkle \
  -Xlinker -rpath -Xlinker @executable_path/../Frameworks native/*.swift -o "$app/Contents/MacOS/shiting-native"
cp target/release/shiting "$app/Contents/MacOS/shiting-service"
cp runtime/libonnxruntime.1.20.1.dylib "$app/Contents/Frameworks/"
cp icons/AppIcon.icns "$app/Contents/Resources/"
cp runtime/ONNXRUNTIME-LICENSE "$app/Contents/Resources/"
ditto "$sparkle/Sparkle.framework" "$app/Contents/Frameworks/Sparkle.framework"
cp "$sparkle/LICENSE" "$app/Contents/Resources/Sparkle-LICENSE"
cat > "$app/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleName</key><string>视听</string>
<key>CFBundleDisplayName</key><string>视听</string>
<key>CFBundleExecutable</key><string>shiting-native</string>
<key>CFBundleIdentifier</key><string>local.shiting.player.native</string>
<key>CFBundleVersion</key><string>$version</string>
<key>CFBundleShortVersionString</key><string>$version</string>
<key>CFBundleIconFile</key><string>AppIcon</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>LSMinimumSystemVersion</key><string>26.0</string>
<key>NSHighResolutionCapable</key><true/>
<key>NSAppTransportSecurity</key><dict><key>NSAllowsLocalNetworking</key><true/></dict>
<key>SUFeedURL</key><string>https://github.com/nistudyc/shiting/releases/latest/download/appcast.xml</string>
<key>SUPublicEDKey</key><string>$public_key</string>
<key>SUVerifyUpdateBeforeExtraction</key><true/>
<key>SURequireSignedFeed</key><true/>
<key>SUSignedFeedFailureExpirationInterval</key><integer>0</integer>
<key>SUEnableAutomaticChecks</key><true/>
<key>SUAutomaticallyUpdate</key><true/>
<key>SUScheduledCheckInterval</key><integer>86400</integer>
</dict></plist>
PLIST
codesign --force --deep --sign - "$app"
codesign --verify --deep --strict "$app"
ditto -c -k --sequesterRsrc --keepParent "$app" "$output/Shiting-$version-macOS-arm64.zip"
sh scripts/package-dmg.sh "$version"
node scripts/make-appcast.mjs "$version"
(cd "$output" && shasum -a 256 "Shiting-$version-macOS-arm64.zip" "Shiting-$version-macOS-arm64.dmg" appcast.xml > SHA256SUMS.txt)
echo "发布文件：$output"
