const {app,BrowserWindow,dialog,shell}=require('electron');
const {spawn}=require('node:child_process');
const path=require('node:path');
let child,win;
app.whenReady().then(()=>{
 child=spawn(process.execPath,[path.join(__dirname,'server.mjs')],{cwd:__dirname,env:{...process.env,ELECTRON_RUN_AS_NODE:'1',PLAYER_PORT:'0',PLAYER_MODEL_DIR:path.join(app.getPath('userData'),'models')},stdio:['ignore','pipe','pipe']});
 let output='';let errors='';
 child.stderr.on('data',data=>{errors=(errors+data).slice(-4000);});
 child.stdout.on('data',data=>{output+=data;const match=output.match(/PLAYER_READY (http:\/\/127\.0\.0\.1:\d+)/);if(!match||win)return;
 const origin=match[1];win=new BrowserWindow({width:1280,height:840,minWidth:760,minHeight:520,title:'视听',backgroundColor:'#151616',webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true}});
 win.webContents.setWindowOpenHandler(({url})=>{if(/^https:\/\/(console\.cloud\.google\.com|console\.volcengine\.com|cloud\.google\.com)\//.test(url))shell.openExternal(url);return {action:'deny'};});
 win.webContents.on('will-navigate',(event,url)=>{if(new URL(url).origin!==origin)event.preventDefault();});
 win.loadURL(origin);
 });
 child.on('error',error=>dialog.showErrorBox('启动失败',error.message));
 child.on('exit',code=>{if(code&& !app.isQuitting)dialog.showErrorBox('本机服务已停止',errors||`退出代码 ${code}`);});
});
app.on('before-quit',()=>{app.isQuitting=true;child?.kill();});
app.on('window-all-closed',()=>app.quit());
