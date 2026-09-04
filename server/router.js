const fs=require('fs');
const { originalFromStoredName }=require('../document-store');
const { send,readJsonBody,serveStatic }=require('./http');

function createRequestHandler({port,publicDir,version,openai,storage,documentStore,extractDocxText}){
  return async function handler(req,res){
    try{
      if(req.method==='GET'&&req.url==='/api/config') return send(res,200,JSON.stringify({configured:openai.configured,model:openai.model,version,storage:storage.info()}));
      if(req.method==='GET'&&req.url==='/api/data'){
        const info=storage.info();if(!info.available)return send(res,200,JSON.stringify({...info,state:null}));
        let state=null,error=null;try{state=storage.readState();}catch(e){error=e?.message||'OneDrive 데이터 파일을 읽지 못했습니다.';}
        return send(res,200,JSON.stringify({...info,state,error}));
      }
      if(req.method==='POST'&&req.url==='/api/data'){
        const payload=await readJsonBody(req,12_000_000);if(!payload?.state||typeof payload.state!=='object')return send(res,400,JSON.stringify({error:'저장할 데이터가 없습니다.'}));
        try{const saved=storage.writeState(payload.state,{forceBackup:payload?.reason==='manual-backup'});return send(res,200,JSON.stringify({ok:true,storage:storage.info(),updatedAt:saved.updatedAt}));}
        catch(e){return send(res,e?.code==='NO_ONEDRIVE'?503:500,JSON.stringify({error:e?.message||'OneDrive 저장에 실패했습니다.'}));}
      }
      if(req.method==='GET'&&req.url==='/api/documents'){
        if(!documentStore)return send(res,200,JSON.stringify({available:false,documents:[]}));
        try{return send(res,200,JSON.stringify({available:true,root:storage.userDocumentDir,documents:documentStore.listDocx()}));}
        catch(e){return send(res,500,JSON.stringify({error:e?.message||'원본 Word 보관함을 읽지 못했습니다.'}));}
      }
      if(req.method==='DELETE'&&String(req.url||'').startsWith('/api/documents?')){
        if(!documentStore)return send(res,503,JSON.stringify({error:'OneDrive 원본 파일 보관함을 사용할 수 없습니다.'}));
        const u=new URL(req.url,`http://127.0.0.1:${port}`),storedName=u.searchParams.get('name')||'';
        try{const deleted=documentStore.deleteDocx(storedName);return deleted?send(res,200,JSON.stringify({ok:true})):send(res,404,JSON.stringify({error:'원본 Word 파일을 찾지 못했습니다.'}));}
        catch(e){return send(res,400,JSON.stringify({error:e?.message||'원본 Word 파일을 삭제하지 못했습니다.'}));}
      }
      if(req.method==='GET'&&String(req.url||'').startsWith('/api/documents/download?')){
        if(!documentStore)return send(res,503,JSON.stringify({error:'OneDrive 원본 파일 보관함을 사용할 수 없습니다.'}));
        const u=new URL(req.url,`http://127.0.0.1:${port}`),storedName=u.searchParams.get('name')||'';let full;
        try{full=documentStore.resolveDocx(storedName);}catch(e){return send(res,400,JSON.stringify({error:e.message}));}
        if(!fs.existsSync(full)||!fs.statSync(full).isFile())return send(res,404,JSON.stringify({error:'원본 Word 파일을 찾지 못했습니다.'}));
        const encoded=encodeURIComponent(originalFromStoredName(storedName));
        res.writeHead(200,{'Content-Type':'application/vnd.openxmlformats-officedocument.wordprocessingml.document','Content-Length':fs.statSync(full).size,'Content-Disposition':`attachment; filename="recipe.docx"; filename*=UTF-8''${encoded}`,'Cache-Control':'no-store'});
        return fs.createReadStream(full).pipe(res);
      }
      if(req.method==='POST'&&req.url==='/api/analyze'){
        const p=await readJsonBody(req,1_000_000),text=String(p.text||'').trim();if(!text)return send(res,400,JSON.stringify({error:'내용을 입력해 주세요.'}));
        return send(res,200,JSON.stringify(await openai.analyzeInbox(text,p.currentDate)));
      }
      if(req.method==='POST'&&req.url==='/api/parse-recipes'){
        const p=await readJsonBody(req,4_000_000),text=String(p.text||'').trim();if(!text)return send(res,400,JSON.stringify({error:'레시피 내용을 입력해 주세요.'}));
        return send(res,200,JSON.stringify(await openai.parseRecipes(text,'직접 입력')));
      }
      if(req.method==='POST'&&req.url==='/api/parse-docx'){
        const p=await readJsonBody(req,30_000_000),filename=String(p.filename||'recipe.docx');
        if(!filename.toLowerCase().endsWith('.docx'))return send(res,400,JSON.stringify({error:'.docx Word 파일만 지원합니다.'}));
        const base64=String(p.base64||'');if(!base64)return send(res,400,JSON.stringify({error:'Word 파일 데이터가 없습니다.'}));
        const buffer=Buffer.from(base64,'base64');if(!buffer.length)return send(res,400,JSON.stringify({error:'Word 파일을 읽을 수 없습니다.'}));if(buffer.length>20_000_000)return send(res,413,JSON.stringify({error:'Word 파일은 20MB 이하로 업로드해 주세요.'}));
        let sourceDocument=null;if(documentStore){try{sourceDocument=documentStore.saveDocx(filename,buffer);}catch(e){return send(res,500,JSON.stringify({error:`원본 Word 파일을 OneDrive에 보관하지 못했습니다: ${e.message}`}));}}
        const extracted=await extractDocxText(buffer);if(!extracted||extracted.length<10)return send(res,400,JSON.stringify({error:'Word 파일에서 텍스트를 찾지 못했습니다. 사진/스캔 이미지로만 된 문서는 현재 버전에서 인식하지 못합니다.'}));
        const result=await openai.parseRecipes(extracted,`Word 파일: ${filename}`);result.sourceFilename=filename;result.sourceDocument=sourceDocument;result.extractedChars=extracted.length;
        return send(res,200,JSON.stringify(result));
      }
      if(req.method==='GET')return serveStatic(req,res,publicDir);
      return send(res,405,'Method Not Allowed','text/plain; charset=utf-8');
    }catch(e){return send(res,e?.code==='NO_API_KEY'?503:500,JSON.stringify({error:e?.message||'오류가 발생했습니다.'}));}
  };
}
module.exports={createRequestHandler};
