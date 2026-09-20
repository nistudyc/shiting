import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../public/playback-buffer.js',import.meta.url),'utf8');
const {PlaybackBuffer,continuousEnd}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const ranges = values => ({length:values.length,start:i=>values[i][0],end:i=>values[i][1]});
test('a farther fragment beyond a gap cannot satisfy startup buffering',()=>{
 assert.equal(continuousEnd(ranges([[10,11],[12,20]]),10),11);
});
for (const seconds of [3,4,5]) test(`${seconds} seconds requires both continuous media and the preparation interval`,()=>{
 let now=0; let plays=0; const video={currentTime:10,duration:Infinity,readyState:4,seeking:false,buffered:ranges([[10,10+seconds-0.1]]),play:async()=>{plays++;}};
 const buffer=new PlaybackBuffer(video,seconds,()=>{},()=>now); buffer.preparing=true; buffer.tick(); assert.equal(plays,0);
 video.buffered=ranges([[10,10+seconds]]); buffer.tick(); assert.equal(plays,0); now=seconds*1000; buffer.tick(); assert.equal(plays,1); assert.equal(buffer.preparing,false);
});
test('short VOD tail starts without requiring a full buffer',()=>{
 let now=0; let plays=0; const video={currentTime:10,duration:11,readyState:4,seeking:false,buffered:ranges([[10,11]]),play:async()=>{plays++;}};
 const buffer=new PlaybackBuffer(video,5,()=>{},()=>now); buffer.preparing=true; buffer.tick(); now=1000; buffer.tick(); assert.equal(plays,1);
});

test('resuming a prepared VOD does not repeat startup wait',async()=>{
 let plays=0;const video={play:async()=>{plays++;}};
 const buffer=new PlaybackBuffer(video,5,()=>{});buffer.hasStarted=true;
 await buffer.play();assert.equal(plays,1);assert.equal(buffer.preparing,false);
});
