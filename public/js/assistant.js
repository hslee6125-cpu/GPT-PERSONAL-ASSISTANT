(function(root){
  const GPA=root.GPA,s=GPA.state,$=GPA.$,esc=GPA.esc;
  const typeLabels={todo:'할 일',memo:'메모',project:'프로젝트'};
  const priorityLabels={high:'높음',medium:'보통',low:'낮음'};
  const filterLabels={todo:'할 일',memo:'메모',project:'장기 프로젝트',done:'완료',trash:'휴지통'};
  let activeFilter='todo';
  let activeProjectKey='';
  let projectEditor={kind:null,id:null};

  function setInboxError(message=''){const el=$('inboxError');if(!el)return;el.textContent=message;el.style.display=message?'block':'none';}
  function setInboxResult(message=''){const el=$('inboxResult');if(!el)return;el.textContent=message;el.classList.toggle('show',Boolean(message));}
  async function analyzeInbox(){
    const input=$('inboxText');const text=input.value.trim();if(!text)return;
    const btn=$('analyzeInbox');btn.disabled=true;const original=btn.textContent;btn.textContent='GPT 정리 중...';setInboxError('');setInboxResult('');const started=performance.now();
    try{
      const r=await fetch('/api/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text,currentDate:GPA.today()})});
      const d=await r.json();if(!r.ok)throw new Error(d.error||'분석 실패');
      const items=(Array.isArray(d.items)?d.items:[]).map(AssistantUtils.normalizeInboxItem).filter(Boolean);
      if(!items.length)throw new Error('저장 가능한 항목을 찾지 못했습니다. 내용을 조금 더 구체적으로 입력해 주세요.');
      const now=new Date().toISOString();const saved=items.map(x=>({id:GPA.uid(),...x,done:false,createdAt:now}));s.assistant.unshift(...saved);
      const firstProject=(saved.find(x=>x.type==='project')?.title)||saved.find(x=>x.projectTitle)?.projectTitle||'';if(firstProject)activeProjectKey=firstProject;
      input.value='';GPA.persist();const result=AssistantUtils.summarizeInboxItems(items);const modelSummary=String(d.summary||'').trim();
      setInboxResult(`✓ ${result.total}개 저장 · ${result.text}${modelSummary?` — ${modelSummary}`:''}`);btn.title=`최근 GPT 분류 ${((performance.now()-started)/1000).toFixed(1)}초`;
    }catch(e){setInboxError(e.message||'분석 중 오류가 발생했습니다.');}finally{btn.disabled=false;btn.textContent=original;}
  }

  function toggle(id){const x=s.assistant.find(x=>x.id===id&&!x.deletedAt);if(x){x.done=!x.done;GPA.persist();}}
  function softDelete(id){
    const item=s.assistant.find(x=>x.id===id&&!x.deletedAt);if(!item)return;
    const message=item.type==='project'?'프로젝트를 휴지통으로 이동할까요? 연결된 할 일·메모·일정은 그대로 유지됩니다.':'이 항목을 휴지통으로 이동할까요?';
    if(!confirm(message))return;
    s.assistant=AssistantUtils.softDeleteAssistantItem(s.assistant,id,new Date().toISOString());
    if(s.editingAssistantId===id)s.editingAssistantId=null;if(projectEditor.id===id)projectEditor={kind:null,id:null};GPA.persist();
  }
  function restore(id){s.assistant=AssistantUtils.restoreAssistantItem(s.assistant,id);GPA.persist();}
  function permanentDelete(id){if(!confirm('이 항목을 영구 삭제할까요? 이 작업은 되돌릴 수 없습니다.'))return;s.assistant=AssistantUtils.permanentlyDeleteAssistantItem(s.assistant,id);GPA.persist();}
  function emptyTrash(){if(!AssistantUtils.filterAssistantItems(s.assistant,'trash').length)return;if(!confirm('휴지통을 비울까요? 모든 항목이 영구 삭제됩니다.'))return;s.assistant=AssistantUtils.emptyAssistantTrash(s.assistant);GPA.persist();}

  function startEdit(id){s.editingAssistantId=id;render();requestAnimationFrame(()=>$(`edit-title-${id}`)?.focus());}
  function cancelEdit(){s.editingAssistantId=null;render();}
  function saveEdit(id){
    try{
      const before=s.assistant.find(item=>item.id===id);s.assistant=AssistantUtils.updateAssistantItem(s.assistant,id,{title:$(`edit-title-${id}`)?.value,details:$(`edit-details-${id}`)?.value,type:$(`edit-type-${id}`)?.value,priority:$(`edit-priority-${id}`)?.value,dueDate:$(`edit-due-${id}`)?.value,projectTitle:$(`edit-project-${id}`)?.value});
      const after=s.assistant.find(item=>item.id===id);activeProjectKey=after?.type==='project'?after.title:(after?.projectTitle||before?.projectTitle||activeProjectKey);s.editingAssistantId=null;GPA.persist();
    }catch(e){alert(e.message);}
  }
  function editCard(x){
    return `<div class="item assistant-edit-card" style="${x.done?'opacity:.68':''}"><div class="edit-grid"><div class="edit-span"><label>내용 / 제목</label><input id="edit-title-${x.id}" value="${esc(x.title||'')}" maxlength="200"></div><div class="edit-span"><label>상세 내용</label><textarea id="edit-details-${x.id}" class="edit-details">${esc(x.details||'')}</textarea></div><div><label>분류</label><select id="edit-type-${x.id}">${Object.entries(typeLabels).map(([v,l])=>`<option value="${v}" ${x.type===v?'selected':''}>${l}</option>`).join('')}</select></div><div><label>중요도</label><select id="edit-priority-${x.id}">${Object.entries(priorityLabels).map(([v,l])=>`<option value="${v}" ${(x.priority||'medium')===v?'selected':''}>${l}</option>`).join('')}</select></div><div><label>날짜</label><input id="edit-due-${x.id}" type="date" value="${esc(x.dueDate||'')}"></div><div><label>연결 프로젝트</label><input id="edit-project-${x.id}" value="${esc(x.projectTitle||'')}" placeholder="선택 사항"></div></div><div class="actions edit-actions"><button class="small ghost" data-assistant-action="cancel">취소</button><button class="small primary" data-assistant-action="save" data-id="${x.id}">저장</button></div></div>`;
  }
  function viewCard(x){
    const tags=(Array.isArray(x.tags)?x.tags:[]).map(tag=>`<span class="chip tag-chip">#${esc(tag)}</span>`).join('');
    return `<div class="item" style="${x.done?'opacity:.55':''}"><div class="itemrow"><div class="assistant-content"><div class="title">${esc(x.title)}</div><div class="details">${esc(x.details||'')}</div><div class="meta"><span class="chip">${esc(typeLabels[x.type]||x.type)}</span><span class="chip ${esc(x.priority||'medium')}">${esc(priorityLabels[x.priority||'medium']||x.priority)}</span>${x.dueDate?`<span class="chip">${esc(x.dueDate)}</span>`:''}${x.projectTitle?`<span class="chip">↳ ${esc(x.projectTitle)}</span>`:''}${tags}</div></div><div class="actions"><button class="small ghost" data-assistant-action="edit" data-id="${x.id}">수정</button><button class="small ghost" data-assistant-action="toggle" data-id="${x.id}">${x.done?'되돌리기':'완료'}</button><button class="small ghost danger" data-assistant-action="delete" data-id="${x.id}">삭제</button></div></div></div>`;
  }
  function memoBoardCard(x){
    const tags=(Array.isArray(x.tags)?x.tags:[]).map(tag=>`<span class="chip">#${esc(tag)}</span>`).join('');
    const body=String(x.details||'').trim();
    return `<article class="memo-board-card" style="${x.done?'opacity:.55':''}"><div class="memo-board-main"><div class="memo-board-title">${esc(x.title)}</div><div class="memo-board-body ${body?'':'empty-body'}">${esc(body||'내용 없음')}</div></div><div class="memo-board-footer"><div class="memo-board-meta">${x.dueDate?`<span class="chip">${esc(x.dueDate)}</span>`:''}${x.projectTitle?`<span class="chip">↳ ${esc(x.projectTitle)}</span>`:''}${tags}</div><div class="actions memo-board-actions"><button class="small ghost" data-assistant-action="edit" data-id="${x.id}">수정</button><button class="small ghost" data-assistant-action="toggle" data-id="${x.id}">${x.done?'되돌리기':'완료'}</button><button class="small ghost danger" data-assistant-action="delete" data-id="${x.id}">삭제</button></div></div></article>`;
  }
  function trashTypeLabel(x){if(x.activityOnly)return '활동';if(x.scheduleOnly)return '일정';return typeLabels[x.type]||'항목';}
  function trashCard(x){return `<div class="item trash-item"><div class="itemrow"><div class="assistant-content"><div class="title">${esc(x.title)}</div><div class="meta"><span class="chip">${esc(trashTypeLabel(x))}</span>${x.projectTitle?`<span class="chip">↳ ${esc(x.projectTitle)}</span>`:''}${x.deletedAt?`<span class="chip">삭제 ${esc(String(x.deletedAt).slice(0,16).replace('T',' '))}</span>`:''}</div></div><div class="actions"><button class="small ghost" data-assistant-action="restore" data-id="${x.id}">복구</button><button class="small ghost danger" data-assistant-action="permanent-delete" data-id="${x.id}">영구 삭제</button></div></div></div>`;}

  function setActiveFilter(filter){if(!['todo','memo','project','done','trash'].includes(filter))return;activeFilter=filter;s.editingAssistantId=null;projectEditor={kind:null,id:null};render();}
  function projectProgressTone(progress){if(progress>=70)return'good';if(progress>=35)return'mid';return'light';}
  function getProjects(){return AssistantUtils.collectAssistantProjects(s.assistant).filter(project=>!project.done);}
  function ensureActiveProject(projects){if(!projects.length){activeProjectKey='';return null;}const found=projects.find(project=>project.key===activeProjectKey||project.title===activeProjectKey);if(found){activeProjectKey=found.key;return found;}activeProjectKey=projects[0].key;return projects[0];}
  function createProject(){const title=prompt('새 장기 프로젝트 이름을 입력해 주세요.');if(!title||!title.trim())return;const name=title.trim();const desc=(prompt('프로젝트 설명이나 메모를 입력할까요? (선택 사항)')||'').trim();s.assistant.unshift({id:GPA.uid(),type:'project',title:name,details:desc,priority:'medium',dueDate:null,projectTitle:null,tags:[],done:false,createdAt:new Date().toISOString()});activeProjectKey=name;GPA.persist();}
  function materializeProject(key){const project=getProjects().find(x=>x.key===key||x.title===key);if(!project||project.projectItem)return;s.assistant.unshift({id:GPA.uid(),type:'project',title:project.title,details:'',priority:'medium',dueDate:null,projectTitle:null,tags:[],done:false,createdAt:new Date().toISOString()});activeProjectKey=project.title;GPA.persist();}
  function maybeOpenFilteredItems(filter){setActiveFilter(filter);document.querySelector('.assistant-overview-card')?.scrollIntoView({behavior:'smooth',block:'start'});}
  function editProjectQuick(id){
    const item=s.assistant.find(x=>x.id===id&&x.type==='project'&&!x.deletedAt);if(!item)return;const oldTitle=item.title;const title=prompt('프로젝트 이름',item.title||'');if(title===null||!title.trim())return;const details=prompt('프로젝트 설명',item.details||'');if(details===null)return;const dueDate=prompt('마감일 (YYYY-MM-DD, 없으면 비워두기)',item.dueDate||'');if(dueDate===null)return;
    try{const nextTitle=title.trim();s.assistant=AssistantUtils.updateAssistantItem(s.assistant,id,{title:nextTitle,details:details.trim(),dueDate:dueDate.trim()||null});if(nextTitle!==oldTitle)s.assistant=s.assistant.map(entry=>entry.projectTitle===oldTitle?{...entry,projectTitle:nextTitle}:entry);activeProjectKey=nextTitle;GPA.persist();}catch(e){alert(e.message);}
  }

  function projectKindForItem(item){if(item?.activityOnly)return'activity';if(item?.scheduleOnly)return'schedule';if(item?.type==='memo')return'memo';return'todo';}
  function openProjectEditor(kind,id=null){projectEditor={kind,id};render();requestAnimationFrame(()=>$('projectEditorTitle')?.focus());}
  function cancelProjectEditor(){projectEditor={kind:null,id:null};render();}
  function projectEditorValues(kind){
    const values={title:$('projectEditorTitle')?.value||'',details:$('projectEditorDetails')?.value||''};
    if(kind==='todo'||kind==='schedule'){values.dueDate=$('projectEditorDue')?.value||'';values.priority=$('projectEditorPriority')?.value||'medium';}
    return values;
  }
  function saveProjectEditor(project){
    if(!project||!projectEditor.kind)return;try{
      const values=projectEditorValues(projectEditor.kind);
      if(projectEditor.id){s.assistant=AssistantUtils.updateProjectRecord(s.assistant,projectEditor.id,values);}else{s.assistant.unshift(AssistantUtils.createProjectRecord(projectEditor.kind,project.title,values,{id:GPA.uid(),createdAt:new Date().toISOString()}));}
      projectEditor={kind:null,id:null};GPA.persist();
    }catch(e){alert(e.message);}
  }
  function renderInlineEditor(kind,item=null){
    if(projectEditor.kind!==kind)return'';const editing=Boolean(item);const title=item?.title||'';const details=item?.details||'';const due=item?.dueDate||'';const priority=item?.priority||'medium';
    return `<div class="project-inline-editor" data-project-editor="${kind}"><div class="project-inline-grid"><div class="edit-span"><label>제목</label><input id="projectEditorTitle" value="${esc(title)}" placeholder="${kind==='activity'?'예) 보험사 담당자와 통화':'제목 입력'}"></div><div class="edit-span"><label>상세 내용</label><textarea id="projectEditorDetails">${esc(details)}</textarea></div>${kind==='todo'||kind==='schedule'?`<div><label>${kind==='schedule'?'날짜':'마감일'}</label><input id="projectEditorDue" type="date" value="${esc(due)}"></div><div><label>중요도</label><select id="projectEditorPriority">${Object.entries(priorityLabels).map(([v,l])=>`<option value="${v}" ${priority===v?'selected':''}>${l}</option>`).join('')}</select></div>`:''}</div><div class="actions project-inline-actions"><button type="button" class="small ghost" data-project-editor-cancel>취소</button><button type="button" class="small primary" data-project-editor-save>${editing?'수정 저장':'추가'}</button></div></div>`;
  }
  function rowActions(item){return `<div class="project-row-actions"><button type="button" class="text-button" data-project-row-edit="${item.id}">수정</button><button type="button" class="text-button danger" data-project-row-delete="${item.id}">삭제</button></div>`;}

  function renderProjectCard(project,selected){return `<button type="button" class="project-hub-card ${selected?'active':''}" data-project-key="${esc(project.key)}"><div class="project-hub-card-top"><div><div class="title">${esc(project.title)}</div><div class="project-card-sub">${project.isVirtual?'연결 항목으로 생성된 프로젝트':'진행 중 프로젝트'}</div></div><span class="project-progress-label">${project.progress}%</span></div><div class="project-progress"><span class="${projectProgressTone(project.progress)}" style="width:${project.progress}%"></span></div><div class="project-card-metrics"><span>할 일 ${project.stats.todos}</span><span>메모 ${project.stats.memos}</span><span>일정 ${project.stats.schedules}</span></div></button>`;}
  function renderProjectList(projects,active){const unlinked=s.assistant.filter(item=>item&&!item.deletedAt&&!item.done&&!item.activityOnly&&!item.scheduleOnly&&item.type!=='project'&&!String(item.projectTitle||'').trim()).length;return `<div class="assistant-project-list-wrap"><div class="assistant-section-head"><div><h2>프로젝트 허브</h2><div class="notice" style="margin:2px 0 0">프로젝트 안에서 할 일, 메모, 일정과 활동을 바로 관리합니다.</div></div><button type="button" id="createAssistantProject" class="ghost small">+ 새 프로젝트</button></div>${unlinked?`<div class="assistant-unlinked-note">연결되지 않은 항목 ${unlinked}개가 있습니다. 할 일 또는 메모 탭에서 프로젝트를 연결할 수 있습니다.</div>`:''}<div class="project-hub-list">${projects.map(project=>renderProjectCard(project,active&&project.key===active.key)).join('')}</div></div>`;}

  function renderTodoRows(project){const todos=project.todos.slice(0,8);const rows=todos.length?`<div class="project-mini-list">${todos.map(item=>`<div class="project-mini-row ${item.done?'done':''}"><button type="button" class="mini-check ${item.done?'checked':''}" data-project-todo-toggle="${item.id}" aria-label="${item.done?'할 일 되돌리기':'할 일 완료'}">${item.done?'✓':''}</button><div class="project-mini-main"><div class="project-mini-title">${esc(item.title)}</div>${item.details?`<div class="project-mini-sub">${esc(item.details)}</div>`:''}</div>${item.dueDate?`<span class="chip">${esc(item.dueDate)}</span>`:''}${rowActions(item)}</div>`).join('')}</div>`:'<div class="empty compact">연결된 할 일이 없습니다.</div>';const editItem=projectEditor.kind==='todo'&&projectEditor.id?s.assistant.find(x=>x.id===projectEditor.id):null;return renderInlineEditor('todo',editItem)+rows;}
  function renderMemoRows(project){const memos=project.memos.slice(0,8);const rows=memos.length?`<div class="project-mini-list">${memos.map(item=>`<div class="project-mini-row"><div class="project-mini-main"><div class="project-mini-title">${esc(item.title)}</div>${item.details?`<div class="project-mini-sub">${esc(item.details)}</div>`:''}</div>${rowActions(item)}</div>`).join('')}</div>`:'<div class="empty compact">연결된 메모가 없습니다.</div>';const editItem=projectEditor.kind==='memo'&&projectEditor.id?s.assistant.find(x=>x.id===projectEditor.id):null;return renderInlineEditor('memo',editItem)+rows;}
  function renderScheduleRows(project){const items=project.schedules.filter(item=>item.type!=='project').slice(0,8);const rows=items.length?`<div class="project-mini-list">${items.map(item=>`<div class="project-mini-row"><div class="project-date-pill">${esc(item.dueDate)}</div><div class="project-mini-main"><div class="project-mini-title">${esc(item.title)}</div><div class="project-mini-sub">${esc(item.details||typeLabels[item.type]||'일정')}</div></div>${rowActions(item)}</div>`).join('')}</div>`:'<div class="empty compact">등록된 일정이 없습니다.</div>';const editItem=projectEditor.kind==='schedule'&&projectEditor.id?s.assistant.find(x=>x.id===projectEditor.id):null;return renderInlineEditor('schedule',editItem)+rows;}
  function renderRecentRows(project){const items=project.recent.slice(0,8);const rows=items.length?`<div class="project-recent-list">${items.map(item=>`<div class="project-recent-row"><span class="project-recent-dot"></span><div class="project-mini-main"><div class="project-mini-title">${esc(AssistantUtils.formatActivityLabel(item))}</div><div class="project-mini-sub">${esc(item.title)}${item.createdAt?` · ${esc(String(item.createdAt).slice(0,16).replace('T',' '))}`:''}</div></div>${item.activityOnly?rowActions(item):'<span class="project-auto-label">자동</span>'}</div>`).join('')}</div>`:'<div class="empty compact">최근 활동이 없습니다.</div>';const editItem=projectEditor.kind==='activity'&&projectEditor.id?s.assistant.find(x=>x.id===projectEditor.id):null;return renderInlineEditor('activity',editItem)+rows;}
  function renderSuggestions(project){const suggestions=AssistantUtils.buildProjectSuggestions(project);return suggestions.length?`<div class="project-suggestion-list">${suggestions.map(text=>`<div class="project-suggestion-item">${esc(text)}</div>`).join('')}</div>`:'<div class="empty compact">지금 제안할 내용이 없습니다.</div>';}


  function renderProjectDetail(project){
    if(!project)return `<div class="assistant-project-detail empty-project-detail"><div class="empty">장기 프로젝트를 하나 만들면 이곳에 프로젝트 중심 화면이 나타납니다.</div></div>`;
    return `<div class="assistant-project-detail"><div class="assistant-project-hero"><div class="assistant-project-hero-main"><div class="assistant-project-eyebrow">프로젝트 상세</div><div class="assistant-project-title-row"><h2>${esc(project.title)}</h2><span class="badge ok">진행 중</span></div><div class="assistant-project-progress-row"><div class="project-progress large"><span class="${projectProgressTone(project.progress)}" style="width:${project.progress}%"></span></div><b>${project.progress}%</b></div><div class="project-summary-chips">${project.nextDue?`<span class="chip">다음 마감 ${esc(project.nextDue)}</span>`:''}<span class="chip">미완료 할 일 ${project.stats.todos}</span><span class="chip">메모 ${project.stats.memos}</span><span class="chip">일정 ${project.stats.schedules}</span></div><div class="details assistant-project-desc">${esc(project.description||(project.isVirtual?'아직 프로젝트 설명이 없습니다.':'프로젝트 설명이 아직 없습니다.'))}</div></div><div class="assistant-project-hero-actions">${project.isVirtual?`<button type="button" class="ghost small" data-materialize-project="${esc(project.key)}">장기 프로젝트 항목 만들기</button>`:`<button type="button" class="ghost small" data-edit-project="${project.projectItem.id}">프로젝트 수정</button><button type="button" class="ghost small" data-toggle-project="${project.projectItem.id}">프로젝트 완료</button><button type="button" class="ghost small danger" data-project-row-delete="${project.projectItem.id}">프로젝트 삭제</button>`}</div></div><div class="assistant-project-grid">
      <div class="card pad project-info-card"><div class="assistant-section-head compact"><h3>관련 할 일</h3><button type="button" class="text-button" data-project-add="todo">+ 추가</button></div>${renderTodoRows(project)}</div>
      <div class="card pad project-info-card"><div class="assistant-section-head compact"><h3>메모</h3><button type="button" class="text-button" data-project-add="memo">+ 추가</button></div>${renderMemoRows(project)}</div>
      <div class="card pad project-info-card"><div class="assistant-section-head compact"><h3>일정</h3><button type="button" class="text-button" data-project-add="schedule">+ 추가</button></div>${renderScheduleRows(project)}</div>
      <div class="card pad project-info-card"><div class="assistant-section-head compact"><h3>최근 활동</h3><button type="button" class="text-button" data-project-add="activity">+ 기록</button></div>${renderRecentRows(project)}</div>
      <div class="card pad project-info-card"><div class="assistant-section-head compact"><h3>AI 제안</h3><span class="badge">자동 제안</span></div>${renderSuggestions(project)}</div>
      </div></div>`;
  }
  function renderProjectHub(projects=getProjects()){const active=ensureActiveProject(projects);if(!projects.length){$('assistantProjectHub').innerHTML=`<div class="project-hub-empty"><div><b>아직 장기 프로젝트가 없습니다.</b><span>새 프로젝트를 만들거나 통합 Inbox에서 장기 프로젝트를 추가해 보세요.</span></div><button type="button" id="createAssistantProject" class="primary small">+ 새 프로젝트</button></div>`;return;}$('assistantProjectHub').innerHTML=`<div class="assistant-project-hub-layout"><aside class="assistant-project-list">${renderProjectList(projects,active)}</aside><main class="assistant-project-main">${renderProjectDetail(active)}</main></div>`;}
  function renderTrash(items){const controls=items.length?`<div class="trash-toolbar"><div><b>휴지통</b><span>${items.length}개 항목</span></div><button type="button" class="small ghost danger" data-assistant-action="empty-trash">휴지통 비우기</button></div>`:'';$('assistantList').innerHTML=controls+(items.length?items.map(trashCard).join(''):'<div class="empty">휴지통이 비어 있습니다.</div>');}
  function render(){
    const projects=getProjects();$('todoKpi').textContent=AssistantUtils.filterAssistantItems(s.assistant,'todo').length;$('memoKpi').textContent=AssistantUtils.filterAssistantItems(s.assistant,'memo').length;$('projKpi').textContent=projects.length;$('doneKpi').textContent=AssistantUtils.filterAssistantItems(s.assistant,'done').length;$('trashKpi').textContent=AssistantUtils.filterAssistantItems(s.assistant,'trash').length;
    document.querySelectorAll('[data-assistant-filter]').forEach(tab=>{const selected=tab.dataset.assistantFilter===activeFilter;tab.classList.toggle('active',selected);tab.setAttribute('aria-selected',selected?'true':'false');});const projectMode=activeFilter === 'project';$('assistantListPanel')?.classList.toggle('active',!projectMode);$('assistantProjectHub')?.classList.toggle('active',projectMode);if(projectMode){renderProjectHub(projects);return;}const visible=AssistantUtils.filterAssistantItems(s.assistant,activeFilter);const list=$('assistantList');list.classList.toggle('memo-board',activeFilter==='memo');if(activeFilter==='trash'){renderTrash(visible);return;}list.innerHTML=visible.length?visible.map(x=>s.editingAssistantId===x.id?editCard(x):(activeFilter==='memo'?memoBoardCard(x):viewCard(x))).join(''):`<div class="empty">${esc(filterLabels[activeFilter])} 항목이 없습니다.</div>`;
  }
  function bind(){
    $('analyzeInbox').addEventListener('click',analyzeInbox);$('inboxText').addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){e.preventDefault();analyzeInbox();}});document.querySelector('.assistant-filter-tabs')?.addEventListener('click',e=>{const tab=e.target.closest('[data-assistant-filter]');if(tab)setActiveFilter(tab.dataset.assistantFilter);});
    $('assistantList').addEventListener('click',e=>{const b=e.target.closest('button[data-assistant-action]');if(!b)return;const id=b.dataset.id;switch(b.dataset.assistantAction){case'edit':startEdit(id);break;case'toggle':toggle(id);break;case'delete':softDelete(id);break;case'save':saveEdit(id);break;case'cancel':cancelEdit();break;case'restore':restore(id);break;case'permanent-delete':permanentDelete(id);break;case'empty-trash':emptyTrash();break;}});
    $('assistantProjectHub').addEventListener('click',e=>{
      const projectButton=e.target.closest('[data-project-key]');if(projectButton){activeProjectKey=projectButton.dataset.projectKey;projectEditor={kind:null,id:null};render();return;}
      const toggleButton=e.target.closest('[data-project-todo-toggle]');if(toggleButton){toggle(toggleButton.dataset.projectTodoToggle);return;}
      const materialize=e.target.closest('[data-materialize-project]');if(materialize){materializeProject(materialize.dataset.materializeProject);return;}
      const editProject=e.target.closest('[data-edit-project]');if(editProject){editProjectQuick(editProject.dataset.editProject);return;}
      const toggleProject=e.target.closest('[data-toggle-project]');if(toggleProject){toggle(toggleProject.dataset.toggleProject);return;}
      const add=e.target.closest('[data-project-add]');if(add){openProjectEditor(add.dataset.projectAdd);return;}
      const rowEdit=e.target.closest('[data-project-row-edit]');if(rowEdit){const item=s.assistant.find(x=>x.id===rowEdit.dataset.projectRowEdit);if(item)openProjectEditor(projectKindForItem(item),item.id);return;}
      const rowDelete=e.target.closest('[data-project-row-delete]');if(rowDelete){softDelete(rowDelete.dataset.projectRowDelete);return;}
      if(e.target.closest('[data-project-editor-cancel]')){cancelProjectEditor();return;}
      if(e.target.closest('[data-project-editor-save]')){saveProjectEditor(ensureActiveProject(getProjects()));return;}
      const openFilter=e.target.closest('[data-open-filter]');if(openFilter){maybeOpenFilteredItems(openFilter.dataset.openFilter);return;}
      if(e.target.id==='createAssistantProject'){createProject();}
    });
  }
  function openFilter(filter){setActiveFilter(filter);}
  function openProject(key){activeProjectKey=String(key||'');setActiveFilter('project');}
  GPA.assistant={render,bind,openFilter,openProject};
})(window);
