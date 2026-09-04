const path=require('path');
const {spawn}=require('child_process');

function createUpdateWatcher({root,systemSettings,updater,platform=process.platform,intervalMs=60_000,spawnImpl=spawn,onRestartRequested=()=>{}}){
  let timer=null,running=false,stopped=false;
  async function checkNow(){
    if(stopped||running||platform!=='win32')return {skipped:true};
    running=true;
    try{
      const result=await updater.main({silent:true});
      if(result?.updated){
        const settings=systemSettings.get();
        if(settings.updateRestartEnabled){
          const helper=path.join(root,'restart-helper.vbs');
          const child=spawnImpl('wscript.exe',[helper],{detached:true,stdio:'ignore',windowsHide:true});
          if(child&&typeof child.unref==='function')child.unref();
          onRestartRequested(result);
        }
      }
      return result;
    }catch(err){console.error(`[Update Watcher] ${err.message}`);return {updated:false,error:err.message};}
    finally{running=false;}
  }
  function start(){
    if(platform!=='win32'||timer)return;
    timer=setInterval(()=>{checkNow();},intervalMs);
    if(timer&&typeof timer.unref==='function')timer.unref();
  }
  function stop(){stopped=true;if(timer)clearInterval(timer);timer=null;}
  return {start,stop,checkNow};
}
module.exports={createUpdateWatcher};
