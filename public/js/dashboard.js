(function(root){
  const GPA=root.GPA,s=GPA.state,$=GPA.$,esc=GPA.esc,D=root.DailyAssistantUtils;
  let quickEditorKind=null,quickMenuOpen=false,todoActionMenuId=null,todoActionMode=null,dailyMode=null;
  let briefState={signature:null,status:'idle',sentences:null,error:null};

  function weekdayLabel(dateString){const[y,m,d]=dateString.split('-').map(Number);const dt=new Date(y,m-1,d);return new Intl.DateTimeFormat('ko-KR',{year:'numeric',month:'long',day:'numeric',weekday:'long'}).format(dt);}
  function nowTime(){const d=new Date();return`${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;}
  function defaultMode(){const h=new Date().getHours();return h>=17||h<5?'review':'day';}
  function greeting(){const h=new Date().getHours();if(h<12)return'좋은 아침입니다.';if(h<17)return'좋은 오후입니다.';return'좋은 저녁입니다.';}
  function dayPart(){const h=new Date().getHours();if(h<12)return'morning';if(h<17)return'afternoon';return'evening';}
  function timeGraphic(part){
    if(part==='morning')return`<div class="daily-time-graphic morning" aria-hidden="true"><svg viewBox="0 0 180 92" focusable="false"><circle class="sun" cx="118" cy="34" r="18"/><path class="ray" d="M118 6v12M118 50v12M90 34H78M158 34h12M98 14l8 8M138 14l-8 8"/><path class="horizon" d="M20 72c24-22 46-25 66-8 17-15 38-16 74 8"/></svg></div>`;
    if(part==='afternoon')return`<div class="daily-time-graphic afternoon" aria-hidden="true"><svg viewBox="0 0 180 92" focusable="false"><circle class="sun" cx="126" cy="42" r="22"/><circle class="orbit" cx="126" cy="42" r="34"/><circle class="dot" cx="72" cy="24" r="5"/><circle class="dot small" cx="88" cy="68" r="3"/></svg></div>`;
    return`<div class="daily-time-graphic evening" aria-hidden="true"><svg viewBox="0 0 180 92" focusable="false"><path class="moon" d="M132 16a30 30 0 1 0 22 49 27 27 0 0 1-22-49Z"/><path class="star" d="M90 19l2.5 6.5L99 28l-6.5 2.5L90 37l-2.5-6.5L81 28l6.5-2.5zM62 48l1.8 4.7 4.7 1.8-4.7 1.8L62 61l-1.8-4.7-4.7-1.8 4.7-1.8z"/></svg></div>`;
  }
  function empty(text){return`<div class="empty compact">${esc(text)}</div>`;}
  function context(){return D.buildDailyContext({assistant:s.assistant,today:GPA.today(),now:nowTime()});}
  function timeText(item){if(!item)return'';if(item.allDay)return'종일';return item.dueTime||'시간 미정';}
  function modeButton(mode,label){const active=(dailyMode||defaultMode())===mode;return`<button type="button" class="daily-mode-button ${active?'active':''}" data-daily-mode="${mode}" aria-pressed="${active?'true':'false'}">${label}</button>`;}
  function todoActionControl(item){
    const open=todoActionMenuId===item.id;
    const projects=AssistantUtils.collectAssistantProjects(s.assistant).filter(project=>!project.done||project.title===item.projectTitle);
    const projectNames=[...new Set(projects.map(project=>String(project.title||'').trim()).filter(Boolean))];if(item.projectTitle&&!projectNames.includes(item.projectTitle))projectNames.unshift(item.projectTitle);
    let menu='';
    if(open&&todoActionMode==='date')menu=`<div class="today-todo-action-menu" role="menu"><label>날짜 변경</label><input id="dashboardTodoActionDate" type="date" value="${esc(item.dueDate||'')}"><div class="today-todo-action-editor-buttons"><button type="button" class="text-button" data-dashboard-todo-action-cancel>취소</button><button type="button" class="primary small" data-dashboard-todo-action-save="${item.id}" data-action-kind="date">저장</button></div></div>`;
    else if(open&&todoActionMode==='project')menu=`<div class="today-todo-action-menu" role="menu"><label>프로젝트 변경</label><select id="dashboardTodoActionProject"><option value="">프로젝트 없음</option>${projectNames.map(name=>`<option value="${esc(name)}" ${name===item.projectTitle?'selected':''}>${esc(name)}</option>`).join('')}</select><div class="today-todo-action-editor-buttons"><button type="button" class="text-button" data-dashboard-todo-action-cancel>취소</button><button type="button" class="primary small" data-dashboard-todo-action-save="${item.id}" data-action-kind="project">저장</button></div></div>`;
    else if(open)menu=`<div class="today-todo-action-menu" role="menu"><button type="button" data-dashboard-todo-action="date" data-id="${item.id}">날짜 변경</button><button type="button" data-dashboard-todo-action="project" data-id="${item.id}">프로젝트 변경</button><button type="button" class="danger" data-dashboard-todo-action="delete" data-id="${item.id}">삭제</button></div>`;
    return`<span class="today-todo-action-wrap"><button type="button" class="today-todo-action-button" data-dashboard-todo-actions="${item.id}" aria-expanded="${open?'true':'false'}" aria-label="빠른 작업" title="빠른 작업">⋯</button>${menu}</span>`;
  }
  function todoRows(items,{overdue=false}={}){
    if(!items.length)return empty(overdue?'기한이 지난 할 일이 없습니다.':'오늘 할 일이 없습니다.');
    return`<div class="today-list">${items.map(item=>`<div class="today-row"><span class="today-complete-cell"><button type="button" class="mini-check" data-dashboard-toggle="${item.id}" aria-label="완료"></button></span><button type="button" class="today-row-main" data-dashboard-assistant="todo"><b>${esc(item.title)}</b>${item.projectTitle?`<span>↳ ${esc(item.projectTitle)}</span>`:''}</button><span class="today-row-meta">${overdue?`<span class="today-overdue">D+${item.overdueDays}</span>`:`<span class="today-meta-date today-date-badge">오늘</span>${todoActionControl(item)}`}</span></div>`).join('')}</div>`;
  }
  function scheduleRows(items){
    if(!items.length)return empty('오늘 일정이 없습니다.');
    return`<div class="today-list">${items.map(item=>{const parent=item.occurrenceOf||item.id,occ=item.occurrenceDate||'';return`<button type="button" class="today-row today-click-row" data-dashboard-calendar-item="${esc(parent)}" data-dashboard-calendar-occurrence="${esc(occ)}" data-dashboard-calendar-date="${esc(item.dueDate||GPA.today())}"><span class="today-row-main"><b>${esc(item.title)}</b>${item.projectTitle?`<span>↳ ${esc(item.projectTitle)}</span>`:''}</span><span class="today-row-meta"><span class="today-time">${esc(timeText(item))}</span></span></button>`;}).join('')}</div>`;
  }
  function quickEditor(){
    if(!quickEditorKind)return'';const kind=quickEditorKind,dated=kind==='todo'||kind==='schedule',label=kind==='todo'?'할 일':kind==='memo'?'메모':'일정';
    return`<div class="card pad today-quick-editor" data-dashboard-quick-editor="${kind}"><div class="today-card-head"><h3>${label} 빠른 추가</h3><button type="button" class="text-button" data-dashboard-quick-cancel>닫기</button></div><div class="today-quick-grid"><div class="edit-span"><label>제목</label><input id="dashboardQuickTitle" maxlength="200" placeholder="${label} 제목"></div><div class="edit-span"><label>상세 내용</label><textarea id="dashboardQuickDetails" placeholder="선택 사항"></textarea></div>${dated?`<div><label>${kind==='schedule'?'날짜':'마감일'}</label><input id="dashboardQuickDate" type="date" value="${esc(GPA.today())}"></div>${kind==='schedule'?'<div><label>시간</label><input id="dashboardQuickTime" type="time"></div>':''}`:''}<div class="edit-span"><label>연결 프로젝트</label><input id="dashboardQuickProject" placeholder="선택 사항"></div></div><div id="dashboardQuickError" class="error"></div><div class="actions"><button type="button" class="ghost small" data-dashboard-quick-cancel>취소</button><button type="button" class="primary small" data-dashboard-quick-save>저장</button></div></div>`;
  }
  function briefHtml(c,mode){
    const fallback=D.buildFallbackBrief(c,mode),signature=D.contextSignature(c,mode),sentences=briefState.signature===signature&&Array.isArray(briefState.sentences)?briefState.sentences:fallback;
    const state=briefState.signature===signature?briefState.status:'idle';
    return`<section class="daily-assistant-brief card pad"><div class="daily-brief-head"><div><div class="today-eyebrow">DAILY BRIEF</div><h3>${mode==='review'?'오늘 하루 정리':'오늘의 브리핑'}</h3></div><span class="daily-brief-status">${state==='loading'?'AI 요약 중':state==='ready'?'AI 요약':'로컬 요약'}</span></div><div class="daily-brief-lines">${sentences.map(x=>`<p>${esc(x)}</p>`).join('')}</div></section>`;
  }
  function reviewHtml(c,emphasized){const r=c.review,t=c.tomorrowFirstSchedule;return`<section class="daily-assistant-review card pad ${emphasized?'is-emphasized':''}"><div class="today-card-head"><div><div class="today-eyebrow">DAILY REVIEW</div><h3>오늘 정리</h3></div><span class="today-section-count">저녁</span></div><div class="daily-review-grid"><div><b>${r.completedTodos}</b><span>오늘 완료</span></div><div><b>${r.unfinishedTodos}</b><span>미완료</span></div><div><b>${r.passedSchedules}</b><span>지나간 일정</span></div><div><b>${t?esc(timeText(t)):'-'}</b><span>${t?'내일 첫 일정':'내일 일정 없음'}</span></div></div>${t?`<div class="daily-review-next">${esc(t.title)}</div>`:''}</section>`;}
  function render(){
    const box=$('todayDashboard');if(!box)return;const c=context(),mode=dailyMode||defaultMode();dailyMode=mode;
    const hero=$('dailyAssistantHero'),part=dayPart();
    if(hero)hero.innerHTML=`<section class="today-hero daily-assistant-hero ${part}"><div class="daily-hero-copy"><h2>${esc(greeting())}</h2><div class="daily-date">${esc(weekdayLabel(c.today))}</div></div>${timeGraphic(part)}<div class="today-hero-actions"><div class="daily-mode-switch">${modeButton('day','오늘')}${modeButton('review','리뷰')}</div><div class="today-quick-menu-wrap"><button type="button" class="ghost small" data-dashboard-quick-menu-toggle aria-expanded="${quickMenuOpen?'true':'false'}">+ 빠른 추가 ▾</button>${quickMenuOpen?`<div class="today-quick-menu" role="menu"><button type="button" data-dashboard-quick-add="todo">할 일 추가</button><button type="button" data-dashboard-quick-add="memo">메모 추가</button><button type="button" data-dashboard-quick-add="schedule">일정 추가</button></div>`:''}</div></div></section>`;
    box.innerHTML=`${quickEditor()}
    <div class="today-kpis daily-assistant-kpis"><div class="today-kpi"><b>${c.metrics.todaySchedules}</b><span>오늘 일정</span></div><div class="today-kpi"><b>${c.metrics.todayTodos}</b><span>오늘 할 일</span></div><div class="today-kpi"><b>${c.metrics.important}</b><span>중요 항목</span></div><div class="today-kpi ${c.metrics.unresolved?'warn':''}"><b>${c.metrics.unresolved}</b><span>미처리</span></div></div>
    ${briefHtml(c,mode)}
    ${c.nextSchedule?`<section class="daily-next card pad"><span>다음 일정</span><b>${esc(timeText(c.nextSchedule))} · ${esc(c.nextSchedule.title)}</b></section>`:''}
    <div class="daily-assistant-action-grid"><section class="card pad daily-action-card"><div class="today-card-head"><h3>오늘 일정</h3><span class="today-section-count">${c.todaySchedules.length}개</span></div>${scheduleRows(c.todaySchedules)}</section><section class="card pad daily-action-card"><div class="today-card-head"><h3>오늘 할 일</h3><span class="today-section-count">${c.todayTodos.length}개</span></div>${todoRows(c.todayTodos)}</section><section class="card pad daily-action-card daily-assistant-attention"><div class="today-card-head"><h3>주의 필요</h3><span class="today-section-count">${c.overdueTodos.length}개</span></div>${todoRows(c.overdueTodos,{overdue:true})}</section></div>
    ${c.openTimeWindows.length?`<section class="daily-open-window"><span>여유 시간</span><b>${esc(c.openTimeWindows[0].start)}–${esc(c.openTimeWindows[0].end)}</b><small>${Math.round(c.openTimeWindows[0].minutes/60*10)/10}시간</small></section>`:''}
    ${reviewHtml(c,mode==='review')}`;
    requestBrief(c,mode);
  }
  async function requestBrief(c,mode){
    const signature=D.contextSignature(c,mode);if(briefState.signature===signature&&(briefState.status==='loading'||briefState.status==='ready'||briefState.status==='error'))return;
    briefState={signature,status:'loading',sentences:null,error:null};
    const target=document.querySelector('.daily-brief-status');if(target)target.textContent='AI 요약 중';
    try{
      const payload=compactContextForAI(c);const r=await fetch('/api/daily-brief',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({context:payload,mode})});const data=await r.json();if(!r.ok)throw new Error(data.error||'AI 요약 실패');
      if(briefState.signature!==signature)return;briefState={signature,status:'ready',sentences:Array.isArray(data.sentences)?data.sentences.slice(0,4):null,error:null};render();
    }catch(e){if(briefState.signature!==signature)return;briefState={signature,status:'error',sentences:D.buildFallbackBrief(c,mode),error:e.message};render();}
  }
  function compactContextForAI(c){return{today:c.today,nowTime:c.nowTime,metrics:c.metrics,todaySchedules:c.todaySchedules.map(x=>({title:x.title,dueTime:x.dueTime||null,endTime:x.endTime||null,allDay:Boolean(x.allDay)})),todayTodos:c.todayTodos.map(x=>({title:x.title})),overdueTodos:c.overdueTodos.map(x=>({title:x.title,overdueDays:x.overdueDays})),nextSchedule:c.nextSchedule?{title:c.nextSchedule.title,dueTime:c.nextSchedule.dueTime||null}:null,openTimeWindows:c.openTimeWindows.slice(0,3),review:{completedTodos:c.review.completedTodos,unfinishedTodos:c.review.unfinishedTodos,passedSchedules:c.review.passedSchedules,tomorrowFirstSchedule:c.tomorrowFirstSchedule?{title:c.tomorrowFirstSchedule.title,dueTime:c.tomorrowFirstSchedule.dueTime||null,allDay:Boolean(c.tomorrowFirstSchedule.allDay)}:null}};}
  function saveQuick(){const error=$('dashboardQuickError');try{const item=DashboardUtils.createQuickItem(quickEditorKind,{title:$('dashboardQuickTitle')?.value,details:$('dashboardQuickDetails')?.value,dueDate:$('dashboardQuickDate')?.value,dueTime:$('dashboardQuickTime')?.value,projectTitle:$('dashboardQuickProject')?.value},{id:GPA.uid(),createdAt:new Date().toISOString()});s.assistant.unshift(item);quickEditorKind=null;GPA.persist('dashboard-quick-add');}catch(e){if(error){error.textContent=e.message;error.style.display='block';}else alert(e.message);}}
  function bind(){
    $('todayDashboard')?.addEventListener('click',e=>{
      const mode=e.target.closest('[data-daily-mode]');if(mode){dailyMode=mode.dataset.dailyMode;briefState={signature:null,status:'idle',sentences:null,error:null};render();return;}
      const menuToggle=e.target.closest('[data-dashboard-quick-menu-toggle]');if(menuToggle){quickMenuOpen=!quickMenuOpen;render();return;}
      const quick=e.target.closest('[data-dashboard-quick-add]');if(quick){quickEditorKind=quick.dataset.dashboardQuickAdd;quickMenuOpen=false;render();requestAnimationFrame(()=>$('dashboardQuickTitle')?.focus());return;}
      const todoActions=e.target.closest('[data-dashboard-todo-actions]');if(todoActions){const id=todoActions.dataset.dashboardTodoActions;todoActionMenuId=todoActionMenuId===id?null:id;todoActionMode=null;quickMenuOpen=false;render();return;}
      const todoAction=e.target.closest('[data-dashboard-todo-action]');if(todoAction){const id=todoAction.dataset.id,kind=todoAction.dataset.dashboardTodoAction;if(kind==='delete'){const item=s.assistant.find(x=>x.id===id&&!x.deletedAt);if(item&&confirm('이 할 일을 휴지통으로 이동할까요?')){s.assistant=DashboardActions.softDelete(s.assistant,id,new Date().toISOString());todoActionMenuId=null;todoActionMode=null;GPA.persist('dashboard-todo-delete');}return;}todoActionMenuId=id;todoActionMode=kind;render();requestAnimationFrame(()=>$(kind==='date'?'dashboardTodoActionDate':'dashboardTodoActionProject')?.focus());return;}
      if(e.target.closest('[data-dashboard-todo-action-cancel]')){todoActionMode=null;render();return;}
      const todoActionSave=e.target.closest('[data-dashboard-todo-action-save]');if(todoActionSave){const id=todoActionSave.dataset.dashboardTodoActionSave,kind=todoActionSave.dataset.actionKind;s.assistant=kind==='date'?DashboardActions.updateDate(s.assistant,id,$('dashboardTodoActionDate')?.value||null):DashboardActions.updateProject(s.assistant,id,$('dashboardTodoActionProject')?.value||null);todoActionMenuId=null;todoActionMode=null;GPA.persist(kind==='date'?'dashboard-todo-date':'dashboard-todo-project');return;}
      if(e.target.closest('[data-dashboard-quick-cancel]')){quickEditorKind=null;render();return;}if(e.target.closest('[data-dashboard-quick-save]')){saveQuick();return;}
      const toggle=e.target.closest('[data-dashboard-toggle]');if(toggle){const item=s.assistant.find(x=>x.id===toggle.dataset.dashboardToggle&&!x.deletedAt);if(item){s.assistant=AssistantUtils.toggleAssistantItem(s.assistant,item.id);briefState={signature:null,status:'idle',sentences:null,error:null};GPA.persist('dashboard-toggle');}return;}
      const cal=e.target.closest('[data-dashboard-calendar-item]');if(cal){GPA.showView('calendar');GPA.calendar.openDate(cal.dataset.dashboardCalendarDate);GPA.calendar.openEditor(cal.dataset.dashboardCalendarItem,cal.dataset.dashboardCalendarOccurrence||'');return;}
      const assistant=e.target.closest('[data-dashboard-assistant]');if(assistant){GPA.showView('assistant');GPA.assistant.openFilter(assistant.dataset.dashboardAssistant);return;}
    });
    document.addEventListener('click',e=>{let changed=false;if(quickMenuOpen&&!e.target.closest?.('[data-dashboard-quick-menu-toggle], .today-quick-menu')){quickMenuOpen=false;changed=true;}if(todoActionMenuId&&!e.target.closest?.('[data-dashboard-todo-actions], .today-todo-action-menu')){todoActionMenuId=null;todoActionMode=null;changed=true;}if(changed)render();});
    document.addEventListener('keydown',e=>{if(e.key!=='Escape')return;if(quickMenuOpen||todoActionMenuId){quickMenuOpen=false;todoActionMenuId=null;todoActionMode=null;render();}});
  }
  GPA.dashboard={render,bind};
})(window);
