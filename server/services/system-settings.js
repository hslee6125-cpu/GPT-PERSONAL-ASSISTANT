const fs=require('fs');
const path=require('path');

const STARTUP_PROXY_NAME='GPT Personal Assistant Auto Start.vbs';
const DEFAULT_SETTINGS={autoStart:true,openBrowserOnLaunch:true,updateRestartEnabled:true};

function readJson(file){try{return JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));}catch{return {};}}
function normalize(raw={}){
  return {
    autoStart:raw.autoStart!==false,
    openBrowserOnLaunch:raw.openBrowserOnLaunch!==false,
    updateRestartEnabled:raw.updateRestartEnabled!==false
  };
}
function escapeVbsString(value){return String(value||'').replace(/"/g,'""');}
function createSystemSettingsService({root,platform=process.platform,appData=process.env.APPDATA||''}={}){
  if(!root)throw new Error('root가 필요합니다.');
  const privateDir=path.join(root,'.private');
  const settingsFile=path.join(privateDir,'settings.json');
  const launcher=path.join(root,'launcher.vbs');
  function raw(){return readJson(settingsFile);}
  function startupDir(){
    if(platform!=='win32')return '';
    if(!String(appData||'').trim())throw new Error('Windows 시작프로그램 폴더를 찾을 수 없습니다. APPDATA 환경 변수를 확인해 주세요.');
    return path.join(appData,'Microsoft','Windows','Start Menu','Programs','Startup');
  }
  function startupFile(){return path.join(startupDir(),STARTUP_PROXY_NAME);}
  function proxyText(){
    const target=escapeVbsString(launcher);
    return [
      'Set shell = CreateObject("WScript.Shell")',
      `shell.Run Chr(34) & WScript.FullName & Chr(34) & " " & Chr(34) & "${target}" & Chr(34), 0, False`,
      'Set shell = Nothing',
      ''
    ].join('\r\n');
  }
  function autoStartRegistered(){
    if(platform!=='win32')return false;
    let file;
    try{file=startupFile();}catch{return false;}
    if(!fs.existsSync(file))return false;
    try{return fs.readFileSync(file,'utf8').toLowerCase().includes(String(launcher).toLowerCase());}catch{return false;}
  }
  function syncAutoStart(enabled){
    if(platform!=='win32')return {supported:false,registered:false};
    const file=startupFile();
    if(enabled){
      if(!fs.existsSync(launcher))throw new Error('Windows 자동 실행 등록 실패: launcher.vbs를 찾을 수 없습니다.');
      fs.mkdirSync(path.dirname(file),{recursive:true});
      fs.writeFileSync(file,proxyText(),'utf8');
      return {supported:true,registered:autoStartRegistered()};
    }
    try{fs.rmSync(file,{force:true});}catch(e){throw new Error(`Windows 자동 실행 해제 실패: ${e.message}`);}
    return {supported:true,registered:false};
  }
  function get(){
    const values=normalize(raw());
    return {...values,platform,autoStartSupported:platform==='win32',autoStartRegistered:platform==='win32'?autoStartRegistered():false};
  }
  function save(patch={}){
    const before=raw();
    const nextSettings=normalize({...before,...patch});
    fs.mkdirSync(privateDir,{recursive:true});
    fs.writeFileSync(settingsFile,JSON.stringify({...before,...nextSettings},null,2)+'\n','utf8');
    const registration=syncAutoStart(nextSettings.autoStart);
    return {...nextSettings,platform,autoStartSupported:platform==='win32',autoStartRegistered:registration.registered};
  }
  function ensureAutoStart(){
    const settings=normalize(raw());
    try{return syncAutoStart(settings.autoStart);}catch(err){return {supported:platform==='win32',registered:false,error:err.message};}
  }
  return {get,save,syncAutoStart,ensureAutoStart,settingsFile};
}
module.exports={STARTUP_PROXY_NAME,DEFAULT_SETTINGS,createSystemSettingsService};
