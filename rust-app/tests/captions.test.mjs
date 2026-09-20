import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('../public/captions.js', import.meta.url), 'utf8');
const { CaptionView } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
class Element {
  textContent = ''; hidden = false; children = [];
  append(...children) { this.children.push(...children); }
  prepend(child) { this.children.unshift(child); }
  querySelector(selector) { return this.children.find(child => selector === 'time' ? child.tag === 'time' : child.className === selector.slice(1)); }
}
function setup(api) {
  const elements = new Map(['#en','#zh','#overlay','#history','#export','#clear'].map(id => [id,new Element()]));
  globalThis.document = { querySelector: id => elements.get(id), createElement: tag => Object.assign(new Element(), {tag}) };
  globalThis.window = { innerWidth:1280 };
  const view = new CaptionView(api, () => {}, {value:'both'}); view.start('local');
  return {view,elements};
}
test('first partial appears and starts translation without waiting for repeated words', async () => {
  const calls=[];
  const {view,elements}=setup(async (_path, options) => { calls.push(JSON.parse(options.body).text); return {zh:'你好世界'}; });
  try {
    view.english('', 'Hello world', {key:'1',time:'12:00',final:false});
    assert.equal(elements.get('#en').textContent, 'Hello world');
    assert.deepEqual(calls,['Hello world']);
    await Promise.resolve();
    assert.equal(elements.get('#zh').textContent,'你好世界');
    view.english('Hello there', 'Hello there', {key:'1',time:'12:00',final:true});
    assert.equal(elements.get('#en').textContent,'Hello there');
    assert.equal(view.entries.length,1);
    assert.equal(view.entries[0].en,'Hello there');
  } finally { view.stop(); }
});
test('stopping captions rejects a late translation', async () => {
  let finish;
  const {view,elements}=setup(() => new Promise(resolve => {finish=resolve;}));
  view.english('Hello world', 'Hello world', {key:'1',time:'12:00',final:true});
  view.stop(); finish({zh:'过期结果'}); await Promise.resolve();
  assert.equal(elements.get('#zh').textContent,'');
  assert.equal(elements.get('#overlay').hidden,true);
});
test('buffered captions wait for media time and late translations update only history', async () => {
 let finish; let time=10;
 const {view,elements}=setup(()=>new Promise(resolve=>{finish=resolve;}));
 view.setClock(()=>time);
 view.english('', 'Future phrase', {key:'2',time:'00:12',start:12,end:14,version:1,final:true});
 assert.equal(elements.get('#en').textContent,''); assert.equal(view.visibleEntries().length,0);
 time=12; view.tick(); assert.equal(elements.get('#en').textContent,'Future phrase'); assert.equal(view.visibleEntries().length,1);
 time=14; view.tick(); finish({zh:'迟到翻译'}); await Promise.resolve();
 assert.equal(elements.get('#zh').textContent,''); assert.equal(view.entries[0].zh,'迟到翻译'); view.stop();
});
test('older versions and previous timeline translations cannot overwrite current captions', async () => {
 let finish;
 const {view,elements}=setup(()=>new Promise(resolve=>{finish=resolve;})); view.setClock(()=>12);
 view.english('', 'New version', {key:'2',start:12,end:14,version:2,final:true});
 view.english('', 'Old version', {key:'2',start:12,end:14,version:1,final:true});
 assert.equal(elements.get('#en').textContent,'New version');
 view.reset(); finish({zh:'旧时间线'}); await Promise.resolve(); view.tick();
 assert.equal(elements.get('#en').textContent,''); assert.equal(view.entries[0].zh,''); view.stop();
});
test('a rejected obsolete translation cannot disable its queued replacement', async () => {
 let reject; const calls=[];
 const {view}=setup((_path,options)=> { calls.push(JSON.parse(options.body).text); return calls.length===1 ? new Promise((_r,j)=>{reject=j;}) : Promise.resolve({zh:'新版'}); });
 view.setClock(()=>12);
 view.english('', 'Old partial', {key:'1',start:12,end:14,version:1,final:false});
 view.english('', 'New final', {key:'1',start:12,end:14,version:2,final:true});
 reject(new Error('obsolete')); await new Promise(resolve=>setImmediate(resolve));
 assert.equal(view.translationError,false); assert.deepEqual(calls,['Old partial','New final']); assert.equal(view.entries[0].zh,'新版'); view.stop();
});
test('short end-of-media phrase survives paused scheduling and completes translated history', async () => {
 const load=async name=>import('data:text/javascript;base64,'+Buffer.from(await readFile(new URL('../public/'+name,import.meta.url),'utf8')).toString('base64'));
 const {SpeechChunks}=await load('speech-chunks.js');
 const {acceptsAudio,timelyAudio}=await load('audio-scheduling.js');
 for (const buffered of [false,true]) {
  const {view,elements}=setup(async()=>({zh:'尾句译文'}));if(buffered)view.setClock(()=>10);
  const queue=[];
  const chunks=new SpeechChunks(chunk=>{if(acceptsAudio(chunk,{enabled:true,buffered,paused:true,seeking:false}))queue.push(chunk);},{maxSeconds:1.5});
  chunks.push(new Float32Array(4800).fill(.1),{start:9.7});chunks.flush(true);
  const admitted=queue.filter(chunk=>!buffered||timelyAudio(chunk,10));assert.equal(admitted.length,1);
  view.english('', 'Last phrase', {...admitted[0],key:'tail',time:'00:10'});await Promise.resolve();
  assert.equal(view.entries[0].en,'Last phrase');assert.equal(view.entries[0].zh,'尾句译文');
  if(buffered)assert.equal(elements.get('#en').textContent,'');view.stop();
 }
});
