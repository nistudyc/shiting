class AudioCollector extends AudioWorkletProcessor {
  constructor() {
    super();
    this.sequence = 0;
    this.reset();
    this.port.onmessage = () => this.reset();
  }
  reset() {
    this.samples = new Float32Array(sampleRate * 16);
    this.offset = 0;
    this.silence = 0;
    this.sinceUpdate = 0;
    this.speaking = false;
    this.sequence++;
  }
  emit(final) {
    const audio = new Float32Array(Math.max(sampleRate, this.offset));
    audio.set(this.samples.subarray(0, this.offset));
    this.port.postMessage({ audio, id: this.sequence, final }, [audio.buffer]);
    this.sinceUpdate = 0;
  }
  process(inputs) {
    const channel = inputs[0]?.[0];
    if (!channel) return true;
    let energy = 0;
    for (const value of channel) energy += value * value;
    const voiced = Math.sqrt(energy / channel.length) > 0.008;
    if (!this.speaking && !voiced) return true;
    this.speaking = true;
    for (const value of channel) {
      if (this.offset < this.samples.length) this.samples[this.offset++] = value;
    }
    this.silence = voiced ? 0 : this.silence + channel.length;
    this.sinceUpdate += channel.length;
    if (this.silence >= sampleRate * 0.6 || this.offset >= this.samples.length) {
      if (this.offset - this.silence >= sampleRate * 0.25) this.emit(true);
      this.reset();
    } else if (this.offset >= sampleRate && this.sinceUpdate >= sampleRate * 0.75) this.emit(false);
    return true;
  }
}
registerProcessor('audio-collector', AudioCollector);
