const fs = require("fs");
const path = require("path");
const https = require("https");
const { spawnSync } = require("child_process");
const { URL } = require("url");

const ROOT = __dirname;
const CONFIG_PATH = path.join(ROOT, "update-config.json");
const VERSION_PATH = path.join(ROOT, "VERSION");
const TMP_ROOT = path.join(ROOT, ".update-tmp");
const BACKUP_ROOT = path.join(ROOT, ".update-backup");

function log(msg) { console.log(`[Updater] ${msg}`); }

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
}

function safePath(rel) {
  const normalized = path.normalize(String(rel || "")).replace(/^([/\\])+/, "");
  const full = path.resolve(ROOT, normalized);
  const rootResolved = path.resolve(ROOT);
  if (!full.startsWith(rootResolved + path.sep) && full !== rootResolved) {
    throw new Error(`허용되지 않은 경로: ${rel}`);
  }
  return { normalized, full };
}

function parseVersion(v) {
  return String(v || "0").trim().split(/[.-]/).map(x => {
    const n = Number.parseInt(x, 10);
    return Number.isFinite(n) ? n : 0;
  });
}
function compareVersions(a, b) {
  const aa = parseVersion(a), bb = parseVersion(b);
  const n = Math.max(aa.length, bb.length);
  for (let i=0;i<n;i++) {
    const av=aa[i]||0, bv=bb[i]||0;
    if (av<bv) return -1;
    if (av>bv) return 1;
  }
  return 0;
}

function httpsGetBuffer(url, timeoutMs=20000, redirects=5) {
  return new Promise((resolve,reject)=>{
    let u;
    try { u = new URL(url); } catch { return reject(new Error(`잘못된 URL: ${url}`)); }
    if (u.protocol !== "https:") return reject(new Error("HTTPS 주소만 허용됩니다."));

    const req = https.get({
      hostname:u.hostname,
      port:443,
      path:u.pathname+u.search,
      family:4,
      headers:{
        "User-Agent":"GPT-Personal-Assistant-Updater/4.3.9",
        "Cache-Control":"no-cache",
        "Accept":"*/*",
        "Connection":"close"
      },
      timeout:timeoutMs
    }, res=>{
      const status=Number(res.statusCode||0);
      if ([301,302,303,307,308].includes(status) && res.headers.location) {
        res.resume();
        if (redirects<=0) return reject(new Error("리다이렉트가 너무 많습니다."));
        const next=new URL(res.headers.location,u).toString();
        return httpsGetBuffer(next,timeoutMs,redirects-1).then(resolve,reject);
      }
      if (status<200 || status>=300) {
        res.resume();
        return reject(new Error(`HTTP ${status}: ${url}`));
      }
      const chunks=[];
      res.on("data",c=>chunks.push(c));
      res.on("end",()=>resolve(Buffer.concat(chunks)));
    });
    req.on("timeout",()=>req.destroy(new Error("업데이트 서버 연결 시간 초과")));
    req.on("error",e=>reject(new Error(`업데이트 서버 연결 실패${e.code?` [${e.code}]`:""}: ${e.message}`)));
  });
}

async function getJson(url, timeoutMs) {
  // Cache bust manifest so GitHub Raw CDN doesn't serve an old commit.
  const sep = url.includes("?") ? "&" : "?";
  const buf = await httpsGetBuffer(`${url}${sep}t=${Date.now()}`, timeoutMs);
  try { return JSON.parse(buf.toString("utf8").replace(/^\uFEFF/,"")); }
  catch { throw new Error("update-manifest.json을 읽지 못했습니다."); }
}

function ensureDir(file){ fs.mkdirSync(path.dirname(file),{recursive:true}); }
function cleanup(dir){ try{fs.rmSync(dir,{recursive:true,force:true});}catch{} }
function copyFile(src,dst){ ensureDir(dst); fs.copyFileSync(src,dst); }
function timestamp(){return new Date().toISOString().replace(/[:.]/g,"-");}

async function main(){
  if (!fs.existsSync(CONFIG_PATH)) { log("update-config.json 없음. 건너뜁니다."); return; }
  const cfg=readJson(CONFIG_PATH);
  if (!cfg.enabled) { log("자동업데이트 OFF"); return; }

  const manifestUrl=String(cfg.manifestUrl||"");
  const allowedBase=String(cfg.allowedBaseUrl||"");
  if (!manifestUrl.startsWith("https://")) throw new Error("manifestUrl은 HTTPS여야 합니다.");
  if (!allowedBase.startsWith("https://")) throw new Error("allowedBaseUrl이 설정되지 않았습니다.");

  const timeoutMs=Number(cfg.timeoutMs)||20000;
  const current=fs.existsSync(VERSION_PATH)?fs.readFileSync(VERSION_PATH,"utf8").replace(/^\uFEFF/,"").trim():"0.0.0";

  log(`현재 ${current} · GitHub 확인 중...`);
  const manifest=await getJson(manifestUrl,timeoutMs);
  if (!manifest?.version || !Array.isArray(manifest.files)) throw new Error("manifest 형식 오류");

  if (compareVersions(current,manifest.version)>=0) {
    log(`최신 버전입니다. (${current})`);
    return;
  }

  log(`새 버전 ${manifest.version} 발견`);
  cleanup(TMP_ROOT); fs.mkdirSync(TMP_ROOT,{recursive:true});
  const downloaded=[];
  const protectedPaths=["update-config.json",".private",".logs",".update-backup",".update-tmp"];

  for (const item of manifest.files) {
    if (!item?.path || !item?.url) throw new Error("manifest 파일 항목에 path/url이 필요합니다.");
    const url=String(item.url);
    if (!url.startsWith(allowedBase)) throw new Error(`허용되지 않은 업데이트 주소: ${url}`);

    const target=safePath(item.path);
    if (protectedPaths.some(p=>target.normalized===p || target.normalized.startsWith(p+path.sep))) {
      throw new Error(`보호된 경로: ${target.normalized}`);
    }

    // Cache bust every raw file too.
    const sep=url.includes("?")?"&":"?";
    const buf=await httpsGetBuffer(`${url}${sep}t=${Date.now()}`,timeoutMs);
    if (!buf.length) throw new Error(`빈 파일: ${item.path}`);

    const tmp=path.join(TMP_ROOT,target.normalized);
    ensureDir(tmp); fs.writeFileSync(tmp,buf);
    downloaded.push({normalized:target.normalized,target:target.full,tmp});
    log(`다운로드 완료: ${item.path}`);
  }

  const backupDir=path.join(BACKUP_ROOT,`${current}_to_${manifest.version}_${timestamp()}`);
  fs.mkdirSync(backupDir,{recursive:true});

  try {
    for (const item of downloaded) {
      if (fs.existsSync(item.target)) copyFile(item.target,path.join(backupDir,item.normalized));
    }
    if (fs.existsSync(VERSION_PATH)) copyFile(VERSION_PATH,path.join(backupDir,"VERSION"));

    for (const item of downloaded) {
      ensureDir(item.target);
      const staging=item.target+".update-new";
      fs.copyFileSync(item.tmp,staging);
      try { fs.renameSync(staging,item.target); }
      catch {
        if (fs.existsSync(item.target)) fs.rmSync(item.target,{force:true});
        fs.renameSync(staging,item.target);
      }
    }

    fs.writeFileSync(VERSION_PATH,String(manifest.version).trim()+"\n","utf8");

    if (downloaded.some(x=>x.normalized==="package.json") || manifest.runNpmInstall===true) {
      log("npm install...");
      const result=spawnSync("npm",["install"],{cwd:ROOT,stdio:"inherit",shell:process.platform==="win32"});
      if (result.status!==0) throw new Error("npm install 실패");
    }

    cleanup(TMP_ROOT);
    log(`업데이트 성공: ${current} → ${manifest.version}`);
  } catch(err) {
    log(`적용 실패: ${err.message}. 복구 중...`);
    for (const item of downloaded) {
      const b=path.join(backupDir,item.normalized);
      if (fs.existsSync(b)) copyFile(b,item.target);
    }
    const vb=path.join(backupDir,"VERSION");
    if (fs.existsSync(vb)) copyFile(vb,VERSION_PATH);
    cleanup(TMP_ROOT);
    throw err;
  }
}

main().catch(err=>{
  console.error(`[Updater] ${err.message}`);
  console.error("[Updater] 기존 버전으로 계속 실행합니다.");
  process.exitCode=0;
});
