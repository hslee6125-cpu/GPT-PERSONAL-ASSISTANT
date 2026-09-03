const fs = require('fs');
const path = require('path');
const readline = require('readline');

const configPath = path.join(__dirname, 'update-config.json');
const current = fs.existsSync(configPath)
  ? JSON.parse(fs.readFileSync(configPath, 'utf8'))
  : { enabled: false, manifestUrl: '', timeoutMs: 15000 };

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = q => new Promise(resolve => rl.question(q, resolve));

(async () => {
  console.log('');
  console.log('GPT 개인비서 자동업데이트 설정');
  console.log('--------------------------------');
  console.log(`현재 상태: ${current.enabled ? '켜짐' : '꺼짐'}`);
  console.log(`현재 주소: ${current.manifestUrl || '(없음)'}`);
  console.log('');

  const url = (await ask('update-manifest.json HTTPS 주소를 입력하세요: ')).trim();
  if (!/^https:\/\//i.test(url)) {
    console.error('https:// 로 시작하는 주소가 필요합니다.');
    rl.close();
    process.exit(1);
  }

  const next = {
    enabled: true,
    manifestUrl: url,
    timeoutMs: Number(current.timeoutMs) || 15000
  };
  fs.writeFileSync(configPath, JSON.stringify(next, null, 2) + '\n', 'utf8');
  console.log('');
  console.log('자동업데이트가 활성화되었습니다.');
  console.log('이제 개인비서_실행.cmd를 실행할 때마다 최신 버전을 확인합니다.');
  rl.close();
})().catch(e => {
  console.error(e.message);
  rl.close();
  process.exit(1);
});
