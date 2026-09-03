const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const version = fs.readFileSync(path.join(ROOT, 'VERSION'), 'utf8').trim();
const baseUrl = process.argv[2];
if (!baseUrl || !/^https:\/\//i.test(baseUrl)) {
  console.error('사용법: node tools/build-update-manifest.js https://raw.githubusercontent.com/USERNAME/REPO/main');
  process.exit(1);
}

const files = [
  'server.js',
  'public/index.html',
  'package.json',
  'updater.js',
  'launcher.ps1',
  'launcher.vbs',
  '초기설정.ps1',
  '개인비서_초기설정.cmd',
  'assistant.ico',
  'README.md'
];

const result = {
  version,
  runNpmInstall: false,
  files: files.filter(rel => fs.existsSync(path.join(ROOT, rel))).map(rel => {
    const buf = fs.readFileSync(path.join(ROOT, rel));
    return {
      path: rel.replace(/\\/g, '/'),
      url: `${baseUrl.replace(/\/$/, '')}/${encodeURI(rel.replace(/\\/g, '/'))}`,
      sha256: crypto.createHash('sha256').update(buf).digest('hex')
    };
  })
};

fs.writeFileSync(path.join(ROOT, 'update-manifest.json'), JSON.stringify(result, null, 2) + '\n');
console.log('update-manifest.json 생성 완료');
