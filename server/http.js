const fs=require('fs');
const path=require('path');
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8'};

function send(res,status,body,type='application/json; charset=utf-8'){
  res.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(body);
}
function readJsonBody(req,maxBytes=30_000_000){
  return new Promise((resolve,reject)=>{let body='';let rejected=false;
    req.on('data',c=>{if(rejected)return;body+=c;if(Buffer.byteLength(body)>maxBytes){rejected=true;reject(new Error('업로드 파일이 너무 큽니다.'));req.destroy();}});
    req.on('end',()=>{if(rejected)return;try{resolve(JSON.parse(body||'{}'));}catch{reject(new Error('잘못된 요청 형식입니다.'));}});req.on('error',reject);
  });
}
function serveStatic(req,res,publicDir){
  let raw;try{raw=decodeURIComponent((req.url||'/').split('?')[0]);}catch{return send(res,400,'Bad Request','text/plain; charset=utf-8');}
  const rel=raw==='/'?'index.html':raw.replace(/^\/+/, '');
  const file=path.normalize(path.join(publicDir,rel));
  if(!file.startsWith(path.resolve(publicDir)+path.sep)&&file!==path.resolve(publicDir)) return send(res,403,'Forbidden','text/plain; charset=utf-8');
  fs.stat(file,(err,stat)=>{if(err||!stat.isFile())return send(res,404,'Not Found','text/plain; charset=utf-8');res.writeHead(200,{'Content-Type':MIME[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});fs.createReadStream(file).pipe(res);});
}
module.exports={send,readJsonBody,serveStatic};
