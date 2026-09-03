const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const ROOT = __dirname;
const CONFIG_PATH = path.join(ROOT, 'update-config.json');
const VERSION_PATH = path.join(ROOT, 'VERSION');
const TMP_ROOT = path.join(ROOT, '.update-tmp');
const BACKUP_ROOT = path.join(ROOT, '.update-backup');

function log(msg) {
  console.log(`[Updater] ${msg}`);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function safePath(rel) {
  const normalized = path.normalize(String(rel || '')).replace(/^([/\\])+/, '');
  const full = path.resolve(ROOT, normalized);
  if (!full.startsWith(path.resolve(ROOT) + path.sep) && full !== path.resolve(ROOT)) {
    throw new Error(`허용되지 않은 경로: ${rel}`);
  }
  return { normalized, full };
}

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function parseVersion(v) {
  return String(v || '0').trim().split(/[.-]/).map(x => {
    const n = Number.parseInt(x, 10);
    return Number.isFinite(n) ? n : 0;
  });
}

function compareVersions(a, b) {
  const aa = parseVersion(a), bb = parseVersion(b);
  const n = Math.max(aa.length, bb.length);
  for (let i = 0; i < n; i++) {
    const av = aa[i] || 0, bv = bb[i] || 0;
    if (av < bv) return -1;
    if (av > bv) return 1;
  }
  return 0;
}

async function fetchWithTimeout(url, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ctrl.signal, cache: 'no-store' });
    if (!r.ok) throw new Error(`HTTP ${r.status}: ${url}`);
    return r;
  } finally {
    clearTimeout(timer);
  }
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
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
    log('update-config.json이 없어 업데이트 확인을 건너뜁니다.');
    return;
  }

  const config = readJson(CONFIG_PATH);
  if (!config.enabled) {
    log('자동업데이트가 아직 비활성화되어 있습니다.');
    return;
  }
  if (!/^https:\/\//i.test(String(config.manifestUrl || ''))) {
    throw new Error('manifestUrl은 https:// 주소여야 합니다.');
  }

  const timeoutMs = Number(config.timeoutMs) || 15000;
  const currentVersion = fs.existsSync(VERSION_PATH)
    ? fs.readFileSync(VERSION_PATH, 'utf8').trim()
    : '0.0.0';

  log(`현재 버전 ${currentVersion} · 업데이트 확인 중...`);
  const manifestRes = await fetchWithTimeout(config.manifestUrl, timeoutMs);
  const manifest = await manifestRes.json();

  if (!manifest || !manifest.version || !Array.isArray(manifest.files)) {
    throw new Error('업데이트 매니페스트 형식이 올바르지 않습니다.');
  }
  if (compareVersions(currentVersion, manifest.version) >= 0) {
    log(`최신 버전입니다. (${currentVersion})`);
    return;
  }

  log(`새 버전 ${manifest.version} 발견. 파일 검증을 시작합니다.`);
  cleanup(TMP_ROOT);
  fs.mkdirSync(TMP_ROOT, { recursive: true });

  const downloaded = [];
  for (const item of manifest.files) {
    if (!item.path || !item.url || !item.sha256) {
      throw new Error('매니페스트 파일 항목에 path/url/sha256이 필요합니다.');
    }
    if (!/^https:\/\//i.test(String(item.url))) {
      throw new Error(`https가 아닌 업데이트 URL: ${item.url}`);
    }

    const target = safePath(item.path);
    const protectedPaths = [
      'update-config.json',
      '.private',
      '.logs',
      '.update-backup',
      '.update-tmp'
    ];
    if (protectedPaths.some(p => target.normalized === p || target.normalized.startsWith(p + path.sep))) {
      throw new Error(`사용자/보안 데이터 경로는 자동업데이트로 덮어쓸 수 없습니다: ${target.normalized}`);
    }

    const r = await fetchWithTimeout(item.url, timeoutMs);
    const buf = Buffer.from(await r.arrayBuffer());
    const hash = sha256(buf);
    if (hash.toLowerCase() !== String(item.sha256).toLowerCase()) {
      throw new Error(`무결성 검증 실패: ${item.path}`);
    }

    const tmp = path.join(TMP_ROOT, target.normalized);
    ensureDir(tmp);
    fs.writeFileSync(tmp, buf);
    downloaded.push({ ...item, normalized: target.normalized, target: target.full, tmp });
    log(`검증 완료: ${item.path}`);
  }

  const backupDir = path.join(BACKUP_ROOT, `${currentVersion}_to_${manifest.version}_${timestamp()}`);
  fs.mkdirSync(backupDir, { recursive: true });
  const changed = [];

  try {
    for (const item of downloaded) {
      if (fs.existsSync(item.target)) {
        const backup = path.join(backupDir, item.normalized);
        copyFilePreserve(item.target, backup);
      }
    }
    if (fs.existsSync(VERSION_PATH)) {
      copyFilePreserve(VERSION_PATH, path.join(backupDir, 'VERSION'));
    }

    for (const item of downloaded) {
      ensureDir(item.target);
      const staging = item.target + '.update-new';
      fs.copyFileSync(item.tmp, staging);
      fs.renameSync(staging, item.target);
      changed.push(item.normalized);
    }

    fs.writeFileSync(VERSION_PATH, String(manifest.version).trim() + '\n', 'utf8');

    const packageChanged = changed.includes('package.json');
    if (packageChanged || manifest.runNpmInstall === true) {
      log('의존성 업데이트 중 (npm install)...');
      const result = spawnSync('npm', ['install'], {
        cwd: ROOT,
        stdio: 'inherit',
        shell: process.platform === 'win32'
      });
      if (result.status !== 0) throw new Error('npm install 실패');
    }

    log(`업데이트 완료: ${currentVersion} → ${manifest.version}`);
    log(`백업 위치: ${backupDir}`);
    cleanup(TMP_ROOT);
  } catch (e) {
    log(`업데이트 실패: ${e.message}`);
    log('기존 파일 복구를 시도합니다.');
    try {
      for (const item of downloaded) {
        const backup = path.join(backupDir, item.normalized);
        if (fs.existsSync(backup)) {
          copyFilePreserve(backup, item.target);
        }
      }
      const versionBackup = path.join(backupDir, 'VERSION');
      if (fs.existsSync(versionBackup)) copyFilePreserve(versionBackup, VERSION_PATH);
      log('복구 완료.');
    } catch (restoreErr) {
      log(`자동 복구 중 오류: ${restoreErr.message}`);
    }
    cleanup(TMP_ROOT);
    throw e;
  }
}

main().catch(err => {
  console.error(`[Updater] ${err.message}`);
  console.error('[Updater] 업데이트를 건너뛰고 기존 버전을 실행합니다.');
  process.exitCode = 0;
});
