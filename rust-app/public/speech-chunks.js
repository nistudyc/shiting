export class SpeechChunks {
  constructor(emit, {maxSeconds = 16} = {}) { this.maxSeconds = maxSeconds; this.emit = emit; this.sequence = 0; this.reset(); }
  reset() {
    this.samples = new Float32Array(16000 * this.maxSeconds);
    this.offset = 0; this.silence = 0; this.sinceUpdate = 0; this.speaking = false;
    this.sequence++; this.version = 0; this.start = undefined; this.lastEnd = undefined;
  }
  send(final, endOfMedia = false) {
    const audio = new Float32Array(Math.max(16000, this.offset));
    audio.set(this.samples.subarray(0, this.offset));
    this.emit({audio, id:this.sequence, final, endOfMedia, version: ++this.version, start:this.start, end:this.start === undefined ? undefined : this.start + this.offset / 16000}); this.sinceUpdate = 0;
  }
  flush(endOfMedia = false) { if (this.offset - this.silence >= 16000 * 0.25) this.send(true, endOfMedia); this.reset(); }
  push(pcm, timing) {
    if (timing && this.lastEnd !== undefined && Math.abs(timing.start - this.lastEnd) > 0.05) this.flush();
    this.lastEnd = timing ? timing.start + pcm.length / 16000 : undefined;
    for (let start = 0; start < pcm.length; start += 160) this.frame(pcm.subarray(start, start + 160), timing ? timing.start + start / 16000 : undefined);
  }
  frame(pcm, time) {
    let energy = 0;
    for (const value of pcm) energy += value * value;
    const voiced = Math.sqrt(energy / pcm.length) > 0.008;
    if (!this.speaking && !voiced) return;
    if (!this.speaking) this.start = time;
    this.speaking = true;
    const count = Math.min(pcm.length, this.samples.length - this.offset);
    this.samples.set(pcm.subarray(0,count),this.offset); this.offset += count;
    this.silence = voiced ? 0 : this.silence + pcm.length;
    this.sinceUpdate += pcm.length;
    if (this.silence >= 16000 * 0.4 || this.offset >= this.samples.length) {
      if (this.offset - this.silence >= 16000 * 0.25) this.send(true);
      this.reset();
    } else if (this.maxSeconds === 16 && this.offset >= 16000 && this.sinceUpdate >= 16000 * 0.5) this.send(false);
  }
}
