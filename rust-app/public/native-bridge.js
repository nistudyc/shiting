export function setupNativeBridge({ video, captions, loadSource, api, notify, configureBuffer, bufferState }) {
  if (!window.SHITING_NATIVE) return;
  document.documentElement.classList.add('native-shell');
  video.controls = false;
  const send = value => window.webkit.messageHandlers.player.postMessage(value);
  const click = id => document.querySelector(id).click();
  const set = (id, value, event = 'change') => {
    const element = document.querySelector(id); element.value = String(value);
    element.dispatchEvent(new Event(event, {bubbles:true}));
  };
  window.SHITING_NATIVE_COMMAND = async command => {
    try {
      switch (command.type) {
        case 'source': await loadSource(command.url, command.label); break;
        case 'play': if (video.paused) click('#play'); else video.pause(); break;
        case 'captions': click('#toggle'); break;
        case 'settings':
          configureBuffer(command);
          if (Number.isFinite(command.fontScale)) {
            document.documentElement.style.setProperty('--app-font-scale', String(Math.min(1.4, Math.max(0.85, command.fontScale))));
          }
          set('#mode', command.mode); set('#opacity',command.opacity,'input'); set('#theme',command.appearance);
          if (document.querySelector('#provider').value !== command.provider) set('#provider',command.provider);
          break;
        case 'google': await api('/api/config',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({provider:'google',key:command.key})}); notify('Google密钥已保存在本次应用内存中。'); break;
        case 'volcano': await api('/api/config',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({provider:'volcano',ak:command.ak,sk:command.sk})}); notify('火山密钥已保存在本次应用内存中。'); break;
        case 'clear': captions.clear(); break;
        case 'pairing': send({type:'pairing',token:window.SHITING_TOKEN}); break;
        default: throw new Error('不支持的播放器操作');
      }
    } catch (error) { notify(error.message,true); }
  };
  let last = '';
  const publish = () => {
    const toggle = document.querySelector('#toggle').textContent;
    const state = {type:'state',...bufferState(),sourceURL:document.querySelector('#sourceUrl').value,sourceName:document.querySelector('#sourceName').textContent,
      playStatus:document.querySelector('#playStatus').textContent,captionStatus:document.querySelector('#status').textContent,
      playing:!video.paused,captionsEnabled:toggle==='关闭字幕',captionsPreparing:toggle==='取消准备',
      error:document.querySelector('#status').parentElement.classList.contains('error'),
      history:captions.visibleEntries().map(row=>({id:row.key,time:row.time,en:row.en,zh:row.zh,sourceName:row.sourceName,session:row.session}))};
    const serialized=JSON.stringify(state); if(serialized!==last){last=serialized;send(state);}
  };
  const timer=setInterval(publish,250);
  window.addEventListener('pagehide',()=>clearInterval(timer),{once:true});
  document.querySelector('#settingsDialog').addEventListener('toggle',event=>{
    if(event.newState==='open'){document.querySelector('#settingsDialog').close();send({type:'settings'});}
  });
  fetch('/channels.json').then(response=>response.json()).then(channels=>send({type:'channels',channels})).catch(error=>notify(error.message,true));
  publish();
}
