(function(root){
  const GPA=root.GPA,s=GPA.state,$=GPA.$,esc=GPA.esc;
  function weekdayLabel(dateString){
    const [y,m,d]=dateString.split('-').map(Number);const dt=new Date(y,m-1,d);
    return new Intl.DateTimeFormat('ko-KR',{year:'numeric',month:'long',day:'numeric',weekday:'long'}).format(dt);
  }
  function empty(text){return `<div class="empty compact">${esc(text)}</div>`;}
  function dashboardData(){return DashboardUtils.buildTodayDashboard({assistant:s.assistant,cooking:s.cooking,today:GPA.today()});}
  function todoRows(items,{overdue=false}={}){
    if(!items.length)return empty(overdue?'기한이 지난 할 일이 없습니다.':'오늘 할 일이 없습니다.');
    return `<div class="today-list">${items.map(item=>`<div class="today-row"><button type="button" class="mini-check" data-dashboard-toggle="${item.id}" aria-label="완료"></button><button type="button" class="today-row-main" data-dashboard-assistant="todo"><b>${esc(item.title)}</b>${item.projectTitle?`<span>↳ ${esc(item.projectTitle)}</span>`:''}</button>${overdue?`<span class="today-overdue">D+${item.overdueDays}</span>`:(item.dueDate?`<span class="chip">${esc(item.dueDate)}</span>`:'')}</div>`).join('')}</div>`;
  }
  function scheduleRows(items){
    if(!items.length)return empty('오늘 일정이 없습니다.');
    return `<div class="today-list">${items.map(item=>`<button type="button" class="today-row today-click-row" ${item.projectTitle?`data-dashboard-project="${esc(item.projectTitle)}"`:'data-dashboard-assistant="todo"'}><span class="today-date-badge">오늘</span><span class="today-row-main"><b>${esc(item.title)}</b>${item.projectTitle?`<span>↳ ${esc(item.projectTitle)}</span>`:''}${item.details?`<span>${esc(item.details)}</span>`:''}</span></button>`).join('')}</div>`;
  }
  function upcomingRows(items){
    if(!items.length)return empty('7일 안에 예정된 마감이 없습니다.');
    return `<div class="today-list">${items.map(item=>`<button type="button" class="today-row today-click-row" ${item.projectTitle?`data-dashboard-project="${esc(item.projectTitle)}"`:`data-dashboard-assistant="${item.scheduleOnly?'project':'todo'}"`}><span class="today-date-badge">${esc(item.dueDate.slice(5))}</span><span class="today-row-main"><b>${esc(item.title)}</b><span>${item.scheduleOnly?'일정':'할 일'}${item.projectTitle?` · ${esc(item.projectTitle)}`:''}</span></span></button>`).join('')}</div>`;
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
    return `<div class="today-list">${projects.map(project=>`<button type="button" class="today-row today-click-row" data-dashboard-cooking="${project.id}"><span class="today-date-badge">${esc(project.date.slice(5))}</span><span class="today-row-main"><b>${esc(project.name)}</b><span>${Number(project.servings)>0?`${esc(project.servings)}인 · `:''}레시피 ${(project.recipes||[]).length}개</span></span></button>`).join('')}</div>`;
  }
  function render(){
    const box=$('todayDashboard');if(!box)return;const d=dashboardData();const today=GPA.today();
    box.innerHTML=`<div class="today-hero"><div><div class="today-eyebrow">TODAY</div><h2>${esc(weekdayLabel(today))}</h2><div class="notice" style="margin:4px 0 0">오늘 필요한 일과 가까운 마감만 모았습니다.</div></div><button type="button" class="ghost small" data-dashboard-assistant="todo">개인 비서 열기</button></div>
      <div class="today-kpis"><div class="today-kpi"><b>${d.kpis.todayTodos}</b><span>오늘 할 일</span></div><div class="today-kpi"><b>${d.kpis.todaySchedules}</b><span>오늘 일정</span></div><div class="today-kpi ${d.kpis.overdueTodos?'warn':''}"><b>${d.kpis.overdueTodos}</b><span>기한 지남</span></div><div class="today-kpi"><b>${d.kpis.activeProjects}</b><span>진행 프로젝트</span></div></div>
      <div class="today-grid"><section class="card pad today-card"><div class="today-card-head"><h3>오늘 할 일</h3><button class="text-button" data-dashboard-assistant="todo">전체 보기</button></div>${todoRows(d.todayTodos)}</section><section class="card pad today-card"><div class="today-card-head"><h3>오늘 일정</h3><span class="badge">${d.todaySchedules.length}개</span></div>${scheduleRows(d.todaySchedules)}</section><section class="card pad today-card"><div class="today-card-head"><h3>기한 지난 할 일</h3><button class="text-button" data-dashboard-assistant="todo">전체 보기</button></div>${todoRows(d.overdueTodos,{overdue:true})}</section><section class="card pad today-card"><div class="today-card-head"><h3>다가오는 마감</h3><span class="badge">7일</span></div>${upcomingRows(d.upcoming)}</section><section class="card pad today-card today-wide"><div class="today-card-head"><h3>진행 중 프로젝트</h3><button class="text-button" data-dashboard-assistant="project">프로젝트 허브</button></div>${projectRows(d.projects)}</section><section class="card pad today-card today-wide"><div class="today-card-head"><h3>최근 메모</h3><button class="text-button" data-dashboard-assistant="memo">메모 보기</button></div>${memoCards(d.recentMemos)}</section><section class="card pad today-card today-wide"><div class="today-card-head"><h3>요리 일정</h3><button class="text-button" data-dashboard-cooking-view>요리 프로젝트</button></div>${cookingRows(d.cookingUpcoming)}</section></div>`;
  }
  function bind(){
    $('todayDashboard')?.addEventListener('click',e=>{
      const toggle=e.target.closest('[data-dashboard-toggle]');if(toggle){const item=s.assistant.find(x=>x.id===toggle.dataset.dashboardToggle&&!x.deletedAt);if(item){item.done=!item.done;GPA.persist('dashboard-toggle');}return;}
      const project=e.target.closest('[data-dashboard-project]');if(project){GPA.showView('assistant');GPA.assistant.openProject(project.dataset.dashboardProject);return;}
      const assistant=e.target.closest('[data-dashboard-assistant]');if(assistant){GPA.showView('assistant');GPA.assistant.openFilter(assistant.dataset.dashboardAssistant);return;}
      const cooking=e.target.closest('[data-dashboard-cooking]');if(cooking){GPA.showView('cooking');GPA.cooking.openProject(cooking.dataset.dashboardCooking);return;}
      if(e.target.closest('[data-dashboard-cooking-view]')){GPA.showView('cooking');GPA.cooking.showMode('projects');}
    });
  }
  GPA.dashboard={render,bind};
})(window);
