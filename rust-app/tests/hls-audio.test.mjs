import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('../public/hls-audio.js', import.meta.url), 'utf8');
const { HlsAudio } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
const settle = () => new Promise(resolve => setImmediate(resolve));
function setup(decode) {
  const original = { setInterval, clearInterval, Hls: globalThis.Hls, OfflineAudioContext: globalThis.OfflineAudioContext };
  let tick;
  globalThis.setInterval = callback => { tick = callback; return 1; };
  globalThis.clearInterval = () => {};
  globalThis.Hls = { Events: { BUFFER_CODECS: 'codecs', BUFFER_APPENDING: 'append' } };
  globalThis.OfflineAudioContext = class {
    constructor(channels, length, rate) { assert.equal(rate, 16000); }
    decodeAudioData(bytes) { assert.equal(bytes.byteLength, 16); return decode?.() ?? Promise.resolve({sampleRate:16000, length:16000, numberOfChannels:2, getChannelData: channel => new Float32Array(16000).fill(channel ? 0.6 : 0.2)}); }
  };
  const listeners = new Map();
  const videoListeners = new Map();
  const player = { on: (event, fn) => listeners.set(event, fn), off: event => listeners.delete(event) };
  const video = {currentTime:10, paused:false, seeking:false, readyState:4, addEventListener:(e,f)=>videoListeners.set(e,f), removeEventListener:e=>videoListeners.delete(e)};
  const output = [], errors = [];
  const audio = new HlsAudio(player, video, error => errors.push(error));
  listeners.get('codecs')('', {audio:{initSegment:new Uint8Array(8)}});
  const append = (start = 10, sn = 1) => listeners.get('append')('', {type:'audio', data:new Uint8Array(8), frag:{start,sn,cc:0}});
  audio.start(samples => output.push(samples));
  return {audio, video, output, errors, append, tick:()=>tick(), seek:()=>videoListeners.get('seeked')(), restore:()=> {audio.destroy(); Object.assign(globalThis, original);} };
}
test('PCM is averaged and released only to the audible timeline, including repeated fragment chunks', async () => {
  const s=setup();
  try {
    s.append(); s.append(); await settle(); s.tick();
    assert.equal(s.output.reduce((n,x)=>n+x.length,0), 1600);
    assert.ok(Math.abs(s.output[0][0] - 0.4) < 1e-6);
    s.tick(); assert.equal(s.output.length,1);
    for (let i=1;i<=9;i++) { s.video.currentTime=10+i/10; s.tick(); }
    assert.equal(s.output.reduce((n,x)=>n+x.length,0),16000);
    for (let i=10;i<=14;i++) { s.video.currentTime=10+i/10; s.tick(); }
    assert.equal(s.output.reduce((n,x)=>n+x.length,0),24000);
  } finally {s.restore();}
});
test('pause, stop and resume retain future audio and discard skipped past samples', async () => {
  const s=setup();
  try {
    s.append(); await settle(); s.video.paused=true; s.tick(); assert.equal(s.output.length,0);
    s.audio.stop(); s.video.paused=false; s.video.currentTime=10.5; s.tick(); assert.equal(s.output.length,0);
    s.audio.start(samples=>s.output.push(samples)); s.tick();
    assert.equal(s.output[0].length,1600);
    s.video.currentTime=10.8; s.seek(); s.tick(); assert.equal(s.output[1].length,1600);
  } finally {s.restore();}
});
test('destroy ignores a late decode and removes listeners', async () => {
  let resolve;
  const s=setup(()=>new Promise(r=>{resolve=r;}));
  try {
    s.append(); s.audio.destroy();
    resolve({sampleRate:16000,length:16000,numberOfChannels:1,getChannelData:()=>new Float32Array(16000)});
    await settle(); s.tick(); assert.equal(s.output.length,0); assert.equal(s.audio.buffers.length,0);
  } finally {s.restore();}
});
test('decode failures are visible and pending queue stays bounded', async () => {
  let reject;
  const s=setup(()=>new Promise((_resolve,r)=>{reject=r;}));
  try {
    for(let i=0;i<100;i++) s.append(10+i,i);
    assert.ok(s.audio.pending.length<=30);
    reject(new Error('bad audio')); await settle(); assert.equal(s.errors[0].message,'bad audio');
  } finally {s.restore();}
});
test('future segments are held and a playback jump cannot release a whole stale segment', async () => {
  const s=setup();
  try {
    s.append(12,2); await settle(); s.tick(); assert.equal(s.output.length,0);
    s.video.currentTime=12.5; s.tick();
    assert.equal(s.output[0].length,4000);
    assert.ok(s.output[0].length / 16000 <= 0.25);
  } finally {s.restore();}
});
test('retained decoded audio has a hard fragment bound', async () => {
  const s=setup();
  try {
    for(let i=0;i<45;i++) { s.append(10+i,i); await settle(); }
    assert.equal(s.audio.buffers.length,30);
    assert.ok(s.audio.buffers.reduce((n,b)=>n+b.samples.length/16000,0)<=60);
  } finally {s.restore();}
});
