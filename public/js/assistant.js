(function(root){
  const GPA=root.GPA,s=GPA.state,$=GPA.$,esc=GPA.esc;
  const typeLabels={todo:'할 일',memo:'메모',project:'프로젝트'};
  const priorityLabels={high:'높음',medium:'보통',low:'낮음'};
  const filterLabels={todo:'할 일',memo:'메모',project:'장기 프로젝트',done:'완료',trash:'휴지통'};
  let activeFilter='todo';
  let activeTodoMode='todo';

  function setInboxError(message=''){const el=$('inboxError');if(!el)return;el.textContent=message;el.style.display=message?'block':'none';}
  function setInboxResult(message=''){const el=$('inboxResult');if(!el)return;el.textContent=message;el.classList.toggle('show',Boolean(message));}
  async function analyzeInbox(){
    const input=$('inboxText');const text=input.value.trim();if(!text)return;
    if(GPA.search?.handleSubmit(text)){GPA.search.refreshButtonMode();return;}
    GPA.search?.clear();
    const localCommand=AssistantUtils.parseLocalInboxCommand(text,GPA.today());
    if(localCommand){
      setInboxError('');setInboxResult('');
      if(!localCommand.item){setInboxError(`${localCommand.command} 뒤에 내용을 입력해 주세요.`);GPA.search?.refreshButtonMode();return;}
      const saved={id:GPA.uid(),...localCommand.item,done:false,createdAt:new Date().toISOString()};
      s.assistant.unshift(saved);input.value='';GPA.persist(`local-command-${localCommand.command}`);
      const kind=saved.scheduleOnly?'일정':saved.type==='memo'?'메모':'할 일';
      setInboxResult(`✓ ${kind} 저장 · ${saved.dueDate?`${saved.dueDate} · `:''}${saved.dueTime?`${saved.dueTime} · `:''}${saved.title}`);GPA.search?.refreshButtonMode();return;
    }
    const btn=$('analyzeInbox');btn.disabled=true;btn.textContent='GPT 정리 중...';setInboxError('');setInboxResult('');const started=performance.now();
    try{
      const r=await fetch('/api/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text,currentDate:GPA.today()})});
      const d=await r.json();if(!r.ok)throw new Error(d.error||'분석 실패');
      const items=(Array.isArray(d.items)?d.items:[]).map(AssistantUtils.normalizeInboxItem).filter(Boolean);
      if(!items.length)throw new Error('저장 가능한 항목을 찾지 못했습니다. 내용을 조금 더 구체적으로 입력해 주세요.');
      const now=new Date().toISOString();const saved=items.map(x=>({id:GPA.uid(),...x,done:false,createdAt:now}));s.assistant.unshift(...saved);
      const firstProject=(saved.find(x=>x.type==='project')?.title)||saved.find(x=>x.projectTitle)?.projectTitle||'';if(firstProject)projectHub.select(firstProject);
      input.value='';GPA.persist();const result=AssistantUtils.summarizeInboxItems(items);const modelSummary=String(d.summary||'').trim();
      setInboxResult(`✓ ${result.total}개 저장 · ${result.text}${modelSummary?` — ${modelSummary}`:''}`);btn.title=`최근 GPT 분류 ${((performance.now()-started)/1000).toFixed(1)}초`;
    }catch(e){setInboxError(e.message||'분석 중 오류가 발생했습니다.');}finally{btn.disabled=false;GPA.search?.refreshButtonMode();}
  }

  function toggle(id){const x=s.assistant.find(x=>x.id===id&&!x.deletedAt);if(x){s.assistant=AssistantUtils.toggleAssistantItem(s.assistant,id);GPA.persist();}}
  function softDelete(id){
    const item=s.assistant.find(x=>x.id===id&&!x.deletedAt);if(!item)return;
    const message=item.type==='project'?'프로젝트를 휴지통으로 이동할까요? 연결된 할 일·메모·일정은 그대로 유지됩니다.':'이 항목을 휴지통으로 이동할까요?';
    if(!confirm(message))return;
    s.assistant=AssistantUtils.softDeleteAssistantItem(s.assistant,id,new Date().toISOString());
    if(s.editingAssistantId===id)s.editingAssistantId=null;projectHub.clearEditorForItem(id);GPA.persist();
  }
  function restore(id){s.assistant=AssistantUtils.restoreAssistantItem(s.assistant,id);GPA.persist();}
  function permanentDelete(id){if(!confirm('이 항목을 영구 삭제할까요? 이 작업은 되돌릴 수 없습니다.'))return;s.assistant=AssistantUtils.permanentlyDeleteAssistantItem(s.assistant,id);GPA.persist();}
  function emptyTrash(){if(!AssistantUtils.filterAssistantItems(s.assistant,'trash').length)return;if(!confirm('휴지통을 비울까요? 모든 항목이 영구 삭제됩니다.'))return;s.assistant=AssistantUtils.emptyAssistantTrash(s.assistant);GPA.persist();}

  function startEdit(id){s.editingAssistantId=id;render();requestAnimationFrame(()=>$(`edit-title-${id}`)?.focus());}
  function cancelEdit(){s.editingAssistantId=null;render();}
  function saveEdit(id){
    try{
      const before=s.assistant.find(item=>item.id===id);s.assistant=AssistantUtils.updateAssistantItem(s.assistant,id,{title:$(`edit-title-${id}`)?.value,details:$(`edit-details-${id}`)?.value,type:$(`edit-type-${id}`)?.value,priority:$(`edit-priority-${id}`)?.value,dueDate:$(`edit-due-${id}`)?.value,dueTime:$(`edit-time-${id}`)?.value,projectTitle:$(`edit-project-${id}`)?.value});
      const after=s.assistant.find(item=>item.id===id);projectHub.select(after?.type==='project'?after.title:(after?.projectTitle||before?.projectTitle||projectHub.getActiveKey()));s.editingAssistantId=null;GPA.persist();
    }catch(e){alert(e.message);}
  }
  function editCard(x){
    return `<div class="item assistant-edit-card" data-assistant-item-id="${x.id}" style="${x.done?'opacity:.68':''}"><div class="edit-grid"><div class="edit-span"><label>내용 / 제목</label><input id="edit-title-${x.id}" value="${esc(x.title||'')}" maxlength="200"></div><div class="edit-span"><label>상세 내용</label><textarea id="edit-details-${x.id}" class="edit-details">${esc(x.details||'')}</textarea></div><div><label>분류</label><select id="edit-type-${x.id}">${Object.entries(typeLabels).map(([v,l])=>`<option value="${v}" ${x.type===v?'selected':''}>${l}</option>`).join('')}</select></div><div><label>중요도</label><select id="edit-priority-${x.id}">${Object.entries(priorityLabels).map(([v,l])=>`<option value="${v}" ${(x.priority||'medium')===v?'selected':''}>${l}</option>`).join('')}</select></div><div><label>날짜</label><input id="edit-due-${x.id}" type="date" value="${esc(x.dueDate||'')}"></div><div><label>시간</label><input id="edit-time-${x.id}" type="time" value="${esc(x.dueTime||'')}"></div><div><label>연결 프로젝트</label><input id="edit-project-${x.id}" value="${esc(x.projectTitle||'')}" placeholder="선택 사항"></div></div><div class="actions edit-actions"><button class="small ghost" data-assistant-action="cancel">취소</button><button class="small primary" data-assistant-action="save" data-id="${x.id}">저장</button></div></div>`;
  }
  function viewCard(x){
    const tags=(Array.isArray(x.tags)?x.tags:[]).map(tag=>`<span class="chip tag-chip">#${esc(tag)}</span>`).join('');
    const kindLabel=x.scheduleOnly?'일정':(typeLabels[x.type]||x.type);
    return `<div class="item" data-assistant-item-id="${x.id}" style="${x.done?'opacity:.55':''}"><div class="itemrow"><div class="assistant-content"><div class="title">${esc(x.title)}</div><div class="details">${esc(x.details||'')}</div><div class="meta"><span class="chip">${esc(kindLabel)}</span><span class="chip ${esc(x.priority||'medium')}">${esc(priorityLabels[x.priority||'medium']||x.priority)}</span>${x.dueDate?`<span class="chip">${esc(x.dueDate)}${x.dueTime?` · ${esc(x.dueTime)}`:''}</span>`:''}${x.projectTitle?`<span class="chip">↳ ${esc(x.projectTitle)}</span>`:''}${tags}</div></div><div class="actions"><button class="small ghost" data-assistant-action="edit" data-id="${x.id}">수정</button><button class="small ghost assistant-complete-action" data-assistant-action="toggle" data-id="${x.id}">${x.done?'되돌리기':'완료'}</button><button class="small ghost danger" data-assistant-action="delete" data-id="${x.id}">삭제</button></div></div></div>`;
  }
  function memoBoardCard(x){
    const tags=(Array.isArray(x.tags)?x.tags:[]).map(tag=>`<span class="chip">#${esc(tag)}</span>`).join('');
    const body=String(x.details||'').trim();
    return `<article class="memo-board-card" data-assistant-item-id="${x.id}" style="${x.done?'opacity:.55':''}"><div class="memo-board-main"><div class="memo-board-title">${esc(x.title)}</div><div class="memo-board-body ${body?'':'empty-body'}">${esc(body||'내용 없음')}</div></div><div class="memo-board-footer"><div class="memo-board-meta">${x.dueDate?`<span class="chip">${esc(x.dueDate)}${x.dueTime?` · ${esc(x.dueTime)}`:''}</span>`:''}${x.projectTitle?`<span class="chip">↳ ${esc(x.projectTitle)}</span>`:''}${tags}</div><div class="actions memo-board-actions"><button class="small ghost" data-assistant-action="edit" data-id="${x.id}">수정</button><button class="small ghost assistant-complete-action" data-assistant-action="toggle" data-id="${x.id}">${x.done?'되돌리기':'완료'}</button><button class="small ghost danger" data-assistant-action="delete" data-id="${x.id}">삭제</button></div></div></article>`;
  }
  function trashTypeLabel(x){if(x.activityOnly)return '활동';if(x.scheduleOnly)return '일정';return typeLabels[x.type]||'항목';}
  function trashCard(x){return `<div class="item trash-item"><div class="itemrow"><div class="assistant-content"><div class="title">${esc(x.title)}</div><div class="meta"><span class="chip">${esc(trashTypeLabel(x))}</span>${x.projectTitle?`<span class="chip">↳ ${esc(x.projectTitle)}</span>`:''}${x.deletedAt?`<span class="chip">삭제 ${esc(String(x.deletedAt).slice(0,16).replace('T',' '))}</span>`:''}</div></div><div class="actions"><button class="small ghost" data-assistant-action="restore" data-id="${x.id}">복구</button><button class="small ghost danger" data-assistant-action="permanent-delete" data-id="${x.id}">영구 삭제</button></div></div></div>`;}

  function setActiveFilter(filter,{preserveTodoMode=false}={}){if(!['todo','memo','project','done','trash'].includes(filter))return;if(filter==='todo'&&!preserveTodoMode)activeTodoMode='todo';activeFilter=filter;s.editingAssistantId=null;projectHub.resetEditor();render();GPA.navigation?.renderActive();}
  function setTodoMode(mode){if(!['todo','schedule'].includes(mode))return;activeTodoMode=mode;s.editingAssistantId=null;projectHub.resetEditor();render();}
  function maybeOpenFilteredItems(filter){setActiveFilter(filter);document.querySelector('.assistant-overview-card')?.scrollIntoView({behavior:'smooth',block:'start'});}
  const projectHub=AssistantProjects.create({GPA,typeLabels,priorityLabels,renderAssistant:()=>render(),toggleItem:toggle,softDeleteItem:softDelete,openFilter:maybeOpenFilteredItems});

  function renderTrash(items){const controls=items.length?`<div class="trash-toolbar"><div><b>휴지통</b><span>${items.length}개 항목</span></div><button type="button" class="small ghost danger" data-assistant-action="empty-trash">휴지통 비우기</button></div>`:'';$('assistantList').innerHTML=controls+(items.length?items.map(trashCard).join(''):'<div class="empty">휴지통이 비어 있습니다.</div>');}
  function render(){
    const projects=projectHub.getProjects();$('todoKpi').textContent=AssistantUtils.filterAssistantItems(s.assistant,'todo').length;$('memoKpi').textContent=AssistantUtils.filterAssistantItems(s.assistant,'memo').length;$('projKpi').textContent=projects.length;$('doneKpi').textContent=AssistantUtils.filterAssistantItems(s.assistant,'done').length;$('trashKpi').textContent=AssistantUtils.filterAssistantItems(s.assistant,'trash').length;
    document.querySelectorAll('[data-assistant-filter]').forEach(tab=>{const selected=tab.dataset.assistantFilter===activeFilter;tab.classList.toggle('active',selected);tab.setAttribute('aria-selected',selected?'true':'false');});const projectMode=activeFilter === 'project';$('assistantListPanel')?.classList.toggle('active',!projectMode);$('assistantProjectHub')?.classList.toggle('active',projectMode);if(projectMode){projectHub.render(projects);return;}
    const todoModeTabs=$('assistantTodoModeTabs');if(todoModeTabs){todoModeTabs.hidden=activeFilter!=='todo';todoModeTabs.querySelectorAll('[data-assistant-item-mode]').forEach(tab=>{const selected=tab.dataset.assistantItemMode===activeTodoMode;tab.classList.toggle('active',selected);tab.setAttribute('aria-selected',selected?'true':'false');});}
    const visible=activeFilter==='todo'?AssistantUtils.filterAssistantItems(s.assistant,activeTodoMode):AssistantUtils.filterAssistantItems(s.assistant,activeFilter);const list=$('assistantList');list.classList.toggle('memo-board',activeFilter==='memo');if(activeFilter==='trash'){renderTrash(visible);return;}const emptyLabel=activeFilter==='todo'&&activeTodoMode==='schedule'?'일정':filterLabels[activeFilter];list.innerHTML=visible.length?visible.map(x=>s.editingAssistantId===x.id?editCard(x):(activeFilter==='memo'?memoBoardCard(x):viewCard(x))).join(''):`<div class="empty">${esc(emptyLabel)} 항목이 없습니다.</div>`;
  }
  function bind(){
    $('analyzeInbox').addEventListener('click',analyzeInbox);$('inboxText').addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){e.preventDefault();analyzeInbox();}});document.querySelector('.assistant-filter-tabs')?.addEventListener('click',e=>{const tab=e.target.closest('[data-assistant-filter]');if(tab)setActiveFilter(tab.dataset.assistantFilter);});$('assistantTodoModeTabs')?.addEventListener('click',e=>{const tab=e.target.closest('[data-assistant-item-mode]');if(tab)setTodoMode(tab.dataset.assistantItemMode);});
    $('assistantList').addEventListener('click',e=>{const b=e.target.closest('button[data-assistant-action]');if(!b)return;const id=b.dataset.id;switch(b.dataset.assistantAction){case'edit':startEdit(id);break;case'toggle':toggle(id);break;case'delete':softDelete(id);break;case'save':saveEdit(id);break;case'cancel':cancelEdit();break;case'restore':restore(id);break;case'permanent-delete':permanentDelete(id);break;case'empty-trash':emptyTrash();break;}});
    projectHub.bind();
  }
  function openFilter(filter){if(filter==='schedule'){activeTodoMode='schedule';setActiveFilter('todo',{preserveTodoMode:true});return;}setActiveFilter(filter);}
  function openProject(key){projectHub.select(key);setActiveFilter('project');}
  function scrollToAssistantItem(id){requestAnimationFrame(()=>{const target=[...document.querySelectorAll('[data-assistant-item-id]')].find(el=>el.dataset.assistantItemId===String(id));target?.scrollIntoView({behavior:'smooth',block:'center'});});}
  function openItem(id){
    const item=s.assistant.find(x=>x.id===id&&!x.deletedAt);if(!item)return false;
    GPA.showView?.('assistant');
    if(item.scheduleOnly){activeTodoMode='schedule';setActiveFilter('todo',{preserveTodoMode:true});}
    else if(item.activityOnly&&item.projectTitle){projectHub.select(item.projectTitle);setActiveFilter('project');}
    else if(item.done)setActiveFilter('done');
    else if(item.type==='project'){projectHub.select(item.title);setActiveFilter('project');}
    else setActiveFilter(item.type==='memo'?'memo':'todo');
    scrollToAssistantItem(id);return true;
  }
  GPA.assistant={render,bind,openFilter,openProject,openItem,getActiveFilter:()=>activeFilter};
})(window);
