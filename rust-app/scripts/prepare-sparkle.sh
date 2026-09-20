#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
version=2.10.0
checksum=c2bf58aa8387266ac179357b1415d6f2635f044da8be41042af32425dae6da0c
destination="runtime/Sparkle-$version"
if [ -f "$destination/.verified-$checksum" ]; then exit 0; fi
archive=$(mktemp -t shiting-sparkle)
trap 'rm -f "$archive"' EXIT
curl --fail --location --retry 2 --output "$archive" "https://github.com/sparkle-project/Sparkle/releases/download/$version/Sparkle-$version.tar.xz"
actual=$(shasum -a 256 "$archive" | cut -d ' ' -f 1)
[ "$actual" = "$checksum" ] || { echo 'Sparkle 校验失败' >&2; exit 1; }
mkdir -p "$destination"
tar -xf "$archive" -C "$destination"
touch "$destination/.verified-$checksum"
