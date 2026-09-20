import {readFile, writeFile, stat} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const version = process.argv[2] ?? (await readFile(resolve(root, 'VERSION'), 'utf8')).trim();
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('版本号必须为 x.y.z');
const output = resolve(root, 'dist', `release-${version}`);
const archive = `Shiting-${version}-macOS-arm64.zip`;
const file = resolve(output, archive);
const tool = resolve(root, 'runtime/Sparkle-2.10.0/bin/sign_update');
const signing = ['--account', 'shiting-nistudyc'];
const signature = execFileSync(tool, [...signing, '-p', file], {encoding:'utf8'}).trim();
const length = (await stat(file)).size;
const feed = resolve(output, 'appcast.xml');
await writeFile(feed, `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0" xmlns:sparkle="http://www.andymatuschak.org/xml-namespaces/sparkle">
<channel><title>视听更新</title><link>https://github.com/nistudyc/shiting/releases</link><language>zh-cn</language>
<item><title>视听 ${version}</title><pubDate>${new Date().toUTCString()}</pubDate>
<sparkle:version>${version}</sparkle:version><sparkle:shortVersionString>${version}</sparkle:shortVersionString>
<sparkle:minimumSystemVersion>26.0</sparkle:minimumSystemVersion>
<description>新增可选字幕缓冲、自动收起底栏、字幕回看侧栏与签名自动更新。详见 GitHub Release。</description>
<enclosure url="https://github.com/nistudyc/shiting/releases/download/v${version}/${archive}" sparkle:edSignature="${signature}" length="${length}" type="application/octet-stream" />
</item></channel></rss>
`);
execFileSync(tool, [...signing, feed], {stdio:'inherit'});
execFileSync(tool, [...signing, '--verify', file, signature], {stdio:'inherit'});
execFileSync(tool, [...signing, '--verify', feed], {stdio:'inherit'});
