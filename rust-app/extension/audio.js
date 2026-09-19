class AudioCollector extends AudioWorkletProcessor {
  constructor() {
    super();
    this.sequence = 0;
    this.ratio = sampleRate / 16000;
    this.reset();
    this.port.onmessage = () => this.reset();
  }
  reset() {
    this.samples = new Float32Array(16000 * 16);
    this.offset = 0;
    this.silence = 0;
    this.sinceUpdate = 0;
    this.speaking = false;
    this.resampleSum = 0;
    this.remaining = this.ratio;
    this.sequence++;
  }
  emit(final) {
    const audio = new Float32Array(Math.max(16000, this.offset));
    audio.set(this.samples.subarray(0, this.offset));
    this.port.postMessage({ audio, id: this.sequence, final }, [audio.buffer]);
    this.sinceUpdate = 0;
  }
  downsample(channels) {
    const audio = new Float32Array(Math.ceil(channels[0].length / this.ratio) + 1);
    let length = 0;
    for (let i = 0; i < channels[0].length; i++) {
      let mono = 0;
      for (const channel of channels) mono += channel[i] / channels.length;
      let available = 1;
      while (available > 1e-9) {
        const weight = Math.min(available, this.remaining);
        this.resampleSum += mono * weight;
        this.remaining -= weight; available -= weight;
        if (this.remaining < 1e-9) {
          audio[length++] = this.resampleSum / this.ratio;
          this.resampleSum = 0; this.remaining = this.ratio;
        }
      }
    }
    return audio.subarray(0, length);
  }
  process(inputs) {
    const channels = inputs[0];
    if (!channels?.[0]?.length) return true;
    const channel = this.downsample(channels);
    if (!channel.length) return true;
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
    if (this.silence >= 16000 * 0.6 || this.offset >= this.samples.length) {
      if (this.offset - this.silence >= 16000 * 0.25) this.emit(true);
      this.reset();
    } else if (this.offset >= 16000 && this.sinceUpdate >= 16000 * 0.75) this.emit(false);
    return true;
  }
}
registerProcessor('audio-collector', AudioCollector);
