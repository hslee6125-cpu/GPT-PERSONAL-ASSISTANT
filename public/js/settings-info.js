(function(root){
  const GPA=root.GPA,$=GPA.$;
  let config=null;
  const text=(id,value)=>{const el=$(id);if(el)el.textContent=value;};
  function renderStorage(){
    const s=GPA.state||{};
    text('settingsBrowserStorage','사용 중 · 로컬 비상 사본');
    if(!config?.storage){text('settingsOneDriveStatus','확인 중');text('settingsOneDrivePath','확인 중');return;}
    if(!config.storage.available){text('settingsOneDriveStatus','사용 불가 · 브라우저 저장만 사용');text('settingsOneDrivePath','OneDrive 폴더를 찾지 못함');return;}
    text('settingsOneDriveStatus',s.oneDriveReady?'연결됨 · 자동 저장 준비':'OneDrive 감지됨 · 동기화 확인 중');
    text('settingsOneDrivePath',config.storage.root||s.oneDrivePath||'GPT Personal Assistant');
  }
  function applyConfig(data){
    config=data||{};
    text('settingsAppVersion',`v${config.version||'?'}`);
    text('settingsServerAddress',root.location?.origin||'http://127.0.0.1:8787');
    let schema='1';try{schema=String(GPA.currentState?.().schemaVersion??1);}catch{}
    text('settingsSchemaVersion',`v${schema}`);
    text('settingsOpenAIStatus',config.configured?'연결됨 · 사용 가능':'API 키 필요 · 사용 불가');
    text('settingsOpenAIModel',config.configured?(config.model||'확인 불가'):'—');
    renderStorage();
  }
  async function load(){
    try{const r=await fetch('/api/config',{cache:'no-store'}),d=await r.json();if(!r.ok)throw new Error('설정 정보를 읽지 못했습니다.');applyConfig(d);}
    catch{ text('settingsAppVersion','서버 연결 실패');text('settingsOpenAIStatus','확인 실패');text('settingsOpenAIModel','—');renderStorage(); }
  }
  function filterCommands(){
    const input=$('commandSearch'),empty=$('commandSearchEmpty');if(!input)return;
    const q=input.value.trim().toLowerCase();let visible=0;
    document.querySelectorAll('#commandReference .command-reference-row').forEach(row=>{const hay=(row.dataset.command||row.textContent||'').toLowerCase();const show=!q||hay.includes(q);row.hidden=!show;if(show)visible++;});
    if(empty)empty.hidden=visible!==0;
  }
  async function copyCommand(button){
    const value=button.dataset.copy||'';if(!value)return;
    try{await navigator.clipboard.writeText(value);const old=button.textContent;button.textContent='복사됨';setTimeout(()=>{button.textContent=old;},900);}
    catch{button.textContent='복사 실패';setTimeout(()=>{button.textContent='복사';},900);}
  }
  function bind(){
    $('commandSearch')?.addEventListener('input',filterCommands);
    document.querySelectorAll('.command-copy').forEach(button=>button.addEventListener('click',()=>copyCommand(button)));
  }
  GPA.settingsInfo={bind,load,applyConfig,renderStorage};
})(window);
