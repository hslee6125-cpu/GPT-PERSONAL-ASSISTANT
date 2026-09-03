const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function sanitizeOriginalFilename(input) {
  let name = String(input || 'recipe.docx').replace(/\\/g, '/');
  name = name.split('/').pop() || 'recipe.docx';
  name = name.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').replace(/[. ]+$/g, '');
  if (!name.toLowerCase().endsWith('.docx')) name += '.docx';
  if (!name || name === '.docx') name = 'recipe.docx';
  return name;
}

function isSafeStoredName(name) {
  if (!name || typeof name !== 'string') return false;
  if (name !== path.basename(name)) return false;
  return name.toLowerCase().endsWith('.docx');
}

function formatStamp(date) {
  const pad = n => String(n).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth()+1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function originalFromStoredName(storedName) {
  const m = String(storedName).match(/^\d{8}-\d{6}-[a-zA-Z0-9]+__(.+\.docx)$/i);
  return m ? m[1] : storedName;
}

function createDocumentStore(rootDir, options = {}) {
  const now = options.now || (() => new Date());
  const idFactory = options.idFactory || (() => crypto.randomBytes(4).toString('hex'));

  function ensure() {
    fs.mkdirSync(rootDir, { recursive: true });
  }

  function saveDocx(originalFilename, buffer) {
    ensure();
    const originalName = sanitizeOriginalFilename(originalFilename);
    const stamp = formatStamp(now());
    let storedName;
    let full;
    do {
      storedName = `${stamp}-${idFactory()}__${originalName}`;
      full = path.join(rootDir, storedName);
    } while (fs.existsSync(full));

    fs.writeFileSync(full, buffer, { flag: 'wx' });
    const stat = fs.statSync(full);
    return {
      storedName,
      originalName,
      size: stat.size,
      savedAt: stat.mtime.toISOString()
    };
  }

  function listDocx() {
    ensure();
    return fs.readdirSync(rootDir)
      .filter(isSafeStoredName)
      .map(storedName => {
        const full = path.join(rootDir, storedName);
        const stat = fs.statSync(full);
        return {
          storedName,
          originalName: originalFromStoredName(storedName),
          size: stat.size,
          savedAt: stat.mtime.toISOString()
        };
      })
      .sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));
  }

  function resolveDocx(storedName) {
    if (!isSafeStoredName(storedName)) throw new Error('허용되지 않은 파일 이름입니다.');
    const full = path.resolve(rootDir, storedName);
    const root = path.resolve(rootDir);
    if (!full.startsWith(root + path.sep)) throw new Error('허용되지 않은 파일 경로입니다.');
    return full;
  }

  function deleteDocx(storedName) {
    const full = resolveDocx(storedName);
    if (!fs.existsSync(full)) return false;
    const stat = fs.statSync(full);
    if (!stat.isFile()) throw new Error('허용되지 않은 파일입니다.');
    fs.unlinkSync(full);
    return true;
  }

  return { saveDocx, listDocx, resolveDocx, deleteDocx };
}

module.exports = {
  createDocumentStore,
  sanitizeOriginalFilename,
  isSafeStoredName,
  originalFromStoredName
};
