import { SpeechChunks } from './speech-chunks.js';
class AudioCollector extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ratio = sampleRate / 16000;
    this.chunks = new SpeechChunks(chunk => this.port.postMessage(chunk, [chunk.audio.buffer]));
    this.reset();
    this.port.onmessage = () => this.reset();
  }
  reset() { this.chunks.reset(); this.resampleSum=0; this.remaining=this.ratio; }
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
    if (channels?.[0]?.length) this.chunks.push(this.downsample(channels));
    return true;
  }
}
registerProcessor('audio-collector', AudioCollector);
