const http=require('http');
const fs=require('fs');
const path=require('path');
const { createDocumentStore }=require('./document-store');
const { createStorageService }=require('./server/services/storage');
const { createOpenAIService }=require('./server/services/openai');
const { extractDocxText }=require('./server/services/docx');
const { createRequestHandler }=require('./server/router');
const { createSystemSettingsService }=require('./server/services/system-settings');
const { createUpdateWatcher }=require('./server/services/update-watcher');
const updater=require('./updater');

const PORT=Number(process.env.PORT||8787);
const PUBLIC_DIR=path.join(__dirname,'public');
const VERSION_FILE=path.join(__dirname,'VERSION');
const APP_VERSION=fs.existsSync(VERSION_FILE)?fs.readFileSync(VERSION_FILE,'utf8').trim():'unknown';
const OPENAI_MODEL=process.env.OPENAI_MODEL||'gpt-5-nano';
const OPENAI_API_KEY=String(process.env.OPENAI_API_KEY||'').replace(/^\uFEFF/,'').trim().replace(/^["']+|["']+$/g,'').replace(/[\s\uFEFF]+/g,'');

const storage=createStorageService();
const documentStore=storage.userDocumentDir?createDocumentStore(storage.userDocumentDir):null;
const openai=createOpenAIService({apiKey:OPENAI_API_KEY,model:OPENAI_MODEL});
const systemSettings=createSystemSettingsService({root:__dirname});
const handler=createRequestHandler({port:PORT,publicDir:PUBLIC_DIR,version:APP_VERSION,openai,storage,documentStore,extractDocxText,systemSettings});
const server=http.createServer(handler);
let restartRequested=false;
const updateWatcher=createUpdateWatcher({
  root:__dirname,systemSettings,updater,
  onRestartRequested:()=>{
    if(restartRequested)return;restartRequested=true;
    console.log('[Update Watcher] 새 버전 적용 완료 · 서버 재시작');
    server.close(()=>process.exit(0));
    const force=setTimeout(()=>process.exit(0),5000);if(force.unref)force.unref();
  }
});

server.listen(PORT,'127.0.0.1',()=>{
  const autoStart=systemSettings.ensureAutoStart();
  if(autoStart.error)console.error(`[Auto Start] ${autoStart.error}`);
  updateWatcher.start();
  console.log('');
  console.log('GPT Personal Assistant v4');
  console.log(`http://127.0.0.1:${PORT}`);
  console.log(`Model: ${OPENAI_MODEL}`);
  console.log(`API key: ${openai.configured?'configured':'NOT configured'}`);
  console.log(`OneDrive: ${storage.oneDriveRoot||'NOT DETECTED'}`);
  console.log('');
});
