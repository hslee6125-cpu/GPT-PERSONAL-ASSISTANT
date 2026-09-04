(function(root){
  const GPA=root.GPA,s=GPA.state,$=GPA.$,esc=GPA.esc;
  const typeLabels={todo:'할 일',memo:'메모',project:'프로젝트'};
  const priorityLabels={high:'높음',medium:'보통',low:'낮음'};
  const filterLabels={todo:'할 일',memo:'메모',project:'장기 프로젝트',done:'완료'};
  let activeFilter='todo';
  let activeProjectKey='';

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
      const firstProject=(saved.find(x=>x.type==='project')?.title)||saved.find(x=>x.projectTitle)?.projectTitle||'';
      if(firstProject) activeProjectKey=firstProject;
      input.value='';GPA.persist();
      const result=AssistantUtils.summarizeInboxItems(items);
      const modelSummary=String(d.summary||'').trim();
      setInboxResult(`✓ ${result.total}개 저장 · ${result.text}${modelSummary?` — ${modelSummary}`:''}`);
      const elapsed=((performance.now()-started)/1000).toFixed(1);btn.title=`최근 GPT 분류 ${elapsed}초`;
    }catch(e){setInboxError(e.message||'분석 중 오류가 발생했습니다.');}finally{btn.disabled=false;btn.textContent=original;}
  }
  function toggle(id){const x=s.assistant.find(x=>x.id===id);if(x){x.done=!x.done;GPA.persist();}}
  function remove(id){if(!confirm('이 항목을 삭제할까요?'))return;s.assistant=s.assistant.filter(x=>x.id!==id);if(s.editingAssistantId===id)s.editingAssistantId=null;GPA.persist();}
  function startEdit(id){
    s.editingAssistantId=id;
    $('assistantItemsPanel')?.setAttribute('open','open');
    render();
    requestAnimationFrame(()=>$(`edit-title-${id}`)?.focus());
  }
  function cancelEdit(){s.editingAssistantId=null;render();}
  function saveEdit(id){
    try{
      const before=s.assistant.find(item=>item.id===id);
      s.assistant=AssistantUtils.updateAssistantItem(s.assistant,id,{
        title:$(`edit-title-${id}`)?.value,details:$(`edit-details-${id}`)?.value,
        type:$(`edit-type-${id}`)?.value,priority:$(`edit-priority-${id}`)?.value,
        dueDate:$(`edit-due-${id}`)?.value,projectTitle:$(`edit-project-${id}`)?.value
      });
      const after=s.assistant.find(item=>item.id===id);
      activeProjectKey=after?.type==='project'?after.title:(after?.projectTitle||before?.projectTitle||activeProjectKey);
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
  function setActiveFilter(filter, {openPanel=true}={}){
    if(!['todo','memo','project','done'].includes(filter))return;
    activeFilter=filter;s.editingAssistantId=null;
    if(openPanel) $('assistantItemsPanel')?.setAttribute('open','open');
    render();
  }
  function projectProgressTone(progress){
    if(progress>=70)return 'good';
    if(progress>=35)return 'mid';
    return 'light';
  }
  function getProjects(){
    return AssistantUtils.collectAssistantProjects(s.assistant);
  }
  function ensureActiveProject(projects){
    if(!projects.length){activeProjectKey='';return null;}
    const found=projects.find(project=>project.key===activeProjectKey||project.title===activeProjectKey);
    if(found){activeProjectKey=found.key;return found;}
    activeProjectKey=projects[0].key;
    return projects[0];
  }
  function createProject(){
    const title=prompt('새 장기 프로젝트 이름을 입력해 주세요.');
    if(!title||!title.trim())return;
    const name=title.trim();
    const desc=(prompt('프로젝트 설명이나 메모를 입력할까요? (선택 사항)')||'').trim();
    s.assistant.unshift({id:GPA.uid(),type:'project',title:name,details:desc,priority:'medium',dueDate:null,projectTitle:null,tags:[],done:false,createdAt:new Date().toISOString()});
    activeProjectKey=name;
    GPA.persist();
  }
  function materializeProject(key){
    const project=getProjects().find(x=>x.key===key||x.title===key);
    if(!project||project.projectItem)return;
    s.assistant.unshift({id:GPA.uid(),type:'project',title:project.title,details:'',priority:'medium',dueDate:null,projectTitle:null,tags:[],done:false,createdAt:new Date().toISOString()});
    activeProjectKey=project.title;
    GPA.persist();
  }
  function maybeOpenFilteredItems(filter){
    setActiveFilter(filter,{openPanel:true});
    const panel=$('assistantItemsPanel');
    panel?.scrollIntoView({behavior:'smooth',block:'start'});
  }
  function renderProjectCard(project,selected){
    return `<button type="button" class="project-hub-card ${selected?'active':''}" data-project-key="${esc(project.key)}">
      <div class="project-hub-card-top"><div><div class="title">${esc(project.title)}</div><div class="project-card-sub">${project.done?'완료된 프로젝트':project.isVirtual?'연결 항목으로 생성된 프로젝트':'진행 중 프로젝트'}</div></div><span class="project-progress-label">${project.progress}%</span></div>
      <div class="project-progress"><span class="${projectProgressTone(project.progress)}" style="width:${project.progress}%"></span></div>
      <div class="project-card-metrics"><span>할 일 ${project.stats.todos}</span><span>메모 ${project.stats.memos}</span><span>일정 ${project.stats.schedules}</span></div>
    </button>`;
  }
  function renderProjectList(projects,active){
    const unlinked=s.assistant.filter(item=>item&&!item.done&&item.type!=='project'&&!String(item.projectTitle||'').trim()).length;
    return `<div class="assistant-project-list-wrap">
      <div class="assistant-section-head"><div><h2>프로젝트 허브</h2><div class="notice" style="margin:2px 0 0">장기 프로젝트를 중심으로 관련 할 일과 메모를 한눈에 봅니다.</div></div><button type="button" id="createAssistantProject" class="ghost small">+ 새 프로젝트</button></div>
      ${unlinked?`<div class="assistant-unlinked-note">연결되지 않은 항목 ${unlinked}개가 있습니다. 필요하면 전체 항목 보기에서 프로젝트를 연결해 주세요.</div>`:''}
      <div class="project-hub-list">${projects.map(project=>renderProjectCard(project,active&&project.key===active.key)).join('')}</div>
    </div>`;
  }
  function renderTodoRows(project){
    const todos=project.todos.slice(0,6);
    if(!todos.length)return '<div class="empty compact">연결된 할 일이 없습니다.</div>';
    return `<div class="project-mini-list">${todos.map(item=>`<div class="project-mini-row ${item.done?'done':''}"><button type="button" class="mini-check ${item.done?'checked':''}" data-project-todo-toggle="${item.id}" aria-label="${item.done?'할 일 되돌리기':'할 일 완료'}">${item.done?'✓':''}</button><div class="project-mini-main"><div class="project-mini-title">${esc(item.title)}</div>${item.details?`<div class="project-mini-sub">${esc(item.details)}</div>`:''}</div>${item.dueDate?`<span class="chip">${esc(item.dueDate)}</span>`:''}</div>`).join('')}</div>`;
  }
  function renderMemoRows(project){
    const memos=project.memos.slice(0,5);
    if(!memos.length)return '<div class="empty compact">연결된 메모가 없습니다.</div>';
    return `<div class="project-mini-list">${memos.map(item=>`<div class="project-mini-row"><div class="project-mini-main"><div class="project-mini-title">${esc(item.title)}</div>${item.details?`<div class="project-mini-sub">${esc(item.details)}</div>`:''}</div>${item.dueDate?`<span class="chip">${esc(item.dueDate)}</span>`:''}</div>`).join('')}</div>`;
  }
  function renderScheduleRows(project){
    const items=project.schedules.slice(0,5);
    if(!items.length)return '<div class="empty compact">다가오는 일정이 없습니다.</div>';
    return `<div class="project-mini-list">${items.map(item=>`<div class="project-mini-row"><div class="project-date-pill">${esc(item.dueDate)}</div><div class="project-mini-main"><div class="project-mini-title">${esc(item.title)}</div><div class="project-mini-sub">${esc(typeLabels[item.type]||'항목')}</div></div></div>`).join('')}</div>`;
  }
  function renderRecentRows(project){
    const items=project.recent.slice(0,5);
    if(!items.length)return '<div class="empty compact">최근 활동이 없습니다.</div>';
    return `<div class="project-recent-list">${items.map(item=>`<div class="project-recent-row"><span class="project-recent-dot"></span><div class="project-mini-main"><div class="project-mini-title">${esc(AssistantUtils.formatActivityLabel(item))}</div><div class="project-mini-sub">${esc(item.title)}${item.createdAt?` · ${esc(String(item.createdAt).slice(0,16).replace('T',' '))}`:''}</div></div></div>`).join('')}</div>`;
  }
  function renderSuggestions(project){
    const suggestions=AssistantUtils.buildProjectSuggestions(project);
    if(!suggestions.length)return '<div class="empty compact">지금 제안할 내용이 없습니다.</div>';
    return `<div class="project-suggestion-list">${suggestions.map(text=>`<div class="project-suggestion-item">${esc(text)}</div>`).join('')}</div>`;
  }
  function renderProjectDetail(project){
    if(!project){
      return `<div class="assistant-project-detail empty-project-detail"><div class="empty">장기 프로젝트를 하나 만들거나 Inbox에서 프로젝트를 추가하면 이곳에 프로젝트 중심 화면이 나타납니다.</div></div>`;
    }
    return `<div class="assistant-project-detail">
      <div class="assistant-project-hero ${project.done?'done':''}">
        <div class="assistant-project-hero-main">
          <div class="assistant-project-eyebrow">프로젝트 상세</div>
          <div class="assistant-project-title-row"><h2>${esc(project.title)}</h2><span class="badge ${project.done?'':'ok'}">${project.done?'완료':'진행 중'}</span></div>
          <div class="assistant-project-progress-row"><div class="project-progress large"><span class="${projectProgressTone(project.progress)}" style="width:${project.progress}%"></span></div><b>${project.progress}%</b></div>
          <div class="project-summary-chips">${project.nextDue?`<span class="chip">다음 마감 ${esc(project.nextDue)}</span>`:''}<span class="chip">미완료 할 일 ${project.stats.todos}</span><span class="chip">메모 ${project.stats.memos}</span><span class="chip">일정 ${project.stats.schedules}</span></div>
          <div class="details assistant-project-desc">${esc(project.description|| (project.isVirtual?'아직 프로젝트 설명이 없습니다. 전체 항목 보기에서 연결된 항목들을 수정하거나, 장기 프로젝트 설명 항목을 만들 수 있습니다.':'프로젝트 설명이 아직 없습니다.'))}</div>
        </div>
        <div class="assistant-project-hero-actions">${project.isVirtual?`<button type="button" class="ghost small" data-materialize-project="${esc(project.key)}">장기 프로젝트 항목 만들기</button>`:`<button type="button" class="ghost small" data-open-filter="project">프로젝트 전체 보기</button>`}<button type="button" class="ghost small" data-open-filter="todo">할 일 보기</button><button type="button" class="ghost small" data-open-filter="memo">메모 보기</button></div>
      </div>
      <div class="assistant-project-grid">
        <div class="card pad project-info-card"><div class="assistant-section-head compact"><h3>관련 할 일</h3><button type="button" class="text-button" data-open-filter="todo">전체 보기</button></div>${renderTodoRows(project)}</div>
        <div class="card pad project-info-card"><div class="assistant-section-head compact"><h3>메모</h3><button type="button" class="text-button" data-open-filter="memo">전체 보기</button></div>${renderMemoRows(project)}</div>
        <div class="card pad project-info-card"><div class="assistant-section-head compact"><h3>일정</h3><button type="button" class="text-button" data-open-filter="todo">관련 할 일 보기</button></div>${renderScheduleRows(project)}</div>
        <div class="card pad project-info-card"><div class="assistant-section-head compact"><h3>최근 활동</h3><span class="badge">최근 5개</span></div>${renderRecentRows(project)}</div>
        <div class="card pad project-info-card"><div class="assistant-section-head compact"><h3>AI 제안</h3><span class="badge">자동 제안</span></div>${renderSuggestions(project)}</div>
      </div>
    </div>`;
  }
  function renderProjectHub(){
    const projects=getProjects();
    const active=ensureActiveProject(projects);
    $('assistantProjectHub').innerHTML=`<div class="assistant-project-hub-layout"><aside class="assistant-project-list">${renderProjectList(projects,active)}</aside><main class="assistant-project-main">${renderProjectDetail(active)}</main></div>`;
  }
  function render(){
    $('todoKpi').textContent=s.assistant.filter(x=>x.type==='todo'&&!x.done).length;
    $('memoKpi').textContent=s.assistant.filter(x=>x.type==='memo'&&!x.done).length;
    $('projKpi').textContent=s.assistant.filter(x=>x.type==='project'&&!x.done).length;
    $('doneKpi').textContent=s.assistant.filter(x=>x.done).length;
    document.querySelectorAll('[data-assistant-filter]').forEach(tab=>{const selected=tab.dataset.assistantFilter===activeFilter;tab.classList.toggle('active',selected);tab.setAttribute('aria-selected',selected?'true':'false');});
    const visible=AssistantUtils.filterAssistantItems(s.assistant,activeFilter);
    $('assistantList').innerHTML=visible.length?visible.map(x=>s.editingAssistantId===x.id?editCard(x):viewCard(x)).join(''):`<div class="empty">${esc(filterLabels[activeFilter])} 항목이 없습니다.</div>`;
    renderProjectHub();
  }
  function bind(){
    $('analyzeInbox').addEventListener('click',analyzeInbox);
    $('inboxText').addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){e.preventDefault();analyzeInbox();}});
    document.querySelector('.assistant-filter-tabs')?.addEventListener('click',e=>{const tab=e.target.closest('[data-assistant-filter]');if(tab)setActiveFilter(tab.dataset.assistantFilter,{openPanel:true});});
    $('assistantList').addEventListener('click',e=>{const b=e.target.closest('button[data-assistant-action]');if(!b)return;const id=b.dataset.id;switch(b.dataset.assistantAction){case'edit':startEdit(id);break;case'toggle':toggle(id);break;case'delete':remove(id);break;case'save':saveEdit(id);break;case'cancel':cancelEdit();break;}});
    $('assistantProjectHub').addEventListener('click',e=>{
      const project=e.target.closest('[data-project-key]');
      if(project){activeProjectKey=project.dataset.projectKey;render();return;}
      const toggleButton=e.target.closest('[data-project-todo-toggle]');
      if(toggleButton){toggle(toggleButton.dataset.projectTodoToggle);return;}
      const materialize=e.target.closest('[data-materialize-project]');
      if(materialize){materializeProject(materialize.dataset.materializeProject);return;}
      const openFilter=e.target.closest('[data-open-filter]');
      if(openFilter){maybeOpenFilteredItems(openFilter.dataset.openFilter);return;}
      if(e.target.id==='createAssistantProject'){createProject();}
    });
  }

  GPA.assistant={render,bind};
})(window);
