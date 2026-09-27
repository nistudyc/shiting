#!/usr/bin/env node
// 由 iconset 目录生成 macOS .icns（等价于 iconutil -c icns，无需依赖系统工具）。
// 用法：node scripts/make-icns.mjs <iconsetDir> <output.icns>
import fs from 'node:fs';
import path from 'node:path';

const [iconsetDir, outputPath] = process.argv.slice(2);
if (!iconsetDir || !outputPath) {
  console.error('用法：node scripts/make-icns.mjs <iconsetDir> <output.icns>');
  process.exit(2);
}

// iconset 文件名 → ICNS 类型码（与 iconutil 生成的类型一致）
const entries = [
  ['icp4', 'icon_16x16.png'],      // 16x16
  ['icp5', 'icon_32x32.png'],      // 32x32
  ['ic11', 'icon_16x16@2x.png'],   // 32x16pt@2x
  ['ic12', 'icon_32x32@2x.png'],   // 64x32pt@2x
  ['ic07', 'icon_128x128.png'],   // 128x128
  ['ic13', 'icon_128x128@2x.png'], // 256x128pt@2x
  ['ic08', 'icon_256x256.png'],   // 256x256
  ['ic14', 'icon_256x256@2x.png'],// 512x256pt@2x
  ['ic09', 'icon_512x512.png'],   // 512x512
  ['ic10', 'icon_512x512@2x.png'],// 1024x512pt@2x
];

const chunks = [];
for (const [type, file] of entries) {
  const pngPath = path.join(iconsetDir, file);
  if (!fs.existsSync(pngPath)) {
    console.error(`缺少 ${file}，请先用 sips 生成完整 iconset`);
    process.exit(1);
  }
  const png = fs.readFileSync(pngPath);
  const head = Buffer.alloc(8);
  head.write(type, 0, 'ascii');
  head.writeUInt32BE(png.length + 8, 4);
  chunks.push(head, png);
}

const body = Buffer.concat(chunks);
const icns = Buffer.alloc(8 + body.length);
icns.write('icns', 0, 'ascii');
icns.writeUInt32BE(8 + body.length, 4);
body.copy(icns, 8);

fs.writeFileSync(outputPath, icns);
console.log(`已生成 ${outputPath}（${icns.length} 字节，${entries.length} 个尺寸）`);
