import { API, AudioQueue, pcmBytes, providerPath, publishState } from './core.js';
import { CaptionFlow } from './caption-flow.js';
let session;
async function status(s, message, error = false) {
  if (session !== s) return;
  await publishState({ active: true, tabId: s.tabId, message, error });
  chrome.runtime.sendMessage({ target: 'overlay', tabId: s.tabId, status: message }).catch(() => {});
}
async function request(s, path, options = {}) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  s.abort.signal.addEventListener('abort', abort, { once: true });
  if (s.abort.signal.aborted) controller.abort();
  const timer = setTimeout(abort, path.startsWith('/api/prepare') ? 600000 : 120000);
  try {
    const response = await fetch(API + path, { ...options, headers: { Authorization: `Bearer ${s.token}`, ...options.headers }, signal: controller.signal });
    if (!response.ok) throw new Error(response.status === 401 ? '配对码无效，请从桌面端重新复制' : `桌面服务返回 ${response.status}：${(await response.text()).slice(0, 160)}`);
    return await response.json();
  } finally { clearTimeout(timer); s.abort.signal.removeEventListener('abort', abort); }
}
async function stop() {
  const s = session;
  session = null;
  if (!s) return;
  s.abort.abort(); s.captions?.stop(); s.queue.clear(); clearInterval(s.poll);
  s.stream?.getTracks().forEach(track => track.stop());
  await s.context?.close();
  await publishState({ active: false, message: '已停止' });
  chrome.runtime.sendMessage({ target: 'overlay', tabId: s.tabId, en: '', zh: '', status: '' }).catch(() => {});
}
async function pump(s) {
  if (s.busy || !s.ready) return;
  s.busy = true;
  try {
    let packet;
    while (session === s && (packet = s.queue.shift())) {
      const { en } = await request(s, '/api/transcribe', { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: pcmBytes(packet.audio) });
      if (session !== s || !en?.trim()) continue;
      s.captions.english(en, packet);
      await status(s, '正在生成双语字幕');
    }
  } catch (error) {
    if (session === s) await status(s, `连接失败：${error.message}。将随下一段语音重试。`, true);
  } finally { s.busy = false; }
}
async function start(config) {
  await stop();
  const s = { ...config, abort: new AbortController(), queue: new AudioQueue(), ready: false, busy: false };
  session = s;
  s.captions = new CaptionFlow(
    text => request(s, providerPath('/api/translate', s.provider), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) }),
    caption => { if (session === s) chrome.runtime.sendMessage({ target: 'overlay', tabId: s.tabId, ...caption }).catch(() => {}); },
    message => { if (session === s) void status(s, message, true); }
  );
  try {
    await status(s, '正在连接桌面端…');
    s.stream = await navigator.mediaDevices.getUserMedia({ audio: { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: config.streamId } }, video: false });
    if (session !== s) { s.stream.getTracks().forEach(track => track.stop()); return; }
    s.context = new AudioContext();
    const source = s.context.createMediaStreamSource(s.stream);
    source.connect(s.context.destination);
    await s.context.audioWorklet.addModule('audio.js');
    const collector = new AudioWorkletNode(s.context, 'audio-collector');
    const silent = s.context.createGain(); silent.gain.value = 0;
    source.connect(collector); collector.connect(silent); silent.connect(s.context.destination);
    collector.port.onmessage = event => { if (session === s && s.ready) { s.queue.push(event.data); void pump(s); } };
    s.stream.getAudioTracks()[0].onended = () => { if (session === s) void stop(); };
    await s.context.resume();
    s.poll = setInterval(async () => {
      try { const state = await request(s, '/api/status'); if (!s.ready) await status(s, state.message || state.phase || '正在准备模型…'); } catch (error) { if (!s.ready) await status(s, error.message, true); }
    }, 2000);
    await request(s, providerPath('/api/prepare', s.provider), { method: 'POST' });
    if (session !== s) return;
    clearInterval(s.poll); s.ready = true;
    await status(s, '正在聆听标签页声音…');
  } catch (error) {
    if (session !== s) return;
    await stop();
    await publishState({ active: false, message: error.message, error: true });
    throw error;
  }
}
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (message.target !== 'offscreen' || sender.id !== chrome.runtime.id) return;
  if (message.type === 'start') {
    // Preparation can download large models; keep the popup responsive and errors in shared state.
    void start(message).catch(() => {}); reply({ ok: true });
  } else { stop().then(() => reply({ ok: true })); return true; }
});
