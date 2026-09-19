const RATE = 16000;
const MAX_BYTES = 16 * 1024 * 1024;

export class HlsAudio {
  constructor(player, video, onError) {
    this.player = player;
    this.video = video;
    this.onError = onError;
    this.pending = [];
    this.buffers = [];
    this.ends = new Map();
    this.epoch = 0;
    this.destroyed = false;
    this.events = (globalThis.Hls || globalThis.window?.Hls || player.constructor).Events;
    this.codecs = (_event, tracks) => {
      if (tracks.audio?.initSegment) this.init = new Uint8Array(tracks.audio.initSegment).slice();
    };
    this.append = (_event, data) => this.enqueue(data);
    this.seek = () => { this.cursor = this.video.currentTime; };
    player.on(this.events.BUFFER_CODECS, this.codecs);
    player.on(this.events.BUFFER_APPENDING, this.append);
    video.addEventListener('seeking', this.seek);
    video.addEventListener('seeked', this.seek);
  }

  start(onSamples) {
    if (this.destroyed) return;
    this.stop();
    this.onSamples = onSamples;
    this.cursor = this.video.currentTime;
    this.timer = setInterval(() => this.tick(), 100);
  }

  stop() {
    clearInterval(this.timer);
    this.timer = null;
    this.onSamples = null;
  }

  enqueue(data) {
    if (this.destroyed || data.type !== 'audio' || !this.init || !data.data) return;
    const bytes = new Uint8Array(data.data.buffer || data.data, data.data.byteOffset || 0, data.data.byteLength);
    const box = String.fromCharCode(...bytes.subarray(4, 8));
    if (box === 'ftyp' || box === 'moov') return;
    const start = data.part?.start ?? data.frag?.start;
    if (!Number.isFinite(start)) return;
    const size = this.init.length + bytes.length;
    if (size > MAX_BYTES) {
      this.onError?.(new Error('HLS 音频片段过大，无法解码'));
      return;
    }
    while (this.pending.length >= 30 || this.pending.reduce((n, item) => n + item.bytes.length, 0) + size > MAX_BYTES) this.pending.shift();
    const joined = new Uint8Array(size);
    joined.set(this.init);
    joined.set(bytes, this.init.length);
    this.pending.push({ bytes: joined, start, key: `${data.frag?.cc}:${data.frag?.sn}:${data.part?.index ?? ''}` });
    void this.drain();
  }

  async drain() {
    if (this.decoding) return;
    this.decoding = true;
    const epoch = this.epoch;
    try {
      while (this.pending.length && !this.destroyed) {
        const item = this.pending.shift();
        try {
          const Context = globalThis.OfflineAudioContext || globalThis.window?.webkitOfflineAudioContext;
          const decoded = await new Context(1, 1, RATE).decodeAudioData(item.bytes.buffer);
          if (this.destroyed || epoch !== this.epoch) return;
          if (decoded.sampleRate !== RATE) throw new Error('HLS 音频解码采样率不是 16000 Hz');
          const samples = new Float32Array(decoded.length);
          for (let channel = 0; channel < decoded.numberOfChannels; channel++) {
            const pcm = decoded.getChannelData(channel);
            for (let i = 0; i < samples.length; i++) samples[i] += pcm[i] / decoded.numberOfChannels;
          }
          const start = Math.max(item.start, this.ends.get(item.key) ?? item.start);
          const end = start + samples.length / RATE;
          this.ends.set(item.key, end);
          while (this.ends.size > 60) this.ends.delete(this.ends.keys().next().value);
          this.buffers.push({ start, end, samples });
          this.buffers.sort((a, b) => a.start - b.start);
          let duration = this.buffers.reduce((n, buffer) => n + buffer.samples.length / RATE, 0);
          while (this.buffers.length > 30 || duration > 60) duration -= this.buffers.shift().samples.length / RATE;
        } catch (error) {
          if (!this.destroyed && epoch === this.epoch) this.onError?.(error);
        }
      }
    } finally {
      this.decoding = false;
    }
  }

  tick() {
    if (!this.onSamples || this.video.paused || this.video.seeking || this.video.readyState < 3) return;
    const time = this.video.currentTime;
    if (!Number.isFinite(time)) return;
    if (time < this.cursor - 0.2) this.cursor = time;
    this.cursor = Math.max(this.cursor, time - 0.15);
    const limit = time + 0.1;
    for (const buffer of this.buffers) {
      const from = Math.max(0, Math.ceil((this.cursor - buffer.start) * RATE - 1e-6));
      const to = Math.min(buffer.samples.length, Math.floor((limit - buffer.start) * RATE + 1e-6));
      if (to > from) {
        this.onSamples(buffer.samples.slice(from, to));
        this.cursor = buffer.start + to / RATE;
      }
    }
    this.buffers = this.buffers.filter(buffer => buffer.end > time - 1);
  }

  destroy() {
    this.stop();
    this.destroyed = true;
    this.epoch++;
    this.player.off(this.events.BUFFER_CODECS, this.codecs);
    this.player.off(this.events.BUFFER_APPENDING, this.append);
    this.video.removeEventListener('seeking', this.seek);
    this.video.removeEventListener('seeked', this.seek);
    this.pending = [];
    this.buffers = [];
    this.ends.clear();
    this.init = null;
  }
}
