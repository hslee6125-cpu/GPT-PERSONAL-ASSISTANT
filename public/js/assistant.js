(function(root){
  const GPA=root.GPA,s=GPA.state,$=GPA.$,esc=GPA.esc;
  const typeLabels={todo:'할 일',memo:'메모',project:'프로젝트'};
  const priorityLabels={high:'높음',medium:'보통',low:'낮음'};
  function setInboxError(message=''){
    const el=$('inboxError');if(!el)return;
    el.textContent=message;el.style.display=message?'block':'none';
  }
  function setInboxResult(message=''){
    const el=$('inboxResult');if(!el)return;
    el.textContent=message;el.classList.toggle('show',Boolean(message));
  }
  async function analyzeInbox(){
    const input=$('inboxText');
    const text=input.value.trim();if(!text)return;
    const btn=$('analyzeInbox');btn.disabled=true;const original=btn.textContent;btn.textContent='GPT 정리 중...';
    setInboxError('');setInboxResult('');
    const started=performance.now();
    try{
      const r=await fetch('/api/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text,currentDate:GPA.today()})});
      const d=await r.json();if(!r.ok)throw new Error(d.error||'분석 실패');
      const items=(Array.isArray(d.items)?d.items:[]).map(AssistantUtils.normalizeInboxItem).filter(Boolean);
      if(!items.length)throw new Error('저장 가능한 항목을 찾지 못했습니다. 내용을 조금 더 구체적으로 입력해 주세요.');
      const now=new Date().toISOString();
      const saved=items.map(x=>({id:GPA.uid(),...x,done:false,createdAt:now}));
      s.assistant.unshift(...saved);
      input.value='';GPA.persist();
      const result=AssistantUtils.summarizeInboxItems(items);
      const modelSummary=String(d.summary||'').trim();
      setInboxResult(`✓ ${result.total}개 저장 · ${result.text}${modelSummary?` — ${modelSummary}`:''}`);
      const elapsed=((performance.now()-started)/1000).toFixed(1);btn.title=`최근 GPT 분류 ${elapsed}초`;
    }catch(e){setInboxError(e.message||'분석 중 오류가 발생했습니다.');}finally{btn.disabled=false;btn.textContent=original;}
  }
  function toggle(id){const x=s.assistant.find(x=>x.id===id);if(x){x.done=!x.done;GPA.persist();}}
  function remove(id){if(!confirm('이 항목을 삭제할까요?'))return;s.assistant=s.assistant.filter(x=>x.id!==id);if(s.editingAssistantId===id)s.editingAssistantId=null;GPA.persist();}
  function startEdit(id){s.editingAssistantId=id;render();requestAnimationFrame(()=>$(`edit-title-${id}`)?.focus());}
  function cancelEdit(){s.editingAssistantId=null;render();}
  function saveEdit(id){
    try{
      s.assistant=AssistantUtils.updateAssistantItem(s.assistant,id,{
        title:$(`edit-title-${id}`)?.value,details:$(`edit-details-${id}`)?.value,
        type:$(`edit-type-${id}`)?.value,priority:$(`edit-priority-${id}`)?.value,
        dueDate:$(`edit-due-${id}`)?.value,projectTitle:$(`edit-project-${id}`)?.value
      });
      s.editingAssistantId=null;GPA.persist();
    }catch(e){alert(e.message);}
  }
  function editCard(x){
    return `<div class="item assistant-edit-card" style="${x.done?'opacity:.68':''}">
      <div class="edit-grid">
        <div class="edit-span"><label>내용 / 제목</label><input id="edit-title-${x.id}" value="${esc(x.title||'')}" maxlength="200"></div>
        <div class="edit-span"><label>상세 내용</label><textarea id="edit-details-${x.id}" class="edit-details">${esc(x.details||'')}</textarea></div>
        <div><label>분류</label><select id="edit-type-${x.id}">${Object.entries(typeLabels).map(([v,l])=>`<option value="${v}" ${x.type===v?'selected':''}>${l}</option>`).join('')}</select></div>
        <div><label>중요도</label><select id="edit-priority-${x.id}">${Object.entries(priorityLabels).map(([v,l])=>`<option value="${v}" ${(x.priority||'medium')===v?'selected':''}>${l}</option>`).join('')}</select></div>
        <div><label>날짜</label><input id="edit-due-${x.id}" type="date" value="${esc(x.dueDate||'')}"></div>
        <div><label>연결 프로젝트</label><input id="edit-project-${x.id}" value="${esc(x.projectTitle||'')}" placeholder="선택 사항"></div>
      </div>
      <div class="actions edit-actions"><button class="small ghost" data-assistant-action="cancel">취소</button><button class="small primary" data-assistant-action="save" data-id="${x.id}">저장</button></div>
    </div>`;
  }
  function viewCard(x){
    const tags=(Array.isArray(x.tags)?x.tags:[]).map(tag=>`<span class="chip tag-chip">#${esc(tag)}</span>`).join('');
    return `<div class="item" style="${x.done?'opacity:.55':''}"><div class="itemrow"><div class="assistant-content"><div class="title">${esc(x.title)}</div><div class="details">${esc(x.details||'')}</div><div class="meta"><span class="chip">${esc(typeLabels[x.type]||x.type)}</span><span class="chip ${esc(x.priority||'medium')}">${esc(priorityLabels[x.priority||'medium']||x.priority)}</span>${x.dueDate?`<span class="chip">${esc(x.dueDate)}</span>`:''}${x.projectTitle?`<span class="chip">↳ ${esc(x.projectTitle)}</span>`:''}${tags}</div></div><div class="actions"><button class="small ghost" data-assistant-action="edit" data-id="${x.id}">수정</button><button class="small ghost" data-assistant-action="toggle" data-id="${x.id}">${x.done?'되돌리기':'완료'}</button><button class="small ghost danger" data-assistant-action="delete" data-id="${x.id}">삭제</button></div></div></div>`;
  }
  function render(){
    $('todoKpi').textContent=s.assistant.filter(x=>x.type==='todo'&&!x.done).length;
    $('memoKpi').textContent=s.assistant.filter(x=>x.type==='memo'&&!x.done).length;
    $('projKpi').textContent=s.assistant.filter(x=>x.type==='project'&&!x.done).length;
    $('doneKpi').textContent=s.assistant.filter(x=>x.done).length;
    $('assistantList').innerHTML=s.assistant.length?s.assistant.map(x=>s.editingAssistantId===x.id?editCard(x):viewCard(x)).join(''):'<div class="empty">저장된 항목이 없습니다.</div>';
  }
  function bind(){
    $('analyzeInbox').addEventListener('click',analyzeInbox);
    $('inboxText').addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){e.preventDefault();analyzeInbox();}});
    $('assistantList').addEventListener('click',e=>{const b=e.target.closest('button[data-assistant-action]');if(!b)return;const id=b.dataset.id;switch(b.dataset.assistantAction){case'edit':startEdit(id);break;case'toggle':toggle(id);break;case'delete':remove(id);break;case'save':saveEdit(id);break;case'cancel':cancelEdit();break;}});
  }

  GPA.assistant={render,bind};
})(window);
