(function(root){
  const GPA=root.GPA,s=GPA.state,$=GPA.$,esc=GPA.esc;
  const dashboardCollapseState='gpt_pa_v4_dashboard_collapsed';
  let quickEditorKind=null;
  let quickMenuOpen=false;
  let editingTimeId=null;
  let todoActionMenuId=null;
  let todoActionMode=null;

  function weekdayLabel(dateString){
    const [y,m,d]=dateString.split('-').map(Number);const dt=new Date(y,m-1,d);
    return new Intl.DateTimeFormat('ko-KR',{year:'numeric',month:'long',day:'numeric',weekday:'long'}).format(dt);
  }
  function empty(text){return `<div class="empty compact">${esc(text)}</div>`;}
  function dashboardData(){return DashboardUtils.buildTodayDashboard({assistant:s.assistant,cooking:s.cooking,today:GPA.today()});}
  function collapsedState(){try{const v=JSON.parse(localStorage.getItem(dashboardCollapseState)||'{}');return v&&typeof v==='object'?v:{};}catch{return {};}}
  function setCollapsed(key,value){const state=collapsedState();state[key]=Boolean(value);localStorage.setItem(dashboardCollapseState,JSON.stringify(state));}
  function isSectionCollapsed(key,autoEmpty=false){
    const state=collapsedState();
    const explicit=Object.prototype.hasOwnProperty.call(state,key);
    return explicit?Boolean(state[key]):Boolean(autoEmpty);
  }
  function sectionCard(key,title,body,{wide=false,action='',count=0,autoEmpty=false}={}){
    const collapsed=isSectionCollapsed(key,autoEmpty);
    return `<section class="card pad today-card ${wide?'today-wide':''} ${autoEmpty?'is-auto-empty':''} ${collapsed?'is-collapsed':''}" data-dashboard-section="${key}" data-dashboard-auto-empty="${autoEmpty?'true':'false'}"><div class="today-card-head"><h3>${title}</h3><div class="today-card-actions">${action}<span class="today-section-count">${count}개</span><button type="button" class="today-collapse-button" data-dashboard-collapse="${key}" aria-expanded="${collapsed?'false':'true'}" aria-label="${collapsed?'펼치기':'접기'}">${collapsed?'＋':'−'}</button></div></div><div class="today-card-body" ${collapsed?'hidden':''}>${body}</div></section>`;
  }
  function timeLabel(item){return item.dueTime?`<span class="today-time">${esc(item.dueTime)}</span>`:'';}
  function todoTimeControl(item){
    if(editingTimeId===item.id)return `<span class="today-inline-time"><input id="dashboardInlineTime" type="time" value="${esc(item.dueTime||'')}" aria-label="할 일 시간"><button type="button" class="primary small" data-dashboard-time-save="${item.id}">저장</button><button type="button" class="text-button" data-dashboard-time-cancel>취소</button></span>`;
    if(item.dueTime)return `<button type="button" class="today-time today-time-button" data-dashboard-time-edit="${item.id}" title="시간 수정">${esc(item.dueTime)}</button>`;
    return `<button type="button" class="text-button today-time-assign" data-dashboard-time-edit="${item.id}">시간 지정</button>`;
  }
  function todoActionControl(item){
    const open=todoActionMenuId===item.id;
    const projects=AssistantUtils.collectAssistantProjects(s.assistant).filter(project=>!project.done||project.title===item.projectTitle);
    const projectNames=[...new Set(projects.map(project=>String(project.title||'').trim()).filter(Boolean))];
    if(item.projectTitle&&!projectNames.includes(item.projectTitle))projectNames.unshift(item.projectTitle);
    let menu='';
    if(open&&todoActionMode==='date')menu=`<div class="today-todo-action-menu" role="menu"><label>날짜 변경</label><input id="dashboardTodoActionDate" type="date" value="${esc(item.dueDate||'')}"><div class="today-todo-action-editor-buttons"><button type="button" class="text-button" data-dashboard-todo-action-cancel>취소</button><button type="button" class="primary small" data-dashboard-todo-action-save="${item.id}" data-action-kind="date">저장</button></div></div>`;
    else if(open&&todoActionMode==='project')menu=`<div class="today-todo-action-menu" role="menu"><label>프로젝트 변경</label><select id="dashboardTodoActionProject"><option value="">프로젝트 없음</option>${projectNames.map(name=>`<option value="${esc(name)}" ${name===item.projectTitle?'selected':''}>${esc(name)}</option>`).join('')}</select><div class="today-todo-action-editor-buttons"><button type="button" class="text-button" data-dashboard-todo-action-cancel>취소</button><button type="button" class="primary small" data-dashboard-todo-action-save="${item.id}" data-action-kind="project">저장</button></div></div>`;
    else if(open)menu=`<div class="today-todo-action-menu" role="menu"><button type="button" data-dashboard-todo-action="date" data-id="${item.id}">날짜 변경</button><button type="button" data-dashboard-todo-action="project" data-id="${item.id}">프로젝트 변경</button><button type="button" class="danger" data-dashboard-todo-action="delete" data-id="${item.id}">삭제</button></div>`;
    return `<span class="today-todo-action-wrap"><button type="button" class="today-todo-action-button" data-dashboard-todo-actions="${item.id}" aria-expanded="${open?'true':'false'}" aria-label="빠른 작업" title="빠른 작업">⋯</button>${menu}</span>`;
  }
  function todoRows(items,{overdue=false}={}){
    if(!items.length)return empty(overdue?'기한이 지난 할 일이 없습니다.':'오늘 할 일이 없습니다.');
    return `<div class="today-list">${items.map(item=>`<div class="today-row"><span class="today-complete-cell"><button type="button" class="mini-check" data-dashboard-toggle="${item.id}" aria-label="완료"></button></span><button type="button" class="today-row-main" data-dashboard-assistant="todo"><b>${esc(item.title)}</b>${item.projectTitle?`<span>↳ ${esc(item.projectTitle)}</span>`:''}</button><span class="today-row-meta"><span class="today-meta-time">${overdue?timeLabel(item):todoTimeControl(item)}</span>${item.dueDate?`<span class="today-meta-date chip">${esc(item.dueDate)}</span>`:''}${overdue?`<span class="today-overdue">D+${item.overdueDays}</span>`:''}${overdue?'':todoActionControl(item)}</span></div>`).join('')}</div>`;
  }
  function scheduleRows(items){
    if(!items.length)return empty('오늘 일정이 없습니다.');
    return `<div class="today-list">${items.map(item=>`<button type="button" class="today-row today-click-row" data-dashboard-assistant-item="${item.id}"><span class="today-row-main"><b>${esc(item.title)}</b>${item.projectTitle?`<span>↳ ${esc(item.projectTitle)}</span>`:''}${item.details?`<span>${esc(item.details)}</span>`:''}</span><span class="today-row-meta"><span class="today-meta-time">${timeLabel(item)}</span><span class="today-meta-date today-date-badge">오늘</span></span></button>`).join('')}</div>`;
  }
  function upcomingRows(items){
    if(!items.length)return empty('7일 안에 예정된 마감이 없습니다.');
    return `<div class="today-list">${items.map(item=>`<button type="button" class="today-row today-click-row" ${item.scheduleOnly?`data-dashboard-assistant-item="${item.id}"`:item.projectTitle?`data-dashboard-project="${esc(item.projectTitle)}"`:'data-dashboard-assistant="todo"'}><span class="today-row-main"><b>${esc(item.title)}</b><span>${item.scheduleOnly?'일정':'할 일'}${item.projectTitle?` · ${esc(item.projectTitle)}`:''}</span></span><span class="today-row-meta"><span class="today-meta-time">${timeLabel(item)}</span><span class="today-meta-date today-date-badge">${esc(item.dueDate.slice(5))}</span></span></button>`).join('')}</div>`;
  }
  function projectRows(projects){
    if(!projects.length)return empty('진행 중인 프로젝트가 없습니다.');
    return `<div class="today-project-list">${projects.slice(0,6).map(project=>`<button type="button" class="today-project-row" data-dashboard-project="${esc(project.key)}"><div class="today-project-head"><b>${esc(project.title)}</b><span>${project.progress}%</span></div><div class="today-project-progress"><span style="width:${project.progress}%"></span></div><div class="today-project-meta"><span>할 일 ${project.stats.todos}</span>${project.nextDue?`<span>다음 마감 ${esc(project.nextDue)}</span>`:'<span>마감 없음</span>'}</div></button>`).join('')}</div>`;
  }
  function memoCards(memos){
    if(!memos.length)return empty('최근 메모가 없습니다.');
    return `<div class="today-memo-grid">${memos.map(item=>`<button type="button" class="today-memo-card" data-dashboard-assistant="memo"><b>${esc(item.title)}</b><div>${esc(item.details||'내용 없음')}</div><span>${item.projectTitle?`↳ ${esc(item.projectTitle)}`:(item.createdAt?esc(String(item.createdAt).slice(0,10)):'')}</span></button>`).join('')}</div>`;
  }
  function cookingRows(projects){
    if(!projects.length)return empty('7일 안에 예정된 요리 프로젝트가 없습니다.');
    return `<div class="today-list">${projects.map(project=>`<button type="button" class="today-row today-click-row" data-dashboard-cooking="${project.id}"><span class="today-row-main"><b>${esc(project.name)}</b><span>${Number(project.servings)>0?`${esc(project.servings)}인 · `:''}레시피 ${(project.recipes||[]).length}개</span></span><span class="today-row-meta"><span class="today-meta-date today-date-badge">${esc(project.date.slice(5))}</span></span></button>`).join('')}</div>`;
  }
  function quickEditor(){
    if(!quickEditorKind)return'';
    const kind=quickEditorKind;const dated=kind==='todo'||kind==='schedule';const label=kind==='todo'?'할 일':kind==='memo'?'메모':'일정';
    return `<div class="card pad today-quick-editor" data-dashboard-quick-editor="${kind}"><div class="today-card-head"><h3>${label} 빠른 추가</h3><button type="button" class="text-button" data-dashboard-quick-cancel>닫기</button></div><div class="today-quick-grid"><div class="edit-span"><label>제목</label><input id="dashboardQuickTitle" maxlength="200" placeholder="${label} 제목"></div><div class="edit-span"><label>상세 내용</label><textarea id="dashboardQuickDetails" placeholder="선택 사항"></textarea></div>${dated?`<div><label>${kind==='schedule'?'날짜':'마감일'}</label><input id="dashboardQuickDate" type="date" value="${esc(GPA.today())}"></div><div><label>시간</label><input id="dashboardQuickTime" type="time"></div>`:''}<div class="edit-span"><label>연결 프로젝트</label><input id="dashboardQuickProject" placeholder="선택 사항"></div></div><div id="dashboardQuickError" class="error"></div><div class="actions"><button type="button" class="ghost small" data-dashboard-quick-cancel>취소</button><button type="button" class="primary small" data-dashboard-quick-save>저장</button></div></div>`;
  }
  function render(){
    const box=$('todayDashboard');if(!box)return;const d=dashboardData();const today=GPA.today();
    box.innerHTML=`<div class="today-hero"><div><div class="today-eyebrow">TODAY</div><h2>${esc(weekdayLabel(today))}</h2><div class="notice" style="margin:4px 0 0">오늘 필요한 일과 가까운 마감만 모았습니다.</div></div><div class="today-hero-actions"><div class="today-quick-menu-wrap"><button type="button" class="ghost small" data-dashboard-quick-menu-toggle aria-expanded="${quickMenuOpen?'true':'false'}">+ 빠른 추가 ▾</button>${quickMenuOpen?`<div class="today-quick-menu" role="menu"><button type="button" data-dashboard-quick-add="todo">할 일 추가</button><button type="button" data-dashboard-quick-add="memo">메모 추가</button><button type="button" data-dashboard-quick-add="schedule">일정 추가</button></div>`:''}</div></div></div>
      ${quickEditor()}
      <div class="today-kpis"><div class="today-kpi"><b>${d.kpis.todayTodos}</b><span>오늘 할 일</span></div><div class="today-kpi"><b>${d.kpis.todaySchedules}</b><span>오늘 일정</span></div><div class="today-kpi ${d.kpis.overdueTodos?'warn':''}"><b>${d.kpis.overdueTodos}</b><span>기한 지남</span></div><div class="today-kpi"><b>${d.kpis.activeProjects}</b><span>진행 프로젝트</span></div></div>
      <div class="today-grid">${sectionCard('todayTodos','오늘 할 일',todoRows(d.todayTodos),{action:'<button class="text-button" data-dashboard-assistant="todo">전체 보기</button>',count:d.todayTodos.length,autoEmpty:d.todayTodos.length===0})}${sectionCard('todaySchedules','오늘 일정',scheduleRows(d.todaySchedules),{count:d.todaySchedules.length,autoEmpty:d.todaySchedules.length===0})}${sectionCard('overdue','기한 지난 할 일',todoRows(d.overdueTodos,{overdue:true}),{action:'<button class="text-button" data-dashboard-assistant="todo">전체 보기</button>',count:d.overdueTodos.length,autoEmpty:d.overdueTodos.length===0})}${sectionCard('upcoming','다가오는 마감',upcomingRows(d.upcoming),{action:'<span class="badge">7일</span>',count:d.upcoming.length,autoEmpty:d.upcoming.length===0})}${sectionCard('projects','진행 중 프로젝트',projectRows(d.projects),{wide:true,action:'<button class="text-button" data-dashboard-assistant="project">프로젝트 허브</button>',count:d.projects.length,autoEmpty:d.projects.length===0})}${sectionCard('memos','최근 메모',memoCards(d.recentMemos),{action:'<button class="text-button" data-dashboard-assistant="memo">메모 보기</button>',count:d.recentMemos.length,autoEmpty:d.recentMemos.length===0})}${sectionCard('cooking','요리 일정',cookingRows(d.cookingUpcoming),{action:'<button class="text-button" data-dashboard-cooking-view>요리 프로젝트</button>',count:d.cookingUpcoming.length,autoEmpty:d.cookingUpcoming.length===0})}</div>`;
  }
  function saveQuick(){
    const error=$('dashboardQuickError');
    try{
      const item=DashboardUtils.createQuickItem(quickEditorKind,{title:$('dashboardQuickTitle')?.value,details:$('dashboardQuickDetails')?.value,dueDate:$('dashboardQuickDate')?.value,dueTime:$('dashboardQuickTime')?.value,projectTitle:$('dashboardQuickProject')?.value},{id:GPA.uid(),createdAt:new Date().toISOString()});
      s.assistant.unshift(item);quickEditorKind=null;GPA.persist('dashboard-quick-add');
    }catch(e){if(error){error.textContent=e.message;error.style.display='block';}else alert(e.message);}
  }
  function bind(){
    $('todayDashboard')?.addEventListener('click',e=>{
      const menuToggle=e.target.closest('[data-dashboard-quick-menu-toggle]');if(menuToggle){quickMenuOpen=!quickMenuOpen;render();return;}
      const quick=e.target.closest('[data-dashboard-quick-add]');if(quick){quickEditorKind=quick.dataset.dashboardQuickAdd;quickMenuOpen=false;render();requestAnimationFrame(()=>$('dashboardQuickTitle')?.focus());return;}
      const todoActions=e.target.closest('[data-dashboard-todo-actions]');if(todoActions){const id=todoActions.dataset.dashboardTodoActions;todoActionMenuId=todoActionMenuId===id?null:id;todoActionMode=null;quickMenuOpen=false;render();return;}
      const todoAction=e.target.closest('[data-dashboard-todo-action]');if(todoAction){const id=todoAction.dataset.id;const kind=todoAction.dataset.dashboardTodoAction;if(kind==='delete'){const item=s.assistant.find(x=>x.id===id&&!x.deletedAt);if(item&&confirm('이 할 일을 휴지통으로 이동할까요?')){s.assistant=DashboardActions.softDelete(s.assistant,id,new Date().toISOString());todoActionMenuId=null;todoActionMode=null;GPA.persist('dashboard-todo-delete');}return;}todoActionMenuId=id;todoActionMode=kind;render();requestAnimationFrame(()=>$(kind==='date'?'dashboardTodoActionDate':'dashboardTodoActionProject')?.focus());return;}
      if(e.target.closest('[data-dashboard-todo-action-cancel]')){todoActionMode=null;render();return;}
      const todoActionSave=e.target.closest('[data-dashboard-todo-action-save]');if(todoActionSave){const id=todoActionSave.dataset.dashboardTodoActionSave;const kind=todoActionSave.dataset.actionKind;s.assistant=kind==='date'?DashboardActions.updateDate(s.assistant,id,$('dashboardTodoActionDate')?.value||null):DashboardActions.updateProject(s.assistant,id,$('dashboardTodoActionProject')?.value||null);todoActionMenuId=null;todoActionMode=null;GPA.persist(kind==='date'?'dashboard-todo-date':'dashboard-todo-project');return;}
      const timeEdit=e.target.closest('[data-dashboard-time-edit]');if(timeEdit){editingTimeId=timeEdit.dataset.dashboardTimeEdit;todoActionMenuId=null;todoActionMode=null;render();requestAnimationFrame(()=>$('dashboardInlineTime')?.focus());return;}
      if(e.target.closest('[data-dashboard-time-cancel]')){editingTimeId=null;render();return;}
      const timeSave=e.target.closest('[data-dashboard-time-save]');if(timeSave){const item=s.assistant.find(x=>x.id===timeSave.dataset.dashboardTimeSave&&!x.deletedAt);if(item){s.assistant=DashboardActions.updateTime(s.assistant,item.id,$('dashboardInlineTime')?.value||null);editingTimeId=null;GPA.persist('dashboard-time');}return;}
      if(e.target.closest('[data-dashboard-quick-cancel]')){quickEditorKind=null;render();return;}
      if(e.target.closest('[data-dashboard-quick-save]')){saveQuick();return;}
      const collapse=e.target.closest('[data-dashboard-collapse]');if(collapse){const key=collapse.dataset.dashboardCollapse;const section=collapse.closest('[data-dashboard-section]');const autoEmpty=section?.dataset.dashboardAutoEmpty==='true';setCollapsed(key,!isSectionCollapsed(key,autoEmpty));render();return;}
      const toggle=e.target.closest('[data-dashboard-toggle]');if(toggle){const item=s.assistant.find(x=>x.id===toggle.dataset.dashboardToggle&&!x.deletedAt);if(item){s.assistant=AssistantUtils.toggleAssistantItem(s.assistant,item.id);GPA.persist('dashboard-toggle');}return;}
      const assistantItem=e.target.closest('[data-dashboard-assistant-item]');if(assistantItem){GPA.showView('assistant');GPA.assistant.openItem(assistantItem.dataset.dashboardAssistantItem);return;}
      const project=e.target.closest('[data-dashboard-project]');if(project){GPA.showView('assistant');GPA.assistant.openProject(project.dataset.dashboardProject);return;}
      const assistant=e.target.closest('[data-dashboard-assistant]');if(assistant){GPA.showView('assistant');GPA.assistant.openFilter(assistant.dataset.dashboardAssistant);return;}
      const cooking=e.target.closest('[data-dashboard-cooking]');if(cooking){GPA.showView('cooking');GPA.cooking.openProject(cooking.dataset.dashboardCooking);return;}
      if(e.target.closest('[data-dashboard-cooking-view]')){GPA.showView('cooking');GPA.cooking.showMode('projects');}
    });
    document.addEventListener('click',e=>{let changed=false;if(quickMenuOpen&&!e.target.closest?.('[data-dashboard-quick-menu-toggle], .today-quick-menu')){quickMenuOpen=false;changed=true;}if(todoActionMenuId&&!e.target.closest?.('[data-dashboard-todo-actions], .today-todo-action-menu')){todoActionMenuId=null;todoActionMode=null;changed=true;}if(changed)render();});
    document.addEventListener('keydown',e=>{if(e.key!=='Escape')return;if(quickMenuOpen||editingTimeId||todoActionMenuId){quickMenuOpen=false;editingTimeId=null;todoActionMenuId=null;todoActionMode=null;render();}});
  }
  GPA.dashboard={render,bind};
})(window);
