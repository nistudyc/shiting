import { configureVolcano, volcanoConfigured } from './volcano.mjs';
import { currentSource, setSource, serveMedia } from './media.mjs';
import { configureGoogle, googleConfigured } from './google.mjs';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { prepare, recognize, translateText, state } from './models.mjs';

let port = Number(process.env.PLAYER_PORT ?? 8765);
let origin = `http://127.0.0.1:${port}`;
const assets = new Map([
  ['/', ['public/index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['public/app.js', 'text/javascript; charset=utf-8']],
  ['/captions.js', ['public/captions.js', 'text/javascript; charset=utf-8']],
  ['/stable.js', ['public/stable.js', 'text/javascript; charset=utf-8']],
  ['/audio.js', ['public/audio.js', 'text/javascript; charset=utf-8']],
  ['/style.css', ['public/style.css', 'text/css; charset=utf-8']],
  ['/hls.js', ['node_modules/hls.js/dist/hls.min.js', 'text/javascript; charset=utf-8']],
]);
function json(res, code, value) {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(value));
}
const server = http.createServer(async (req, res) => {
  try {
    if (req.headers.host !== `127.0.0.1:${port}` && req.headers.host !== `localhost:${port}`) return json(res, 403, { error: '只允许本机访问。' });
    if (req.headers.origin && ![origin, `http://localhost:${port}`].includes(req.headers.origin)) return json(res, 403, { error: '不允许跨站请求。' });
    const url = new URL(req.url, origin);
    const path = url.pathname;
    const requestedProvider = url.searchParams.get('provider');
    const provider = ['google','volcano'].includes(requestedProvider) ? requestedProvider : 'local';
    if (path === '/api/source' && req.method === 'GET') return json(res,200,{url:currentSource()});
    if (path === '/api/source' && req.method === 'POST') {
      let body=''; for await (const chunk of req) {body+=chunk;if(body.length>8192)return json(res,413,{error:'地址过长。'});}
      const data=JSON.parse(body);if(typeof data.url!=='string')return json(res,400,{error:'请输入播放地址。'});
      setSource(data.url); return json(res,200,{ok:true});
    }
    if (path === '/api/config' && req.method === 'GET') return json(res, 200, { googleConfigured: googleConfigured(), volcanoConfigured: volcanoConfigured() });
    if (path === '/api/config' && req.method === 'POST') {
      let data = '';
      for await (const chunk of req) { data += chunk; if (data.length > 2048) return json(res, 413, { error: '配置过长。' }); }
      const config = JSON.parse(data);
      if (config.provider === 'volcano') {
        if (typeof config.ak !== 'string' || typeof config.sk !== 'string' || !/^[A-Za-z0-9+/=_-]{10,256}$/.test(config.ak) || !/^[A-Za-z0-9+/=_-]{10,256}$/.test(config.sk)) return json(res,400,{error:'请输入有效的火山 AK 和 SK。'});
        configureVolcano(config.ak,config.sk);return json(res,200,{ok:true});
      }
      if (typeof config.key !== 'string' || config.key.length < 20 || config.key.length > 256 || /\s/.test(config.key)) return json(res, 400, { error: '请输入有效的 Google API Key。' });
      configureGoogle(config.key);
      return json(res, 200, { ok: true });
    }
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (path === '/api/status' && req.method === 'GET') return json(res, 200, state);
    if (path === '/api/prepare' && req.method === 'POST') {
      void prepare(provider).catch((error) => console.error('Model load:', error.message));
      return json(res, 202, state);
    }
    if (path === '/api/translate' && req.method === 'POST') {
      let body = '';
      for await (const chunk of req) { body += chunk; if (body.length > 8192) return json(res, 413, { error: '文字过长。' }); }
      const data = JSON.parse(body);
      if (typeof data.text !== 'string' || !data.text.trim() || data.text.length > 1200) return json(res, 400, { error: '无效翻译文字。' });
      return json(res, 200, { zh: await translateText(data.text, provider) });
    }
    if ((path === '/api/caption' || path === '/api/transcribe') && req.method === 'POST') {
      if (req.headers['content-type'] !== 'application/octet-stream') return json(res, 415, { error: '需要 PCM 音频。' });
      const chunks = [];
      let length = 0;
      for await (const chunk of req) {
        length += chunk.length;
        if (length > 16000 * 4 * 16) return json(res, 413, { error: '音频过长。' });
        chunks.push(chunk);
      }
      if (length < 16000 * 4 || length % 4) return json(res, 400, { error: '无效音频长度。' });
      const data = Buffer.concat(chunks);
      const audio = new Float32Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
      if (audio.some((value) => !Number.isFinite(value) || Math.abs(value) > 2)) return json(res, 400, { error: '无效音频数据。' });
      if (state.phase !== 'ready') return json(res, 409, { error: '本机模型尚未就绪。' });
      return json(res, 200, await recognize(audio, path === '/api/transcribe' ? 'none' : provider));
    }
    if (req.method !== 'GET') return json(res, 405, { error: '不支持此请求。' });
    if (path === '/media/main.m3u8' || /^\/media\/item\/[a-f0-9-]{36}$/.test(path)) { await serveMedia(path,res); return; }
    const asset = assets.get(path);
    if (!asset) return json(res, 404, { error: '页面不存在。' });
    const body = await readFile(fileURLToPath(new URL(asset[0], import.meta.url)));
    res.writeHead(200, { 'Content-Type': asset[1], 'Cache-Control': 'no-cache' });
    res.end(body);
  } catch (error) {
    if (!res.headersSent) json(res, 500, { error: error instanceof Error ? error.message : String(error) });
    else res.destroy();
  }
});
server.listen(port, '127.0.0.1', () => {
  port=server.address().port;origin=`http://127.0.0.1:${port}`;
  console.log(`PLAYER_READY ${origin}`);
});
server.on('error', (error) => { console.error(error.message); process.exitCode = 1; });
