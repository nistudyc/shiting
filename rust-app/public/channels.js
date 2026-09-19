import { loadSource } from './app.js';
const select = document.querySelector('#channelSelect');
try {
  const response = await fetch('/channels.json');
  if (!response.ok) throw new Error('频道列表读取失败');
  const channels = await response.json();
  for (const [index, channel] of channels.entries()) {
    const option = document.createElement('option');
    option.value = String(index); option.textContent = channel.name;
    if (new URL(channel.url).pathname.endsWith('.mpd')) { option.disabled = true; option.textContent += '（DASH 暂不支持）'; }
    select.append(option);
  }
  select.addEventListener('sourcechange', event => {
    const index = channels.findIndex(channel => channel.url === event.detail);
    select.value = index < 0 ? '' : String(index);
  });
  select.addEventListener('change', () => {
    if (select.value === '') return;
    const channel = channels[Number(select.value)];
    void loadSource(channel.url, channel.name);
  });
} catch (error) { select.disabled = true; select.title = error.message; }
