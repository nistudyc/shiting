export const API = 'http://127.0.0.1:48765';
export function isYouTube(url) {
  try { const u = new URL(url); return u.protocol === 'https:' && ['www.youtube.com', 'youtube.com', 'm.youtube.com'].includes(u.hostname); }
  catch { return false; }
}
// One active request and at most two waiting utterances. Updates replace their own utterance.
export class AudioQueue {
  constructor() { this.items = []; }
  push(packet) {
    const same = this.items.findIndex(item => item.id === packet.id);
    if (same >= 0) this.items[same] = packet;
    else this.items.push(packet);
    if (this.items.length > 2) this.items.shift();
  }
  shift() { return this.items.shift(); }
  clear() { this.items = []; }
}
export function pcmBytes(audio) {
  const bytes = new ArrayBuffer(audio.length * 4);
  const view = new DataView(bytes);
  audio.forEach((value, i) => view.setFloat32(i * 4, value, true));
  return bytes;
}
export function providerPath(path, provider) {
  return `${path}?provider=${encodeURIComponent(['local', 'google', 'volcano'].includes(provider) ? provider : 'local')}`;
}
export function publishState(state, runtime = chrome.runtime) {
  return runtime.sendMessage({ target: 'capture-state', state });
}
