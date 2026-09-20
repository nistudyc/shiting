import { isYouTube } from './core.js';
const offscreenURL = chrome.runtime.getURL('offscreen.html');
let starting = false;
async function offscreenExists() {
  return (await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'], documentUrls: [offscreenURL] })).length > 0;
}
async function stop() {
  if (await offscreenExists()) await chrome.runtime.sendMessage({ target: 'offscreen', type: 'stop' });
}
async function start(config) {
  if (starting) throw new Error('正在启动，请稍候');
  starting = true;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !isYouTube(tab.url)) throw new Error('请先打开 YouTube 视频页面');
    if (!config.token?.trim()) throw new Error('请填写桌面端配对码');
    await chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
    await chrome.storage.local.set({ token: config.token.trim(), provider: config.provider });
    await stop();
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['overlay.js'] });
    if (!await offscreenExists()) await chrome.offscreen.createDocument({ url: 'offscreen.html', reasons: ['USER_MEDIA'], justification: '捕获用户选择的 YouTube 标签页音频并保留原声播放' });
    const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id });
    const result = await chrome.runtime.sendMessage({ target: 'offscreen', type: 'start', streamId, tabId: tab.id, token: config.token.trim(), provider: config.provider });
    if (!result?.ok) throw new Error(result?.error || '无法启动音频捕获');
    return result;
  } finally { starting = false; }
}
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (sender.id !== chrome.runtime.id) return;
  if (message.target === 'capture-state' && sender.url === offscreenURL) {
    chrome.storage.session.set({ captureState: message.state }).then(() => reply({ ok: true }), error => reply({ ok: false, error: error.message }));
    return true;
  }
  if (message.target === 'background' && !sender.tab) {
    (message.type === 'start' ? start(message) : stop()).then(() => reply({ ok: true }), error => reply({ ok: false, error: error.message }));
    return true;
  }
  if (message.target === 'overlay' && sender.url === offscreenURL) {
    chrome.tabs.sendMessage(message.tabId, { type: 'caption', en: message.en, zh: message.zh, status: message.status }).catch(() => stop());
  }
});
chrome.tabs.onRemoved.addListener(async tabId => {
  const { captureState } = await chrome.storage.session.get('captureState');
  if (captureState?.tabId === tabId) await stop();
});
chrome.tabs.onUpdated.addListener(async (tabId, info) => {
  if (info.status !== 'loading' && !info.url) return;
  const { captureState } = await chrome.storage.session.get('captureState');
  if (captureState?.tabId !== tabId) return;
  // YouTube 是单页应用：站内跳转（含进入/切换直播页）不结束 tabCapture 流，只有离开 YouTube 才停止；
  // info.url 缺失（无权限可见）的真实导航保守视为离开。整页刷新由 offscreen 的流 onended 自行收尾。
  if (!isYouTube(info.url)) await stop();
});
