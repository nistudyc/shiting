import { setupNativeBridge } from './native-bridge.js';
import { HlsAudio } from './hls-audio.js';
import { SpeechChunks } from './speech-chunks.js';
import { CaptionView } from './captions.js';
import { StableCaption } from './stable.js';
const video = document.querySelector('#video');
const status = document.querySelector('#status');
const playStatus = document.querySelector('#playStatus');
const toggle = document.querySelector('#toggle');
const progress = document.querySelector('#progress');
const mode = document.querySelector('#mode');
const provider = document.querySelector('#provider');
let hls;
let hlsAudio;
let nativeChunks;
const nativeAudio = /AppleWebKit/.test(navigator.userAgent) && !/Chrome|Chromium|Edg/.test(navigator.userAgent);
let initialized = false;
let enabled = false;
let preparing = false;
let preparationId = 0;
let autoCaptions = true;
let generation = 0;
let context;
let source;
let collector;
let silent;
let recognitionFilter;
let inFlight = false;
let request;
let pending = [];
let streamSession = 0;
const stabilizers = new Map();
const captions = new CaptionView(api, message, mode);

function message(text, error = false) {
  status.textContent = text;
  status.parentElement.classList.toggle('error', error);
}
async function api(path, options = {}) {
  const response = await fetch(path, { ...options, headers: { ...options.headers, Authorization: 'Bearer ' + window.SHITING_TOKEN }, signal: options.signal ?? AbortSignal.timeout(path.startsWith('/api/prepare') ? 600000 : 120000) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `请求失败 ${response.status}`);
  return data;
}
function resetAudio() {
  generation++;
  pending = [];
  stabilizers.clear();
  streamSession++;
  request?.abort();
  collector?.port.postMessage('reset');
  nativeChunks?.reset();
  captions.reset();
}
function stopCaptions() {
  enabled = false;
  hlsAudio?.stop();
  nativeChunks = undefined;
  captions.stop();
  preparing = false;
  preparationId++;
  resetAudio();
  if (collector) { recognitionFilter.disconnect(collector); collector.disconnect(); collector.port.close(); collector = undefined; }
  if (silent) { silent.disconnect(); silent = undefined; }
  toggle.textContent = '开启字幕';
  progress.hidden = true;
  message('字幕已关闭；直播可继续播放。');
}
function queueAudio(chunk) {
  if (!enabled || video.paused || video.seeking) return;
  const key = streamSession + ':' + chunk.id;
  const item = { ...chunk, key, time: new Date().toLocaleTimeString('zh-CN', { hour12: false }), received: performance.now() };
  const existing = pending.findIndex(row => row.key === key);
  if (existing >= 0) pending[existing] = item;
  else pending.push(item);
  if (pending.length > 3) { pending.shift(); message('处理速度暂时落后，已跳过旧音频以跟上直播。'); }
  void drainAudio();
}
async function drainAudio() {
  if (inFlight || !pending.length || !enabled) return;
  inFlight = true;
  const item = pending.shift();
  const current = generation;
  const controller = new AbortController(); request = controller;
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const data = await api('/api/transcribe?provider=' + provider.value, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: item.audio.buffer, signal: controller.signal });
    if (current !== generation || !enabled) return;
    let stable = stabilizers.get(item.key);
    if (!stable) { stable = new StableCaption(); stabilizers.set(item.key, stable); }
    const committed = stable.update(data.en, item.final);
    captions.english(committed, data.en, item);
    if (item.final) stabilizers.delete(item.key);
    while (stabilizers.size > 8) stabilizers.delete(stabilizers.keys().next().value);
    const latency = (performance.now() - item.received) / 1000;
    if (!captions.translationError) message('英文即时显示 / 中文结合上下文 · 识别 · 本次处理 ' + latency.toFixed(1) + ' 秒 · ' + ({google:'Google 翻译',volcano:'火山翻译',local:'本机 ONNX'}[provider.value]) + (latency > 2 ? ' · 正在追赶直播' : ''));
  } catch (error) {
    if (current === generation && enabled) { stopCaptions(); message('字幕已停止：' + error.message + '。可重新开启。', true); }
  } finally { clearTimeout(timeout); inFlight = false; void drainAudio(); }
}
async function enableCaptions() {
  if (!(await api('/api/source')).url) { settings.showModal(); document.querySelector('#sourceUrl').focus(); message('请先添加 HLS 播放地址。'); return; }
  if (enabled || preparing) return;
  if (provider.value !== 'local') {
    const configuration = await api('/api/config');
    if (!(provider.value === 'google' ? configuration.googleConfigured : configuration.volcanoConfigured)) { document.querySelector('#settingsDialog').showModal(); document.querySelector(provider.value === 'google' ? '#key' : '#volcanoAk').focus(); throw new Error('请在设置中填写所选云服务的密钥，或选择本机 ONNX。'); }
  }
  preparing = true;
  const current = ++preparationId;
  toggle.textContent = '取消准备';
  try {
    await api(`/api/prepare?provider=${provider.value}`, { method: 'POST' });
    while (preparing && current === preparationId) {
      const state = await api('/api/status');
      message(state.message + (state.file ? ` ${state.file} · ${state.progress}%` : ''));
      progress.hidden = state.phase !== 'loading';
      progress.value = state.progress;
      if (state.phase === 'error') throw new Error(state.message);
      if (state.phase === 'ready') break;
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    if (!preparing || current !== preparationId) return;
    if (nativeAudio) {
      if (!hlsAudio) throw new Error('当前播放方式无法读取字幕音轨，请重新播放 HLS 频道。');
      nativeChunks = new SpeechChunks(queueAudio);
      hlsAudio.start(pcm => nativeChunks?.push(pcm));
    } else {
      if (!context) {
        context = new AudioContext();
        await context.audioWorklet.addModule('/audio.js');
        source = context.createMediaElementSource(video);
        source.connect(context.destination);
        recognitionFilter = context.createBiquadFilter();
        recognitionFilter.type = 'lowpass'; recognitionFilter.frequency.value = 7200;
        source.connect(recognitionFilter);
      }
      await context.resume();
      if (!preparing || current !== preparationId) return;
      collector = new AudioWorkletNode(context, 'audio-collector');
      silent = context.createGain(); silent.gain.value = 0;
      recognitionFilter.connect(collector); collector.connect(silent); silent.connect(context.destination);
      collector.port.onmessage = event => queueAudio(event.data);
    }
    enabled = true; preparing = false; progress.hidden = true; captions.start(provider.value);
    toggle.textContent = '关闭字幕';
    message(video.paused ? '字幕已就绪，播放直播后开始识别。' : '字幕已开启，正在识别视频音轨，字幕将持续更新…');
  } catch (error) { if (current === preparationId) { stopCaptions(); message(error.message, true); } }
}
function connect() {
  if (initialized) return;
  initialized = true;
  if (window.Hls?.isSupported()) {
    const player = new window.Hls({ liveSyncDurationCount: 3, maxBufferLength: 20, backBufferLength: 20 });
    hls = player;
    if (nativeAudio) hlsAudio = new HlsAudio(player, video, error => { if (hls !== player) return; stopCaptions(); message('字幕音轨读取失败：' + error.message, true); });
    player.loadSource('/media/main.m3u8'); player.attachMedia(video);
    player.on(window.Hls.Events.ERROR, (_event, data) => {
      if (hls !== player) return;
      if (data.fatal) { const detail = `${data.type} / ${data.details}${data.reason ? ' / ' + data.reason.replace(/https?:\/\/\S+/g, '[地址]').slice(0,200) : ''}${data.response?.code ? ' / HTTP ' + data.response.code : ''}`; stopCaptions(); playStatus.textContent = '播放失败：' + detail + '，可点击播放重试。'; message('播放已停止，字幕已关闭。', true); hlsAudio?.destroy(); hlsAudio = undefined; player.destroy(); hls = undefined; initialized = false; }
    });
  } else if (video.canPlayType('application/vnd.apple.mpegurl')) video.src = '/media/main.m3u8';
  else { initialized = false; throw new Error('当前浏览器不支持直播播放，请用新版 Chrome 或 Safari。'); }
}
document.querySelector('#play').addEventListener('click', async () => {
  if (!(await api('/api/source')).url) { settings.showModal(); document.querySelector('#sourceUrl').focus(); return; }
  try { playStatus.textContent = '正在连接直播…'; connect(); await context?.resume(); await video.play(); }
  catch (error) { playStatus.textContent = `无法播放：${error.message}`; }
});
video.addEventListener('playing', () => {
  playStatus.textContent = '正在播放'; collector?.port.postMessage('reset');
  if (autoCaptions && !enabled && !preparing) void enableCaptions().catch(error => message(error.message, true));
});
video.addEventListener('waiting', () => { playStatus.textContent = '正在缓冲…'; resetAudio(); });
video.addEventListener('pause', () => { playStatus.textContent = '已暂停'; resetAudio(); });
video.addEventListener('seeking', resetAudio);
video.addEventListener('error', () => { if (!video.error) return; const code = video.error?.code; stopCaptions(); hlsAudio?.destroy(); hlsAudio = undefined; hls?.destroy(); hls = undefined; playStatus.textContent = `视频播放失败${code ? '（媒体错误 ' + code + '）' : ''}，可点击播放重试。`; message('播放已停止，字幕已关闭。', true); initialized = false; });
toggle.addEventListener('click', () => {
  if (enabled || preparing) { autoCaptions = false; stopCaptions(); return; }
  autoCaptions = true; void enableCaptions().catch(error => message(error.message, true));
});
mode.addEventListener('change', () => captions.show());
provider.addEventListener('change', () => { if (enabled || preparing) stopCaptions(); document.querySelector('#googleFields').hidden = provider.value !== 'google'; document.querySelector('#volcanoFields').hidden = provider.value !== 'volcano'; });
document.querySelector('#saveKey').addEventListener('click', async () => {
  try { const input = document.querySelector('#key'); await api('/api/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider: 'google', key: input.value.trim() }) }); input.value = ''; message('Google 密钥已保存在本机服务内存中，重启服务即清除。'); }
  catch (error) { message(error.message, true); }
});
async function fullscreen(exit = false) {
  try {
    const stage = document.querySelector('#stage');
    if (window.__TAURI__?.window) {
      const nativeWindow = window.__TAURI__.window.getCurrentWindow();
      const active = !exit && !(await nativeWindow.isFullscreen());
      await nativeWindow.setFullscreen(active);
      stage.classList.toggle('native-fullscreen', active);
    } else if (document.fullscreenElement) await document.exitFullscreen();
    else if (!exit) await stage.requestFullscreen();
  } catch { message('全屏切换失败，请重试。', true); }
}
document.querySelector('#fullscreen').addEventListener('click', () => { void fullscreen(); });
document.addEventListener('keydown', event => { if (event.key === 'Escape' && document.querySelector('#stage').classList.contains('native-fullscreen')) void fullscreen(true); });
document.querySelector('#clear').addEventListener('click', () => { resetAudio(); captions.clear(); });
document.querySelector('#export').addEventListener('click', () => captions.exportText());
window.addEventListener('pagehide', () => { request?.abort(); captions.stop(); hlsAudio?.destroy(); hls?.destroy(); void context?.close(); });

const opacity = document.querySelector('#opacity');
opacity.addEventListener('input', () => {
  document.documentElement.style.setProperty('--caption-bg', 'rgba(0,0,0,' + (1 - Number(opacity.value) / 100) + ')');
  document.querySelector('#opacityValue').textContent = opacity.value + '%';
});

const settings = document.querySelector('#settingsDialog');
document.querySelector('#settingsOpen').addEventListener('click',()=>settings.showModal());
document.querySelector('#settingsClose').addEventListener('click',()=>settings.close());
document.querySelector('#exitFullscreen').addEventListener('click',()=>{void fullscreen(true);});
document.querySelector('#saveVolcano').addEventListener('click',async()=>{
  try {
    const ak=document.querySelector('#volcanoAk'),sk=document.querySelector('#volcanoSk');
    await api('/api/config',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({provider:'volcano',ak:ak.value.trim(),sk:sk.value.trim()})});
    ak.value='';sk.value='';message('火山密钥已保存在当前服务内存，退出 App 后清除。');
  } catch(error){message(error.message,true);}
});
export async function loadSource(value, label) {
  try {
    const parsed=new URL(value);
    const result = await api('/api/source',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:value})});
    stopCaptions();autoCaptions=true;video.pause();hlsAudio?.destroy();hlsAudio=undefined;hls?.destroy();hls=undefined;video.removeAttribute('src');video.load();initialized=false;
    if (result.kind === 'youtube') { settings.close(); playStatus.textContent = '已在 Chrome 打开'; message('在 YouTube 页面点击视听扩展，开启双语字幕。'); return; }
    document.querySelector('#sourceName').textContent=label || parsed.hostname;
    document.querySelector('#sourceUrl').value=value;
    document.querySelector('#channelSelect').dispatchEvent(new CustomEvent('sourcechange', { detail: value }));
    playStatus.textContent='正在连接直播…';
    settings.close();connect();await video.play();
  }catch(error){message('载入失败：'+error.message,true);}
}
document.querySelector('#loadSource').addEventListener('click',()=>loadSource(document.querySelector('#sourceUrl').value.trim()));
void api('/api/source').then(data=>{document.querySelector('#sourceUrl').value=data.url; if(data.url)document.querySelector('#sourceName').textContent=new URL(data.url).hostname;}).catch(error=>message(error.message,true));

document.querySelector('#pairingCode').value = window.SHITING_TOKEN;
document.querySelector('#copyPairing').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(window.SHITING_TOKEN); message('配对码已复制，在 Chrome 扩展中粘贴即可。本次应用退出后失效。'); }
  catch { document.querySelector('#pairingCode').select(); message('请复制已选中的配对码。'); }
});

setupNativeBridge({ video, captions, loadSource, api, notify: message });
