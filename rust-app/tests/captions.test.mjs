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
