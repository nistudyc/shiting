import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AudioQueue, isYouTube, pcmBytes } from './core.js';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
test('only real HTTPS YouTube hosts qualify', () => {
  assert.equal(isYouTube('https://www.youtube.com/watch?v=x'), true);
  for (const url of ['https://youtube.com.evil.test/', 'http://youtube.com', 'not a url', 'https://example.com']) assert.equal(isYouTube(url), false);
});
test('backpressure replaces partials and bounds pending utterances', () => {
  const q = new AudioQueue(); q.push({ id: 1 }); q.push({ id: 1, final: true });
  assert.equal(q.items.length, 1); assert.equal(q.items[0].final, true);
  q.push({ id: 2 }); q.push({ id: 3 }); assert.deepEqual(q.items.map(p => p.id), [2, 3]);
  q.clear(); assert.equal(q.shift(), undefined);
});
test('PCM is explicitly float32 little endian', () => {
  assert.deepEqual([...new Uint8Array(pcmBytes(new Float32Array([1, -1])))], [0, 0, 128, 63, 0, 0, 128, 191]);
});
for (const rate of [44100, 48000, 96000]) test(`worklet produces 16 kHz recognition copy from ${rate} Hz`, () => {
  let Processor;
  vm.runInNewContext(readFileSync(new URL('./audio.js', import.meta.url), 'utf8'), { sampleRate: rate, AudioWorkletProcessor: class { constructor() { this.port = {}; } }, registerProcessor: (_, p) => { Processor = p; } });
  const p = new Processor(); let length = 0;
  for (let i = 0; i < rate; i += 128) length += p.downsample([new Float32Array(Math.min(128, rate - i)).fill(0.5)]).length;
  assert.equal(length, 16000);
});
