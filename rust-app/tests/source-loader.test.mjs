import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../public/source-loader.js',import.meta.url),'utf8');
const {createSourceLoader}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
test('source writes are serialized and an obsolete response cannot apply UI',async()=>{
 const a=deferred(),b=deferred(),writes=[],applied=[];let backend;
 const loader=createSourceLoader({reset:()=>{},write:async value=>{writes.push(value);await (value.endsWith('/a')?a:b).promise;backend=value;return {kind:'hls'};},apply:(_result,value)=>applied.push(value),failed:error=>{throw error;}});
 const first=loader.load('https://example.com/a');await Promise.resolve();
 const second=loader.load('https://example.com/b');b.resolve();await Promise.resolve();
 assert.deepEqual(writes,['https://example.com/a']);
 a.resolve();await Promise.all([first,second]);
 assert.equal(backend,'https://example.com/b');assert.deepEqual(applied,['https://example.com/b']);
});
