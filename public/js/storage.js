(function(root){
  const GPA=root.GPA, s=GPA.state;
  GPA.currentState=()=>({schemaVersion:1,assistant:s.assistant,recipes:s.recipes,cooking:s.cooking});
  GPA.keepEmergencyBrowserCopy=()=>{
    localStorage.setItem(GPA.KEYS.assistant,JSON.stringify(s.assistant));
    localStorage.setItem(GPA.KEYS.recipes,JSON.stringify(s.recipes));
    localStorage.setItem(GPA.KEYS.cooking,JSON.stringify(s.cooking));
  };
  GPA.setStorageBadge=(text,ok=true)=>{const el=GPA.$('storageBadge');if(el){el.textContent=text;el.hidden=Boolean(ok);el.classList.toggle('storage-bad',!ok);}GPA.settingsInfo?.renderStorage?.();};
  GPA.queueOneDriveSave=(reason='auto')=>{
    if(!s.oneDriveAvailable||!s.oneDriveReady)return;
    clearTimeout(s.saveTimer);
    s.saveTimer=setTimeout(()=>{
      const snapshot=JSON.parse(JSON.stringify(GPA.currentState()));
      s.saveChain=s.saveChain.then(async()=>{
        const r=await fetch('/api/data',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({state:snapshot,reason}),keepalive:true});
        const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'OneDrive 저장 실패');
        GPA.setStorageBadge(`✓ OneDrive 자동저장 · ${s.oneDrivePath||'GPT Personal Assistant'}`,true);
      }).catch(e=>GPA.setStorageBadge(`⚠ OneDrive 저장 실패 · 브라우저 비상 사본 유지 (${e.message})`,false));
    },250);
  };
  GPA.persist=(reason='auto')=>{GPA.keepEmergencyBrowserCopy();GPA.renderAll?.();GPA.queueOneDriveSave(reason);};
  GPA.initializeOneDriveData=async()=>{
    try{
      const r=await fetch('/api/data',{cache:'no-store'}),d=await r.json();if(!r.ok)throw new Error(d.error||'OneDrive 상태 확인 실패');
      s.oneDriveAvailable=Boolean(d.available);s.oneDrivePath=d.root||'';
      if(!s.oneDriveAvailable){s.oneDriveReady=false;GPA.setStorageBadge('⚠ OneDrive 폴더를 찾지 못해 브라우저 비상 저장만 사용 중',false);GPA.renderAll?.();return;}
      if(d.error){s.oneDriveReady=false;GPA.setStorageBadge(`⚠ OneDrive 데이터 읽기 오류 · ${d.error}`,false);GPA.renderAll?.();return;}
      const cloud=d.state;
      const cloudHasData=cloud&&(['assistant','recipes','cooking'].some(k=>Array.isArray(cloud[k])&&cloud[k].length>0));
      const localHasData=s.assistant.length>0||s.recipes.length>0||s.cooking.length>0;
      if(cloudHasData){s.assistant=Array.isArray(cloud.assistant)?cloud.assistant:[];s.recipes=Array.isArray(cloud.recipes)?cloud.recipes:[];s.cooking=Array.isArray(cloud.cooking)?cloud.cooking:[];GPA.keepEmergencyBrowserCopy();s.oneDriveReady=true;GPA.setStorageBadge(`✓ OneDrive에서 데이터 불러옴 · ${s.oneDrivePath}`,true);GPA.renderAll?.();return;}
      s.oneDriveReady=true;
      const reason=localHasData?'migration':'initial';
      const save=await fetch('/api/data',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({state:GPA.currentState(),reason})});
      const sd=await save.json().catch(()=>({}));if(!save.ok)throw new Error(sd.error||(localHasData?'기존 데이터 OneDrive 이전 실패':'OneDrive 초기 파일 생성 실패'));
      GPA.setStorageBadge(localHasData?`✓ 기존 데이터를 OneDrive로 이전 완료 · ${s.oneDrivePath}`:`✓ OneDrive 자동저장 준비 완료 · ${s.oneDrivePath}`,true);GPA.renderAll?.();
    }catch(e){s.oneDriveAvailable=false;s.oneDriveReady=false;GPA.setStorageBadge(`⚠ OneDrive 연결 실패 · 브라우저 비상 사본 유지 (${e.message})`,false);GPA.renderAll?.();}
  };
})(window);
