import { randomUUID } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
let source = '';
const urls = new Map();
const reverse = new Map();
function publicAddress(address) {
  if (address.includes(':')) return !/^(::|fc|fd|fe80|ff)/i.test(address);
  const [a,b] = address.split('.').map(Number);
  return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127));
}
export function parseSource(value) {
  const url = new URL(value);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || value.length > 4096) throw new Error('请输入有效的 HTTP(S) HLS 地址，不支持内嵌账号密码。');
  return url.href;
}
async function checkedFetch(address) {
  let url = new URL(parseSource(address));
  for (let redirect = 0; redirect < 5; redirect++) {
    const addresses = await lookup(url.hostname.replace(/^\[|\]$/g, ''), { all: true });
    if (!addresses.length || addresses.some(item => !publicAddress(item.address))) throw new Error('播放器只访问公网直播源，不访问本机或内网地址。');
    const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(25000) });
    if (response.status >= 300 && response.status < 400 && response.headers.has('location')) { await response.body?.cancel(); url = new URL(response.headers.get('location'),url); continue; }
    return { response, url: url.href };
  }
  throw new Error('直播源重定向过多。');
}
export function currentSource() { return source; }
export function setSource(value) { source = parseSource(value); urls.clear(); reverse.clear(); }
function register(value, base) {
  const address = new URL(value, base).href;
  if (reverse.has(address)) return '/media/item/' + reverse.get(address);
  const id = randomUUID(); urls.set(id, address); reverse.set(address, id);
  while (urls.size > 12000) { const first=urls.keys().next().value; reverse.delete(urls.get(first)); urls.delete(first); }
  return '/media/item/' + id;
}
export function rewritePlaylist(body, base) {
  if (!body.trimStart().startsWith('#EXTM3U')) throw new Error('源返回的内容不是 HLS 播放清单。');
  return body.split('\n').map(line => {
    if (!line.trim()) return line;
    if (line.startsWith('#')) return line.replace(/URI="([^"]+)"/g,(_all,uri)=>`URI="${register(uri,base)}"`);
    return register(line.trim(),base);
  }).join('\n');
}
export async function serveMedia(path,res) {
  const address = path === '/media/main.m3u8' ? source : urls.get(path.slice('/media/item/'.length));
  if (!address) { res.writeHead(404); res.end(path === '/media/main.m3u8' ? '请先添加 HLS 播放地址。' : '直播片段已过期。'); return; }
  const {response,url} = await checkedFetch(address);
  if (!response.ok) { res.writeHead(response.status); res.end('直播源请求失败。'); return; }
  const type = response.headers.get('content-type') || '';
  if (path === '/media/main.m3u8' || /\.m3u8(?:\?|$)/i.test(url) || /mpegurl/i.test(type)) {
    const playlist = rewritePlaylist(await response.text(),url);
    res.writeHead(200,{'Content-Type':'application/vnd.apple.mpegurl','Cache-Control':'no-store'});res.end(playlist);
  } else {
    res.writeHead(200,{'Content-Type':type || 'application/octet-stream','Cache-Control':'no-store'});
    await pipeline(Readable.fromWeb(response.body),res);
  }
}
