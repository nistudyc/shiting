const form = document.querySelector('form'), token = document.querySelector('#token'), provider = document.querySelector('#provider'), start = document.querySelector('#start'), stop = document.querySelector('#stop'), status = document.querySelector('#status');
function render(state = {}) {
  status.textContent = state.message || '尚未开启'; status.classList.toggle('error', !!state.error);
  start.disabled = !!state.active; stop.disabled = !state.active;
}
const saved = await chrome.storage.local.get(['token', 'provider']);
token.value = saved.token || ''; provider.value = saved.provider || 'local';
render((await chrome.storage.session.get('captureState')).captureState);
chrome.storage.onChanged.addListener((changes, area) => { if (area === 'session' && changes.captureState) render(changes.captureState.newValue); });
form.addEventListener('submit', async event => {
  event.preventDefault(); start.disabled = true; status.textContent = '正在开启…';
  try {
    const result = await chrome.runtime.sendMessage({ target: 'background', type: 'start', token: token.value, provider: provider.value });
    if (!result?.ok) throw new Error(result?.error || '无法启动');
  } catch (error) { render({ error: true, message: error.message }); }
});
stop.addEventListener('click', async () => {
  try { const result = await chrome.runtime.sendMessage({ target: 'background', type: 'stop' }); if (!result?.ok) throw new Error(result?.error); render({ message: '已停止' }); }
  catch (error) { status.textContent = error.message; }
});
