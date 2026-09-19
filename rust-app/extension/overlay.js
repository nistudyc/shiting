(() => {
  if (globalThis.__shiTingOverlay) return;
  globalThis.__shiTingOverlay = true;
  const host = document.createElement('div');
  host.id = 'shi-ting-subtitles';
  host.style.cssText = 'position:absolute;inset:0;z-index:2147483647;pointer-events:none;';
  const root = host.attachShadow({ mode: 'closed' });
  root.innerHTML = `<style>:host{all:initial}.captions{position:absolute;bottom:14%;left:5%;right:5%;display:flex;flex-direction:column;align-items:center;gap:4px;pointer-events:none}p{margin:0;padding:4px 12px;max-width:100%;box-sizing:border-box;background:rgba(0,0,0,.82);color:white;border-radius:6px;font:500 clamp(16px,2vw,26px)/1.4 -apple-system,BlinkMacSystemFont,sans-serif;text-align:center;white-space:pre-wrap;overflow-wrap:anywhere}p:empty{display:none}.en{font-size:clamp(14px,1.6vw,22px)}.status{font-size:14px}</style><div class="captions"><p class="en"></p><p class="zh"></p><p class="status"></p></div>`;
  const en = root.querySelector('.en'), zh = root.querySelector('.zh'), status = root.querySelector('.status');
  let timer;
  function mount() {
    const parent = document.fullscreenElement || document.querySelector('#movie_player');
    if (parent && host.parentElement !== parent) parent.append(host);
  }
  document.addEventListener('fullscreenchange', mount);
  document.addEventListener('yt-navigate-finish', mount);
  mount();
  chrome.runtime.onMessage.addListener(message => {
    if (message.type !== 'caption') return;
    mount();
    if (message.en !== undefined) {
      en.textContent = message.en; zh.textContent = message.zh || '';
      clearTimeout(timer); timer = setTimeout(() => { en.textContent = ''; zh.textContent = ''; }, 12000);
    }
    // Routine listening messages stay in popup; only preparation/errors cover the video.
    status.textContent = message.status && !/正在生成|正在聆听/.test(message.status) ? message.status : '';
  });
})();
