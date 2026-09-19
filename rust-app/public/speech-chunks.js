export class SpeechChunks {
  constructor(emit) { this.emit = emit; this.sequence = 0; this.reset(); }
  reset() {
    this.samples = new Float32Array(16000 * 16);
    this.offset = 0; this.silence = 0; this.sinceUpdate = 0; this.speaking = false;
    this.sequence++;
  }
  send(final) {
    const audio = new Float32Array(Math.max(16000, this.offset));
    audio.set(this.samples.subarray(0, this.offset));
    this.emit({audio, id:this.sequence, final}); this.sinceUpdate = 0;
  }
  push(pcm) {
    for (let start = 0; start < pcm.length; start += 160) this.frame(pcm.subarray(start, start + 160));
  }
  frame(pcm) {
    let energy = 0;
    for (const value of pcm) energy += value * value;
    const voiced = Math.sqrt(energy / pcm.length) > 0.008;
    if (!this.speaking && !voiced) return;
    this.speaking = true;
    const count = Math.min(pcm.length, this.samples.length - this.offset);
    this.samples.set(pcm.subarray(0,count),this.offset); this.offset += count;
    this.silence = voiced ? 0 : this.silence + pcm.length;
    this.sinceUpdate += pcm.length;
    if (this.silence >= 16000 * 0.4 || this.offset >= this.samples.length) {
      if (this.offset - this.silence >= 16000 * 0.25) this.send(true);
      this.reset();
    } else if (this.offset >= 16000 && this.sinceUpdate >= 16000 * 0.5) this.send(false);
  }
}
