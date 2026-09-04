const fs=require('fs');
const path=require('path');
const {spawnSync}=require('child_process');

const TASK_NAME='GPT Personal Assistant Auto Start';
const DEFAULT_SETTINGS={autoStart:true,openBrowserOnLaunch:true,updateRestartEnabled:true};

function readJson(file){try{return JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));}catch{return {};}}
function normalize(raw={}){
  return {
    autoStart:raw.autoStart!==false,
    openBrowserOnLaunch:raw.openBrowserOnLaunch!==false,
    updateRestartEnabled:raw.updateRestartEnabled!==false
  };
}
function createSystemSettingsService({root,platform=process.platform,windowsDir=process.env.WINDIR||'C:\\Windows',spawnSyncImpl=spawnSync}={}){
  if(!root)throw new Error('root가 필요합니다.');
  const privateDir=path.join(root,'.private');
  const settingsFile=path.join(privateDir,'settings.json');
  const launcher=path.join(root,'launcher.vbs');
  function raw(){return readJson(settingsFile);}
  function taskRegistered(){
    if(platform!=='win32')return false;
    const result=spawnSyncImpl('schtasks.exe',['/Query','/TN',TASK_NAME],{encoding:'utf8',windowsHide:true});
    return result.status===0;
  }
  function syncAutoStart(enabled){
    if(platform!=='win32')return {supported:false,registered:false};
    if(enabled){
      const wscript=path.join(windowsDir,'System32','wscript.exe');
      const command=`"${wscript}" "${launcher}"`;
      const result=spawnSyncImpl('schtasks.exe',['/Create','/TN',TASK_NAME,'/TR',command,'/SC','ONLOGON','/RL','LIMITED','/F'],{encoding:'utf8',windowsHide:true});
      if(result.status!==0)throw new Error(`Windows 자동 실행 등록 실패: ${(result.stderr||result.stdout||'').trim()||'schtasks 오류'}`);
      return {supported:true,registered:true};
    }
    spawnSyncImpl('schtasks.exe',['/Delete','/TN',TASK_NAME,'/F'],{encoding:'utf8',windowsHide:true});
    return {supported:true,registered:false};
  }
  function get(){
    const values=normalize(raw());
    return {...values,platform,taskSupported:platform==='win32',taskRegistered:platform==='win32'?taskRegistered():false};
  }
  function save(patch={}){
    const before=raw();
    const nextSettings=normalize({...before,...patch});
    fs.mkdirSync(privateDir,{recursive:true});
    fs.writeFileSync(settingsFile,JSON.stringify({...before,...nextSettings},null,2)+'\n','utf8');
    const task=syncAutoStart(nextSettings.autoStart);
    return {...nextSettings,platform,taskSupported:platform==='win32',taskRegistered:task.registered};
  }
  function ensureAutoStart(){
    const settings=normalize(raw());
    try{return syncAutoStart(settings.autoStart);}catch(err){return {supported:platform==='win32',registered:false,error:err.message};}
  }
  return {get,save,syncAutoStart,ensureAutoStart,settingsFile};
}
module.exports={TASK_NAME,DEFAULT_SETTINGS,createSystemSettingsService};
