// 生成并签名 Sparkle appcast（Node Ed25519 实现）。
// 不使用 runtime 里的 sign_update 二进制：它在部分 macOS 26 环境下
// Ed25519 实现损坏（签名无法通过公钥验证、64 字节新格式被误拒）。
// 签名语义已用 v2.2.1 线上 appcast 样本逆向验证：
//   enclosure 签名 = Ed25519(更新 ZIP 全部字节)
//   feed 签名     = Ed2559(文件头警告注释 + RSS 内容)，签名与长度记入尾部注释
import {readFileSync, writeFileSync, statSync} from 'node:fs';
import crypto from 'node:crypto';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const version = process.argv[2] ?? readFileSync(resolve(root, 'VERSION'), 'utf8').trim();
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('版本号必须为 x.y.z');
const output = resolve(root, 'dist', `release-${version}`);
const archive = `Shiting-${version}-macOS-arm64.zip`;
const file = resolve(output, archive);

// 私钥文件支持 44 字符（仅种子）或 88 字符（种子+公钥）两种备份格式
const keyFile = resolve(root, 'signing/sparkle-private-key.txt');
const keyB64 = readFileSync(keyFile, 'utf8').trim();
const keyBuf = Buffer.from(keyB64, 'base64');
if (![32, 64].includes(keyBuf.length)) throw new Error(`私钥文件格式异常（解码 ${keyBuf.length} 字节）`);
const seed = keyBuf.subarray(0, 32);
const pkcs8 = Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), seed]);
const privKey = crypto.createPrivateKey({key: pkcs8, format: 'der', type: 'pkcs8'});

// 公钥自验证：私钥必须与嵌入客户端的公钥匹配，否则存量用户无法更新
const pubB64 = readFileSync(resolve(root, 'signing/sparkle-public-key.txt'), 'utf8').trim();
const spki = Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), Buffer.from(pubB64, 'base64')]);
const verifyKey = crypto.createPublicKey({key: spki, format: 'der', type: 'spki'});
const derivedPub = privKeyToPublic();
if (derivedPub !== pubB64) throw new Error('私钥与公钥不匹配：存量用户将无法自动更新，请检查密钥文件');
function privKeyToPublic() {
  return crypto.createPublicKey(privKey).export({type: 'spki', format: 'der'}).subarray(-32).toString('base64');
}
const sign = data => crypto.sign(null, data, privKey);

// 1) 更新归档签名
const archiveData = readFileSync(file);
const archiveSig = sign(archiveData);
if (!crypto.verify(null, archiveData, verifyKey, archiveSig)) throw new Error('归档签名自验证失败');
const length = statSync(file).size;

// 2) 组装 feed（头部警告注释与尾部签名注释的字节布局须与 Sparkle 工具一致）
const description = '全新应用图标；有新版本时设置齿轮显示蓝色小点提醒，更新确认后自动安装并重启；安装映像改用带背景引导的 DMG。详见 GitHub Release。';
const rss = `<rss xmlns:sparkle="http://www.andymatuschak.org/xml-namespaces/sparkle" version="2.0">
<channel><title>视听更新</title><link>https://github.com/nistudyc/shiting/releases</link><language>zh-cn</language>
<item><title>视听 ${version}</title><pubDate>${new Date().toUTCString()}</pubDate>
<sparkle:version>${version}</sparkle:version><sparkle:shortVersionString>${version}</sparkle:shortVersionString>
<sparkle:minimumSystemVersion>26.0</sparkle:minimumSystemVersion>
<description>${description}</description>
<enclosure url="https://github.com/nistudyc/shiting/releases/download/v${version}/${archive}" sparkle:edSignature="${archiveSig.toString('base64')}" length="${length}" type="application/octet-stream"></enclosure>
</item></channel></rss>`;
const header = `<?xml version="1.0" encoding="utf-8" standalone="yes"?><!-- sparkle-sign-warning:
IMPORTANT: This file was signed by Sparkle. Any modifications to this file requires re-signing this file with generate_appcast or sign_update! The signed signature will be embedded at the end of this file.
-->`;
const signedPart = header + rss;
const feedSig = sign(Buffer.from(signedPart, 'utf8'));
if (!crypto.verify(null, Buffer.from(signedPart, 'utf8'), verifyKey, feedSig)) throw new Error('feed 签名自验证失败');
const feed = resolve(output, 'appcast.xml');
writeFileSync(feed, `${signedPart}<!-- sparkle-signatures:
edSignature: ${feedSig.toString('base64')}
length: ${Buffer.byteLength(signedPart)}
-->
`);
console.log(`appcast 已生成并自验证通过：${feed}`);
