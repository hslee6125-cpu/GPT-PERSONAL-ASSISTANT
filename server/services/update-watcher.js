const fs=require('fs');
const path=require('path');
const {spawn}=require('child_process');

function readVersion(root){
  try{return fs.readFileSync(path.join(root,'VERSION'),'utf8').replace(/^\uFEFF/,'').trim();}
  catch{return '';}
}

function createUpdateWatcher({
  root,
  systemSettings,
  updater,
  platform=process.platform,
  intervalMs=60_000,
  spawnImpl=spawn,
  onRestartRequested=()=>{},
  runtimeVersion=readVersion(root),
  processId=process.pid
}){
  let timer=null,running=false,stopped=false,restartIssued=false;

  function requestRestart(result){
    if(restartIssued)return false;
    const settings=systemSettings.get();
    if(!settings.updateRestartEnabled)return false;
    const helper=path.join(root,'restart-helper.vbs');
    const child=spawnImpl('wscript.exe',[helper,String(processId)],{detached:true,stdio:'ignore',windowsHide:true});
    if(child&&typeof child.unref==='function')child.unref();
    restartIssued=true;
    onRestartRequested(result);
    return true;
  }

  async function checkNow(){
    if(stopped||running||platform!=='win32')return {skipped:true};
    running=true;
    try{
      const diskVersion=readVersion(root);
      if(runtimeVersion&&diskVersion&&diskVersion!==runtimeVersion){
        const result={updated:true,current:runtimeVersion,version:diskVersion,reason:'local-version-changed'};
        requestRestart(result);
        return result;
      }
      const result=await updater.main({silent:true});
      if(result?.updated)requestRestart(result);
      return result;
    }catch(err){
      console.error(`[Update Watcher] ${err.message}`);
      return {updated:false,error:err.message};
    }finally{running=false;}
  }

  function start(){
    if(platform!=='win32'||timer)return;
    timer=setInterval(()=>{checkNow();},intervalMs);
    if(timer&&typeof timer.unref==='function')timer.unref();
  }
  function stop(){stopped=true;if(timer)clearInterval(timer);timer=null;}
  return {start,stop,checkNow};
}

module.exports={createUpdateWatcher,readVersion};
