const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const https = require("https");
const { spawnSync } = require("child_process");
const { URL } = require("url");

const ROOT = __dirname;
const CONFIG_PATH = path.join(ROOT, "update-config.json");
const VERSION_PATH = path.join(ROOT, "VERSION");
const TMP_ROOT = path.join(ROOT, ".update-tmp");
const BACKUP_ROOT = path.join(ROOT, ".update-backup");

function log(msg) {
  console.log(`[Updater] ${msg}`);
}

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

function sha256(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function parseVersion(v) {
  return String(v || "0").trim().split(/[.-]/).map(x => {
    const n = Number.parseInt(x, 10);
    return Number.isFinite(n) ? n : 0;
  });
}

function compareVersions(a, b) {
  const aa = parseVersion(a);
  const bb = parseVersion(b);
  const n = Math.max(aa.length, bb.length);
  for (let i = 0; i < n; i++) {
    const av = aa[i] || 0;
    const bv = bb[i] || 0;
    if (av < bv) return -1;
    if (av > bv) return 1;
  }
  return 0;
}

function httpsGetBuffer(url, timeoutMs = 15000, redirects = 5) {
  return new Promise((resolve, reject) => {
    let u;
    try { u = new URL(url); }
    catch { return reject(new Error(`잘못된 URL: ${url}`)); }

    if (u.protocol !== "https:") {
      return reject(new Error(`HTTPS 주소만 허용됩니다: ${url}`));
    }

    const req = https.get({
      hostname: u.hostname,
      port: 443,
      path: u.pathname + u.search,
      family: 4,
      headers: {
        "User-Agent": "GPT-Personal-Assistant-Updater/4.3.8",
        "Cache-Control": "no-cache",
        "Accept": "*/*",
        "Connection": "close"
      },
      timeout: timeoutMs
    }, res => {
      const status = Number(res.statusCode || 0);

      if ([301,302,303,307,308].includes(status) && res.headers.location) {
        res.resume();
        if (redirects <= 0) return reject(new Error("업데이트 URL 리다이렉트가 너무 많습니다."));
        const next = new URL(res.headers.location, u).toString();
        return httpsGetBuffer(next, timeoutMs, redirects - 1).then(resolve, reject);
      }

      if (status < 200 || status >= 300) {
        res.resume();
        return reject(new Error(`HTTP ${status}: ${url}`));
      }

      const chunks = [];
      res.on("data", c => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks)));
    });

    req.on("timeout", () => req.destroy(new Error("업데이트 서버 연결 시간이 초과되었습니다.")));
    req.on("error", err => reject(new Error(`업데이트 서버 연결 실패${err.code ? ` [${err.code}]` : ""}: ${err.message}`)));
  });
}

async function getJson(url, timeoutMs) {
  const buf = await httpsGetBuffer(url, timeoutMs);
  try {
    return JSON.parse(buf.toString("utf8").replace(/^\uFEFF/, ""));
  } catch {
    throw new Error("update-manifest.json을 JSON으로 읽지 못했습니다.");
  }
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function ensureDir(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
}

function cleanup(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
}

function copyFilePreserve(src, dst) {
  ensureDir(dst);
  fs.copyFileSync(src, dst);
}

async function main() {
  if (!fs.existsSync(CONFIG_PATH)) {
    log("update-config.json이 없어 업데이트 확인을 건너뜁니다.");
    return;
  }

  const config = readJson(CONFIG_PATH);
  if (!config.enabled) {
    log("자동업데이트가 비활성화되어 있습니다.");
    return;
  }

  const manifestUrl = String(config.manifestUrl || "");
  if (!/^https:\/\//i.test(manifestUrl)) {
    throw new Error("manifestUrl은 https:// 주소여야 합니다.");
  }

  const timeoutMs = Number(config.timeoutMs) || 15000;
  const currentVersion = fs.existsSync(VERSION_PATH)
    ? fs.readFileSync(VERSION_PATH, "utf8").replace(/^\uFEFF/, "").trim()
    : "0.0.0";

  log(`현재 버전 ${currentVersion} · GitHub 업데이트 확인 중...`);
  const manifest = await getJson(manifestUrl, timeoutMs);

  if (!manifest || !manifest.version || !Array.isArray(manifest.files)) {
    throw new Error("업데이트 매니페스트 형식이 올바르지 않습니다.");
  }

  if (compareVersions(currentVersion, manifest.version) >= 0) {
    log(`최신 버전입니다. (${currentVersion})`);
    return;
  }

  log(`새 버전 ${manifest.version} 발견. 다운로드 및 검증을 시작합니다.`);
  cleanup(TMP_ROOT);
  fs.mkdirSync(TMP_ROOT, { recursive: true });

  const downloaded = [];
  const protectedPaths = [
    "update-config.json",
    ".private",
    ".logs",
    ".update-backup",
    ".update-tmp"
  ];

  for (const item of manifest.files) {
    if (!item.path || !item.url || !item.sha256) {
      throw new Error("매니페스트 파일 항목에 path/url/sha256이 필요합니다.");
    }

    const target = safePath(item.path);
    if (protectedPaths.some(p => target.normalized === p || target.normalized.startsWith(p + path.sep))) {
      throw new Error(`보안/사용자 데이터 경로는 업데이트할 수 없습니다: ${target.normalized}`);
    }

    const buf = await httpsGetBuffer(String(item.url), timeoutMs);
    const hash = sha256(buf);

    if (hash.toLowerCase() !== String(item.sha256).toLowerCase()) {
      throw new Error(`SHA-256 검증 실패: ${item.path}`);
    }

    const tmp = path.join(TMP_ROOT, target.normalized);
    ensureDir(tmp);
    fs.writeFileSync(tmp, buf);
    downloaded.push({ normalized: target.normalized, target: target.full, tmp });
    log(`검증 완료: ${item.path}`);
  }

  const backupDir = path.join(
    BACKUP_ROOT,
    `${currentVersion}_to_${manifest.version}_${timestamp()}`
  );
  fs.mkdirSync(backupDir, { recursive: true });

  const changed = [];

  try {
    for (const item of downloaded) {
      if (fs.existsSync(item.target)) {
        copyFilePreserve(item.target, path.join(backupDir, item.normalized));
      }
    }
    if (fs.existsSync(VERSION_PATH)) {
      copyFilePreserve(VERSION_PATH, path.join(backupDir, "VERSION"));
    }

    for (const item of downloaded) {
      ensureDir(item.target);
      const staging = item.target + ".update-new";
      fs.copyFileSync(item.tmp, staging);

      try {
        fs.renameSync(staging, item.target);
      } catch {
        // Windows에서 기존 파일 위 rename이 실패하는 경우
        if (fs.existsSync(item.target)) fs.rmSync(item.target, { force: true });
        fs.renameSync(staging, item.target);
      }
      changed.push(item.normalized);
    }

    fs.writeFileSync(VERSION_PATH, String(manifest.version).trim() + "\n", "utf8");

    if (changed.includes("package.json") || manifest.runNpmInstall === true) {
      log("의존성 확인 중 (npm install)...");
      const result = spawnSync("npm", ["install"], {
        cwd: ROOT,
        stdio: "inherit",
        shell: process.platform === "win32"
      });
      if (result.status !== 0) throw new Error("npm install 실패");
    }

    cleanup(TMP_ROOT);
    log(`업데이트 완료: ${currentVersion} → ${manifest.version}`);
    log(`백업 위치: ${backupDir}`);
  } catch (err) {
    log(`업데이트 적용 실패: ${err.message}`);
    log("기존 파일 복구를 시도합니다.");

    for (const item of downloaded) {
      const backup = path.join(backupDir, item.normalized);
      if (fs.existsSync(backup)) {
        copyFilePreserve(backup, item.target);
      }
    }

    const versionBackup = path.join(backupDir, "VERSION");
    if (fs.existsSync(versionBackup)) {
      copyFilePreserve(versionBackup, VERSION_PATH);
    }

    cleanup(TMP_ROOT);
    throw err;
  }
}

main().catch(err => {
  console.error(`[Updater] ${err.message}`);
  console.error("[Updater] 업데이트를 건너뛰고 기존 버전을 실행합니다.");
  process.exitCode = 0;
});
