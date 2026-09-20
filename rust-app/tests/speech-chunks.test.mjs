import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../public/speech-chunks.js',import.meta.url),'utf8');
const {SpeechChunks}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
test('first interim at one second, another after half a second, final after 400ms silence',()=>{
  const result=[]; const chunks=new SpeechChunks(chunk=>result.push(chunk));
  chunks.push(new Float32Array(16000).fill(.1));
  assert.equal(result.length,1); assert.equal(result[0].final,false);
  chunks.push(new Float32Array(8000).fill(.1)); assert.equal(result.length,2);
  chunks.push(new Float32Array(6400)); assert.equal(result.at(-1).final,true);
  assert.equal(result[0].id,result.at(-1).id);
});
test('silence and reset cannot leak prior speech into a new source',()=>{
  const result=[]; const chunks=new SpeechChunks(chunk=>result.push(chunk));
  chunks.push(new Float32Array(32000)); assert.equal(result.length,0);
  chunks.push(new Float32Array(8000).fill(.1)); chunks.reset();
  chunks.push(new Float32Array(8000).fill(.2)); assert.equal(result.length,0);
  chunks.push(new Float32Array(8000).fill(.2)); assert.equal(result.length,1);
  assert.ok(result[0].audio.every(v=>Math.abs(v-.2)<1e-6));
});
test('buffered phrases keep media timestamps and split continuous speech',()=>{
 const result=[]; const chunks=new SpeechChunks(chunk=>result.push(chunk),{maxSeconds:1.5});
 chunks.push(new Float32Array(48000).fill(.1),{start:10});
 const finals=result.filter(row=>row.final);
 assert.equal(finals.length,2); assert.equal(finals[0].start,10); assert.equal(finals[0].end,11.5); assert.equal(finals[1].start,11.5);
});
test('flush retains the short last phrase with its real end',()=>{
 const result=[]; const chunks=new SpeechChunks(chunk=>result.push(chunk),{maxSeconds:1.5});
 chunks.push(new Float32Array(4800).fill(.1),{start:20}); chunks.flush();
 assert.equal(result.length,1); assert.equal(result[0].end,20.3);
});
