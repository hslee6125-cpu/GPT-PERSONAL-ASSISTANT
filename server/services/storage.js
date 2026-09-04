const fs = require('fs');
const path = require('path');

function detectOneDriveRoot(env = process.env) {
  const candidates = [
    env.OneDrive,
    env.OneDriveConsumer,
    env.OneDriveCommercial,
    env.USERPROFILE ? path.join(env.USERPROFILE, 'OneDrive') : null
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) return path.resolve(candidate);
    } catch {}
  }
  return null;
}

function createStorageService(options = {}) {
  const oneDriveRoot = options.oneDriveRoot === undefined ? detectOneDriveRoot() : options.oneDriveRoot;
  const userDataRoot = oneDriveRoot ? path.join(oneDriveRoot, 'GPT Personal Assistant') : null;
  const userDataDir = userDataRoot ? path.join(userDataRoot, 'Data') : null;
  const userBackupDir = userDataRoot ? path.join(userDataRoot, 'Backups') : null;
  const userDataFile = userDataDir ? path.join(userDataDir, 'assistant-data.json') : null;
  const userDocumentDir = userDataRoot ? path.join(userDataRoot, 'Documents', 'Recipes') : null;
  const backupIntervalMs = options.backupIntervalMs || 30 * 60 * 1000;
  const maxBackups = options.maxBackups || 100;
  let lastBackupScanAt = 0;

  function normalizeState(input) {
    const source = input && typeof input === 'object' ? input : {};
    return {
      schemaVersion: 1,
      assistant: Array.isArray(source.assistant) ? source.assistant : [],
      recipes: Array.isArray(source.recipes) ? source.recipes : [],
      cooking: Array.isArray(source.cooking) ? source.cooking : [],
      updatedAt: new Date().toISOString()
    };
  }

  function ensureDirs() {
    if (!userDataDir || !userBackupDir) return false;
    fs.mkdirSync(userDataDir, { recursive: true });
    fs.mkdirSync(userBackupDir, { recursive: true });
    return true;
  }

  function readState() {
    if (!userDataFile || !fs.existsSync(userDataFile)) return null;
    const raw = fs.readFileSync(userDataFile, 'utf8').replace(/^\uFEFF/, '');
    return normalizeState(JSON.parse(raw));
  }

  function backupNameFromDate(d = new Date()) {
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}.json`;
  }

  function latestBackupMtime() {
    if (!userBackupDir || !fs.existsSync(userBackupDir)) return 0;
    let latest = 0;
    for (const name of fs.readdirSync(userBackupDir)) {
      if (!name.toLowerCase().endsWith('.json')) continue;
      try { latest = Math.max(latest, fs.statSync(path.join(userBackupDir, name)).mtimeMs); } catch {}
    }
    return latest;
  }

  function pruneBackups() {
    if (!userBackupDir || !fs.existsSync(userBackupDir)) return;
    const entries = fs.readdirSync(userBackupDir)
      .filter(name => name.toLowerCase().endsWith('.json'))
      .map(name => {
        const full = path.join(userBackupDir, name);
        let mtimeMs = 0;
        try { mtimeMs = fs.statSync(full).mtimeMs; } catch {}
        return { full, mtimeMs };
      })
      .sort((a,b) => b.mtimeMs - a.mtimeMs);
    for (const item of entries.slice(maxBackups)) {
      try { fs.rmSync(item.full, { force: true }); } catch {}
    }
  }

  function maybeBackupCurrent(force = false) {
    if (!userDataFile || !fs.existsSync(userDataFile)) return;
    ensureDirs();
    const now = Date.now();
    if (!force && now - lastBackupScanAt < Math.min(backupIntervalMs, 60_000)) return;
    lastBackupScanAt = now;
    const latest = latestBackupMtime();
    if (!force && now - latest < backupIntervalMs) return;
    fs.copyFileSync(userDataFile, path.join(userBackupDir, backupNameFromDate()));
    pruneBackups();
  }

  function writeState(input, options = {}) {
    if (!oneDriveRoot || !userDataFile) {
      const err = new Error('OneDrive 폴더를 찾지 못했습니다.');
      err.code = 'NO_ONEDRIVE';
      throw err;
    }
    ensureDirs();
    const state = normalizeState(input);
    const tmp = `${userDataFile}.tmp`;
    maybeBackupCurrent(Boolean(options.forceBackup));
    fs.writeFileSync(tmp, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
    JSON.parse(fs.readFileSync(tmp, 'utf8'));
    try { fs.renameSync(tmp, userDataFile); }
    catch {
      if (fs.existsSync(userDataFile)) fs.rmSync(userDataFile, { force: true });
      fs.renameSync(tmp, userDataFile);
    }
    return state;
  }

  function info() {
    return {
      available: Boolean(oneDriveRoot),
      provider: oneDriveRoot ? 'OneDrive' : null,
      root: userDataRoot,
      dataFile: userDataFile,
      documentsDir: userDocumentDir,
      exists: Boolean(userDataFile && fs.existsSync(userDataFile))
    };
  }

  return {
    oneDriveRoot,
    userDataRoot,
    userDocumentDir,
    normalizeState,
    readState,
    writeState,
    info
  };
}

module.exports = { detectOneDriveRoot, createStorageService };
