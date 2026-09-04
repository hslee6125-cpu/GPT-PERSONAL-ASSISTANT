(function(root){
  const GPA=root.GPA,$=GPA.$;
  function setStatus(text,bad=false){const el=$('systemSettingsStatus');if(!el)return;el.textContent=text;el.classList.toggle('storage-bad',bad);}
  function apply(data){
    $('autoStartSetting').checked=data.autoStart!==false;
    $('openBrowserSetting').checked=data.openBrowserOnLaunch!==false;
    $('updateRestartSetting').checked=data.updateRestartEnabled!==false;
    $('systemSettingsPlatform').textContent=data.autoStartSupported?'Windows 자동 실행 지원':'현재 환경: 설정만 저장';
    if(data.autoStartSupported){
      if(data.autoStart===false)setStatus('Windows 자동 실행 꺼짐');
      else setStatus(data.autoStartRegistered?'✓ Windows 자동 실행 등록됨':'Windows 자동 실행 미등록');
    }else setStatus('Windows에서 실행하면 시작프로그램에 자동 등록됩니다.');
  }
  async function load(){
    try{const r=await fetch('/api/system/settings');const d=await r.json();if(!r.ok)throw new Error(d.error||'설정을 읽지 못했습니다.');apply(d);}
    catch(e){setStatus(e.message||'실행 설정을 읽지 못했습니다.',true);}
  }
  async function save(){
    const btn=$('saveSystemSettings');btn.disabled=true;const old=btn.textContent;btn.textContent='저장 중...';setStatus('설정 적용 중...');
    try{
      const payload={autoStart:$('autoStartSetting').checked,openBrowserOnLaunch:$('openBrowserSetting').checked,updateRestartEnabled:$('updateRestartSetting').checked};
      const r=await fetch('/api/system/settings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});const d=await r.json();if(!r.ok)throw new Error(d.error||'설정 저장 실패');apply(d);
      setStatus(d.autoStartSupported?(d.autoStart?(d.autoStartRegistered?'✓ 저장 완료 · Windows 자동 실행 등록됨':'저장됐지만 Windows 자동 실행이 아직 등록되지 않았습니다.'):'✓ 저장 완료 · 자동 실행 꺼짐'):'✓ 설정 저장 완료',d.autoStart===true&&d.autoStartSupported&&!d.autoStartRegistered);
    }catch(e){setStatus(e.message||'실행 설정을 저장하지 못했습니다.',true);}
    finally{btn.disabled=false;btn.textContent=old;}
  }
  function bind(){const btn=$('saveSystemSettings');if(btn)btn.addEventListener('click',save);}
  GPA.systemSettings={bind,load};
})(window);
