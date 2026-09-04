const http=require('http');
const fs=require('fs');
const path=require('path');
const { createDocumentStore }=require('./document-store');
const { createStorageService }=require('./server/services/storage');
const { createOpenAIService }=require('./server/services/openai');
const { extractDocxText }=require('./server/services/docx');
const { createRequestHandler }=require('./server/router');

const PORT=Number(process.env.PORT||8787);
const PUBLIC_DIR=path.join(__dirname,'public');
const VERSION_FILE=path.join(__dirname,'VERSION');
const APP_VERSION=fs.existsSync(VERSION_FILE)?fs.readFileSync(VERSION_FILE,'utf8').trim():'unknown';
const OPENAI_MODEL=process.env.OPENAI_MODEL||'gpt-5-nano';
const OPENAI_API_KEY=String(process.env.OPENAI_API_KEY||'').replace(/^\uFEFF/,'').trim().replace(/^["']+|["']+$/g,'').replace(/[\s\uFEFF]+/g,'');

const storage=createStorageService();
const documentStore=storage.userDocumentDir?createDocumentStore(storage.userDocumentDir):null;
const openai=createOpenAIService({apiKey:OPENAI_API_KEY,model:OPENAI_MODEL});
const handler=createRequestHandler({port:PORT,publicDir:PUBLIC_DIR,version:APP_VERSION,openai,storage,documentStore,extractDocxText});
const server=http.createServer(handler);

server.listen(PORT,'127.0.0.1',()=>{
  console.log('');
  console.log('GPT Personal Assistant v4');
  console.log(`http://127.0.0.1:${PORT}`);
  console.log(`Model: ${OPENAI_MODEL}`);
  console.log(`API key: ${openai.configured?'configured':'NOT configured'}`);
  console.log(`OneDrive: ${storage.oneDriveRoot||'NOT DETECTED'}`);
  console.log('');
});
