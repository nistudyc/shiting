import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CaptionFlow } from './caption-flow.js';
import { providerPath, publishState } from './core.js';
import { readFileSync } from 'node:fs';
const flush = () => new Promise(resolve => setImmediate(resolve));
test('providers propagate to preparation and translation', () => {
  for (const provider of ['local', 'google', 'volcano']) {
    assert.equal(providerPath('/api/translate', provider), `/api/translate?provider=${provider}`);
    assert.equal(providerPath('/api/prepare', provider), `/api/prepare?provider=${provider}`);
  }
  assert.equal(providerPath('/api/translate', 'invalid'), '/api/translate?provider=local');
});
test('offscreen state adapter uses runtime messaging, never unsupported storage', async () => {
  const sent = [];
  await publishState({ active: true }, { sendMessage: async message => sent.push(message) });
  assert.deepEqual(sent, [{ target: 'capture-state', state: { active: true } }]);
  assert.doesNotMatch(readFileSync(new URL('./offscreen.js', import.meta.url), 'utf8'), /chrome\.storage/);
});
test('English commits first; final Chinese corrects context and stale partial is suppressed', async () => {
  const output = [], jobs = [];
  const flow = new CaptionFlow(text => new Promise(resolve => jobs.push({ text, resolve })), value => output.push(value), assert.fail);
  flow.english('Hello this is a real test', { id: 1, final: false });
  assert.equal(output.length, 0);
  flow.english('Hello this is a real test today', { id: 1, final: false });
  assert.equal(output[0].en, 'Hello this is a real'); assert.equal(output[0].zh, '');
  flow.english('Hello this is a real test today.', { id: 1, final: true });
  assert.equal(output.at(-1).en, 'Hello this is a real test today.');
  jobs[0].resolve({ zh: '旧中文' }); await flush();
  assert.ok(!output.some(value => value.zh === '旧中文'));
  jobs[1].resolve({ zh: '完整中文' }); await flush();
  assert.equal(output.at(-1).zh, '完整中文');
});
test('new utterance clears Chinese and stopped sessions suppress late translation', async () => {
  const output = [], jobs = [];
  const flow = new CaptionFlow(text => new Promise(resolve => jobs.push(resolve)), value => output.push(value), assert.fail);
  flow.english('First.', { id: 1, final: true });
  flow.english('Second.', { id: 2, final: true });
  jobs[0]({ zh: '第一句' }); await flush();
  assert.deepEqual(output.at(-1), { en: 'Second.', zh: '', status: '' });
  flow.stop(); jobs[1]({ zh: '第二句' }); await flush();
  assert.equal(output.at(-1).zh, '');
});
