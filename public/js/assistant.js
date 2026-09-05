(function(root){
  const GPA=root.GPA,s=GPA.state,$=GPA.$,esc=GPA.esc;
  const typeLabels={todo:'할 일',memo:'메모',project:'프로젝트'};
  const classificationLabels={todo:'할 일',schedule:'일정',memo:'메모',project:'프로젝트'};
  const FEEDBACK_KEY='gpa-assistant-classification-feedback-v1';
  const priorityLabels={high:'높음',medium:'보통',low:'낮음'};
  const filterLabels={todo:'할 일',memo:'메모',project:'장기 프로젝트',done:'완료',trash:'휴지통'};
  let activeFilter='todo';
  let activeTodoMode='todo';
  let undoTimer=null;
  let feedbackCache=null;
  let memoSortDirection='desc';
  let activeMemoId=null;
  let memoComposerOpen=false;

  function loadClassificationFeedback(){if(Array.isArray(feedbackCache))return feedbackCache;try{const data=JSON.parse(localStorage.getItem(FEEDBACK_KEY)||'[]');feedbackCache=Array.isArray(data)?data.slice(-200):[];}catch{feedbackCache=[];}return feedbackCache;}
  function recordClassificationFeedback(sourceText,from,to){if(!sourceText||from===to||!['todo','schedule'].includes(from)||!['todo','schedule'].includes(to))return;try{const list=loadClassificationFeedback();list.push(AssistantUtils.createClassificationFeedback(sourceText,from,to));feedbackCache=list.slice(-200);localStorage.setItem(FEEDBACK_KEY,JSON.stringify(feedbackCache));}catch{}}
  function resetClassificationLearning(){if(!confirm('분류 학습 기록을 모두 초기화할까요? 이 작업은 되돌릴 수 없습니다.'))return;try{localStorage.removeItem(FEEDBACK_KEY);feedbackCache=[];alert('분류 학습 기록을 초기화했습니다.');}catch{alert('분류 학습 기록을 초기화하지 못했습니다.');}}
  function resetAssistantData(){
    const first='모든 할 일, 일정, 날짜 미정 일정, 메모, 프로젝트, 휴지통, 완료 항목과 분류 학습 기록이 삭제됩니다. 앱 설정과 실행 설정은 유지됩니다. 계속할까요?';
    if(!confirm(first))return;
    if(!confirm('정말 모든 Assistant 데이터를 초기화할까요? 이 작업은 되돌릴 수 없습니다.'))return;
    try{
      if(undoTimer){clearTimeout(undoTimer);undoTimer=null;}document.getElementById('assistantUndoToast')?.remove();
      s.assistant=[];s.editingAssistantId=null;localStorage.removeItem(FEEDBACK_KEY);feedbackCache=[];
      GPA.persist('reset-assistant-data');setActiveFilter('todo');
      alert('모든 Assistant 데이터가 초기화되었습니다.');
    }catch{alert('전체 데이터 초기화에 실패했습니다.');}
  }
  function addManualMemo(){try{const title=$('memoManualTitle')?.value||'';const details=$('memoManualDetails')?.value||'';const now=new Date().toISOString();const memo=AssistantUtils.createManualMemo(title,details,{id:GPA.uid(),createdAt:now,updatedAt:now});s.assistant.unshift(memo);activeMemoId=memo.id;memoComposerOpen=false;GPA.persist('manual-memo');}catch(e){alert(e.message);}}

  function setInboxError(message=''){const el=$('inboxError');if(!el)return;el.textContent=message;el.style.display=message?'block':'none';}
  function setInboxResult(message=''){const el=$('inboxResult');if(!el)return;el.textContent=message;el.classList.toggle('show',Boolean(message));}
  async function analyzeInbox(){
    const input=$('inboxText');const text=input.value.trim();if(!text)return;
    if(GPA.search?.handleSubmit(text)){GPA.search.refreshButtonMode();return;}
    GPA.search?.clear();
    const analysis=AssistantUtils.analyzeNaturalInput(text,GPA.today());const recurrence=analysis.recurrence;if(recurrence){setInboxError(recurrence.error);setInboxResult('');GPA.search?.refreshButtonMode();return;}
    const localCommand=AssistantUtils.parseLocalInboxCommand(text,GPA.today());
    if(localCommand){
      setInboxError('');setInboxResult('');
      if(!localCommand.item){setInboxError(localCommand.error||`${localCommand.command} 뒤에 내용을 입력해 주세요.`);GPA.search?.refreshButtonMode();return;}
      const candidate={...localCommand.item,done:false,createdAt:new Date().toISOString()};
      const semantic=AssistantUtils.reconcileUndecidedScheduleConflicts([candidate],s.assistant);
      if(!semantic.items.length){setInboxError('같은 제목의 확정 일정이 이미 등록되어 있어 날짜 미정 일정을 중복 저장하지 않았습니다.');GPA.search?.refreshButtonMode();return;}
      if(semantic.supersededIds.length){const ids=new Set(semantic.supersededIds);s.assistant=s.assistant.filter(item=>!ids.has(item?.id));}
      const saved={id:GPA.uid(),...semantic.items[0]};
      s.assistant.unshift(saved);input.value='';GPA.persist(`local-command-${localCommand.command}`);
      const kind=saved.scheduleOnly?(saved.dateUndecided?'날짜 미정 일정':'일정'):saved.type==='memo'?'메모':'할 일';
      const when=saved.dateUndecided&&saved.pendingMonth?`${saved.pendingMonth} · 날짜 미정 · `:saved.dueDate?`${saved.dueDate} · `:'';
      setInboxResult(`✓ ${kind} 저장 · ${when}${saved.dueTime?`${saved.dueTime}${saved.endTime?`~${saved.endTime}`:''} · `:''}${saved.title}`);GPA.search?.refreshButtonMode();return;
    }
    const btn=$('analyzeInbox');btn.disabled=true;btn.textContent='GPT 정리 중...';setInboxError('');setInboxResult('');const started=performance.now();
    try{
      const r=await fetch('/api/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text,currentDate:GPA.today()})});
      const d=await r.json();if(!r.ok)throw new Error(d.error||'분석 실패');
      const rawItems=Array.isArray(d.items)?d.items:[];const feedback=loadClassificationFeedback();
      const prepared=AssistantUtils.prepareNaturalInboxItems(rawItems,text,GPA.today(),feedback,analysis);
      if(!prepared.length){if(rawItems.some(item=>item?.type==='memo'))throw new Error('메모는 자동 생성하지 않습니다. 메모 탭에서 직접 작성해 주세요.');throw new Error('저장 가능한 항목을 찾지 못했습니다. 내용을 조금 더 구체적으로 입력해 주세요.');}
      const semantic=AssistantUtils.reconcileUndecidedScheduleConflicts(prepared,s.assistant);
      if(!semantic.items.length)throw new Error('같은 제목의 확정 일정이 이미 등록되어 있어 날짜 미정 일정을 중복 저장하지 않았습니다.');
      const now=new Date().toISOString();const items=AssistantUtils.filterRecentDuplicateItems(semantic.items,s.assistant,now,10000);
      if(!items.length)throw new Error('같은 항목이 방금 등록되어 중복 저장하지 않았습니다.');
      if(semantic.supersededIds.length){const ids=new Set(semantic.supersededIds);s.assistant=s.assistant.filter(item=>!ids.has(item?.id));}
      const saved=items.map(x=>({id:GPA.uid(),...x,done:false,createdAt:now}));s.assistant.unshift(...saved);
      const firstProject=(saved.find(x=>x.type==='project')?.title)||saved.find(x=>x.projectTitle)?.projectTitle||'';if(firstProject)projectHub.select(firstProject);
      input.value='';GPA.persist();const result=AssistantUtils.summarizeInboxItems(items);const modelSummary=String(d.summary||'').trim();
      setInboxResult(`✓ ${result.total}개 저장 · ${result.text}${modelSummary?` — ${modelSummary}`:''}`);btn.title=`최근 GPT 분류 ${((performance.now()-started)/1000).toFixed(1)}초`;
    }catch(e){setInboxError(e.message||'분석 중 오류가 발생했습니다.');}finally{btn.disabled=false;GPA.search?.refreshButtonMode();}
  }

  function toggle(id){const x=s.assistant.find(x=>x.id===id&&!x.deletedAt);if(x){s.assistant=AssistantUtils.toggleAssistantItem(s.assistant,id,new Date().toISOString());GPA.persist();}}
  function cancelSchedule(id){const item=s.assistant.find(x=>x.id===id&&!x.deletedAt&&x.scheduleOnly);if(!item)return;const next=item.canceledAt?null:new Date().toISOString();s.assistant=AssistantUtils.updateAssistantItem(s.assistant,id,{canceledAt:next});GPA.persist('schedule-cancel');}
  function showUndoToast(item){
    if(undoTimer){clearTimeout(undoTimer);undoTimer=null;}document.getElementById('assistantUndoToast')?.remove();
    const toast=document.createElement('div');toast.id='assistantUndoToast';toast.style.cssText='position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:9999;background:#202124;color:#fff;padding:10px 12px;border-radius:10px;display:flex;align-items:center;gap:12px;box-shadow:0 6px 24px rgba(0,0,0,.25)';
    toast.innerHTML=`<span>${esc(item.title||'항목')} 삭제됨</span><button type="button" style="border:0;background:transparent;color:#8ab4f8;font-weight:700;cursor:pointer">되돌리기</button>`;
    toast.querySelector('button').addEventListener('click',()=>{s.assistant=AssistantUtils.restoreAssistantItem(s.assistant,item.id);toast.remove();if(undoTimer)clearTimeout(undoTimer);undoTimer=null;GPA.persist('undo-delete');});document.body.appendChild(toast);
    undoTimer=setTimeout(()=>{toast.remove();undoTimer=null;},5000);
  }
  function softDelete(id){
    const item=s.assistant.find(x=>x.id===id&&!x.deletedAt);if(!item)return;
    s.assistant=AssistantUtils.softDeleteAssistantItem(s.assistant,id,new Date().toISOString());
    if(s.editingAssistantId===id)s.editingAssistantId=null;projectHub.clearEditorForItem(id);GPA.persist('soft-delete');showUndoToast(item);
  }
  function restore(id){s.assistant=AssistantUtils.restoreAssistantItem(s.assistant,id);GPA.persist();}
  function permanentDelete(id){if(!confirm('이 항목을 영구 삭제할까요? 이 작업은 되돌릴 수 없습니다.'))return;s.assistant=AssistantUtils.permanentlyDeleteAssistantItem(s.assistant,id);GPA.persist();}
  function emptyTrash(){if(!AssistantUtils.filterAssistantItems(s.assistant,'trash').length)return;if(!confirm('휴지통을 비울까요? 모든 항목이 영구 삭제됩니다.'))return;s.assistant=AssistantUtils.emptyAssistantTrash(s.assistant);GPA.persist();}

  function startEdit(id){s.editingAssistantId=id;render();requestAnimationFrame(()=>$(`edit-title-${id}`)?.focus());}
  function cancelEdit(){s.editingAssistantId=null;render();}
  function pendingDateParts(x){
    const raw=/^(\d{4})-(\d{2})$/.exec(String(x?.pendingMonth||''));
    const fallback=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(x?.dueDate||''));
    const year=Number(raw?.[1]||fallback?.[1]||GPA.today().slice(0,4));
    const month=Number(raw?.[2]||fallback?.[2]||GPA.today().slice(5,7));
    const day=x?.dateUndecided?null:Number(fallback?.[3]||0)||null;
    return {year,month,day};
  }
  function dayOptions(year,month,selectedDay=null){
    const days=new Date(Number(year),Number(month),0).getDate();
    return `<option value="" ${selectedDay?'':'selected'}>--</option>${Array.from({length:days},(_,i)=>{const d=i+1;return `<option value="${String(d).padStart(2,'0')}" ${d===Number(selectedDay)?'selected':''}>${String(d).padStart(2,'0')}</option>`;}).join('')}`;
  }
  function updatePendingDayOptions(id){
    const year=Number($(`edit-date-year-${id}`)?.value);
    const month=Number($(`edit-date-month-${id}`)?.value);
    const day=$(`edit-date-day-${id}`);
    if(!day||!Number.isInteger(year)||year<1||month<1||month>12)return;
    const current=Number(day.value)||null;
    const max=new Date(year,month,0).getDate();
    day.innerHTML=dayOptions(year,month,current&&current<=max?current:null);
  }
  function saveEdit(id){
    try{
      const before=s.assistant.find(item=>item.id===id);if(!before)throw new Error('수정할 항목을 찾지 못했습니다.');
      const classification=$(`edit-classification-${id}`)?.value||(before.scheduleOnly?'schedule':before.type);
      const scheduleOnly=classification==='schedule';
      const patch={title:$(`edit-title-${id}`)?.value,details:$(`edit-details-${id}`)?.value,type:scheduleOnly?'todo':classification,scheduleOnly,priority:$(`edit-priority-${id}`)?.value,dueDate:$(`edit-due-${id}`)?.value,projectTitle:$(`edit-project-${id}`)?.value};
      if(scheduleOnly){
        patch.dueTime=$(`edit-time-${id}`)?.value;patch.endTime=$(`edit-end-${id}`)?.value;patch.allDay=Boolean($(`edit-all-day-${id}`)?.checked);
        const repeatType=$(`edit-repeat-${id}`)?.value||'none';patch.repeat=repeatType==='none'?null:{type:repeatType,interval:1};
        if(before.dateUndecided){
          const year=Number($(`edit-date-year-${id}`)?.value);const month=Number($(`edit-date-month-${id}`)?.value);const day=String($(`edit-date-day-${id}`)?.value||'');
          if(!Number.isInteger(year)||year<1)throw new Error('올바른 연도를 입력해 주세요.');if(!Number.isInteger(month)||month<1||month>12)throw new Error('올바른 월을 선택해 주세요.');
          const monthKey=`${String(year).padStart(4,'0')}-${String(month).padStart(2,'0')}`;
          if(day){patch.dueDate=`${monthKey}-${day}`;patch.pendingMonth=null;patch.dateUndecided=false;}else{patch.dueDate=null;patch.pendingMonth=monthKey;patch.dateUndecided=true;}
        }
        const effectiveDate=patch.dueDate||before.dueDate;
        if(patch.repeat&&effectiveDate){const [ry,rm,rd]=effectiveDate.split('-').map(Number);if(patch.repeat.type==='weekly')patch.repeat.weekday=new Date(Date.UTC(ry,rm-1,rd)).getUTCDay();if(patch.repeat.type==='monthly')patch.repeat.dayOfMonth=rd;if(patch.repeat.type==='yearly'){patch.repeat.month=rm;patch.repeat.day=rd;}}
      }else{patch.dueTime=null;patch.endTime=null;patch.allDay=false;patch.dateUndecided=false;patch.pendingMonth=null;patch.repeat=null;patch.canceledAt=null;if(before.dateUndecided)patch.dueDate=null;}
      const beforeClass=before.scheduleOnly?'schedule':before.type;
      s.assistant=AssistantUtils.updateAssistantItem(s.assistant,id,patch);
      const after=s.assistant.find(item=>item.id===id);const afterClass=after?.scheduleOnly?'schedule':after?.type;
      if(beforeClass!==afterClass)recordClassificationFeedback(before.sourceText,beforeClass,afterClass);
      projectHub.select(after?.type==='project'?after.title:(after?.projectTitle||before?.projectTitle||projectHub.getActiveKey()));s.editingAssistantId=null;GPA.persist();
    }catch(e){alert(e.message);}
  }
  function toggleClassificationFields(id,value){const fields=$(`edit-schedule-fields-${id}`);if(fields)fields.style.display=value==='schedule'?'contents':'none';}
  function editCard(x){
    const parts=pendingDateParts(x);const classification=x.scheduleOnly?'schedule':x.type;
    const pendingFields=x.scheduleOnly&&x.dateUndecided?`<div class="edit-span"><label>날짜</label><div class="undecided-date-editor" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap"><input id="edit-date-year-${x.id}" data-undecided-date-year="${x.id}" type="number" min="1" max="9999" value="${parts.year}" style="width:96px"><span>년</span><select id="edit-date-month-${x.id}" data-undecided-date-month="${x.id}" style="width:82px">${Array.from({length:12},(_,i)=>{const m=i+1;return `<option value="${m}" ${m===parts.month?'selected':''}>${String(m).padStart(2,'0')}</option>`;}).join('')}</select><span>월</span><select id="edit-date-day-${x.id}" style="width:82px">${dayOptions(parts.year,parts.month,parts.day)}</select><span>일</span></div><small>--일로 저장하면 날짜 미정 일정으로 유지됩니다.</small></div>`:`<div><label>날짜</label><input id="edit-due-${x.id}" type="date" value="${esc(x.dueDate||'')}"></div>`;
    const repeatType=x.repeat?.type||'none';
    const scheduleFields=`<div id="edit-schedule-fields-${x.id}" style="display:${x.scheduleOnly?'contents':'none'}"><div><label>시작 시간</label><input id="edit-time-${x.id}" type="time" value="${esc(x.dueTime||'')}"></div><div><label>종료 시간</label><input id="edit-end-${x.id}" type="time" value="${esc(x.endTime||'')}"></div><div><label>반복</label><select id="edit-repeat-${x.id}"><option value="none" ${repeatType==='none'?'selected':''}>없음</option><option value="daily" ${repeatType==='daily'?'selected':''}>매일</option><option value="weekly" ${repeatType==='weekly'?'selected':''}>매주</option><option value="monthly" ${repeatType==='monthly'?'selected':''}>매월</option><option value="yearly" ${repeatType==='yearly'?'selected':''}>매년</option></select></div><div class="edit-span"><label class="inline-check"><input id="edit-all-day-${x.id}" type="checkbox" ${(x.allDay||!x.dueTime)?'checked':''}> 종일 일정</label></div></div>`;
    return `<div class="item assistant-edit-card" data-assistant-item-id="${x.id}" style="${x.done?'opacity:.68':''}"><div class="edit-grid"><div class="edit-span"><label>내용 / 제목</label><input id="edit-title-${x.id}" value="${esc(x.title||'')}" maxlength="200"></div><div class="edit-span"><label>상세 내용</label><textarea id="edit-details-${x.id}" class="edit-details">${esc(x.details||'')}</textarea></div><div><label>분류</label><select id="edit-classification-${x.id}" data-assistant-classification="${x.id}">${Object.entries(classificationLabels).filter(([v])=>v!=='memo'||classification==='memo').map(([v,l])=>`<option value="${v}" ${classification===v?'selected':''}>${l}</option>`).join('')}</select></div><div><label>중요도</label><select id="edit-priority-${x.id}">${Object.entries(priorityLabels).map(([v,l])=>`<option value="${v}" ${(x.priority||'medium')===v?'selected':''}>${l}</option>`).join('')}</select></div>${pendingFields}${scheduleFields}<div><label>연결 프로젝트</label><input id="edit-project-${x.id}" value="${esc(x.projectTitle||'')}" placeholder="선택 사항"></div></div><div class="actions edit-actions"><button class="small ghost" data-assistant-action="cancel">취소</button><button class="small primary" data-assistant-action="save" data-id="${x.id}">저장</button></div></div>`;
  }
  function viewCard(x){
    const tags=(Array.isArray(x.tags)?x.tags:[]).map(tag=>`<span class="chip tag-chip">#${esc(tag)}</span>`).join('');
    const kindLabel=x.scheduleOnly?(x.dateUndecided?'날짜 미정 일정':'일정'):(typeLabels[x.type]||x.type);
    const pendingChip=x.scheduleOnly&&x.dateUndecided&&x.pendingMonth?`<span class="chip">${esc(x.pendingMonth)} · 날짜 미정</span>`:'';
    const repeatChip=x.scheduleOnly&&x.repeat?.type?`<span class="chip">반복 · ${{daily:'매일',weekly:'매주',monthly:'매월',yearly:'매년'}[x.repeat.type]||esc(x.repeat.type)}</span>`:'';
    const canceledChip=x.scheduleOnly&&x.canceledAt?`<span class="chip">취소됨</span>`:'';
    const actions=x.scheduleOnly?`<button class="small ghost" data-assistant-action="edit" data-id="${x.id}">수정</button><button class="small ghost" data-assistant-action="cancel-schedule" data-id="${x.id}">${x.canceledAt?'취소 복원':'일정 취소'}</button><button class="small ghost danger" data-assistant-action="delete" data-id="${x.id}">삭제</button>`:`<button class="small ghost" data-assistant-action="edit" data-id="${x.id}">수정</button><button class="small ghost assistant-complete-action" data-assistant-action="toggle" data-id="${x.id}">${x.done?'되돌리기':'완료'}</button><button class="small ghost danger" data-assistant-action="delete" data-id="${x.id}">삭제</button>`;
    return `<div class="item" data-assistant-item-id="${x.id}" style="${x.canceledAt?'opacity:.58':''}${x.done?'opacity:.55':''}"><div class="itemrow"><div class="assistant-content"><div class="title" style="${x.canceledAt?'text-decoration:line-through':''}${x.done?'text-decoration:line-through':''}">${esc(x.title)}</div><div class="details">${esc(x.details||'')}</div><div class="meta"><span class="chip">${esc(kindLabel)}</span><span class="chip ${esc(x.priority||'medium')}">${esc(priorityLabels[x.priority||'medium']||x.priority)}</span>${pendingChip}${repeatChip}${canceledChip}${x.dueDate?`<span class="chip">${esc(x.dueDate)}${x.scheduleOnly?(x.allDay||!x.dueTime?' · 종일':x.dueTime?` · ${esc(x.dueTime)}${x.endTime?`~${esc(x.endTime)}`:''}`:''):''}</span>`:''}${x.projectTitle?`<span class="chip">↳ ${esc(x.projectTitle)}</span>`:''}${tags}</div></div><div class="actions">${actions}</div></div></div>`;
  }
  function memoBoardCard(x){
    const tags=(Array.isArray(x.tags)?x.tags:[]).map(tag=>`<span class="chip">#${esc(tag)}</span>`).join('');
    const body=String(x.details||'').trim();
    return `<article class="memo-board-card" data-assistant-item-id="${x.id}" style="${x.done?'opacity:.55':''}"><div class="memo-board-main"><div class="memo-board-title">${esc(x.title)}</div><div class="memo-board-body ${body?'':'empty-body'}">${esc(body||'내용 없음')}</div></div><div class="memo-board-footer"><div class="memo-board-meta">${x.dueDate?`<span class="chip">${esc(x.dueDate)}${x.scheduleOnly?(x.allDay||!x.dueTime?' · 종일':x.dueTime?` · ${esc(x.dueTime)}${x.endTime?`~${esc(x.endTime)}`:''}`:''):''}</span>`:''}${x.projectTitle?`<span class="chip">↳ ${esc(x.projectTitle)}</span>`:''}${tags}</div><div class="actions memo-board-actions"><button class="small ghost" data-assistant-action="edit" data-id="${x.id}">수정</button><button class="small ghost assistant-complete-action" data-assistant-action="toggle" data-id="${x.id}">${x.done?'되돌리기':'완료'}</button><button class="small ghost danger" data-assistant-action="delete" data-id="${x.id}">삭제</button></div></div></article>`;
  }
  function trashTypeLabel(x){if(x.activityOnly)return '활동';if(x.scheduleOnly)return '일정';return typeLabels[x.type]||'항목';}
  function trashCard(x){return `<div class="item trash-item"><div class="itemrow"><div class="assistant-content"><div class="title">${esc(x.title)}</div><div class="meta"><span class="chip">${esc(trashTypeLabel(x))}</span>${x.projectTitle?`<span class="chip">↳ ${esc(x.projectTitle)}</span>`:''}${x.deletedAt?`<span class="chip">삭제 ${esc(String(x.deletedAt).slice(0,16).replace('T',' '))}</span>`:''}</div></div><div class="actions"><button class="small ghost" data-assistant-action="restore" data-id="${x.id}">복구</button><button class="small ghost danger" data-assistant-action="permanent-delete" data-id="${x.id}">영구 삭제</button></div></div></div>`;}

  function setActiveFilter(filter,{preserveTodoMode=false}={}){if(!['todo','memo','project','done','trash'].includes(filter))return;if(filter==='todo'&&!preserveTodoMode)activeTodoMode='todo';activeFilter=filter;s.editingAssistantId=null;if(filter!=='memo')memoComposerOpen=false;projectHub.resetEditor();render();GPA.navigation?.renderActive();}
  function setTodoMode(mode){if(!['todo','schedule'].includes(mode))return;activeTodoMode=mode;s.editingAssistantId=null;projectHub.resetEditor();render();}
  function maybeOpenFilteredItems(filter){setActiveFilter(filter);document.querySelector('.assistant-overview-card')?.scrollIntoView({behavior:'smooth',block:'start'});}
  const projectHub=AssistantProjects.create({GPA,typeLabels,priorityLabels,renderAssistant:()=>render(),toggleItem:toggle,softDeleteItem:softDelete,openFilter:maybeOpenFilteredItems});

  function memoComposer(){return `<div class="memo-detail-editor"><div class="memo-detail-head"><div><div class="memo-detail-eyebrow">NEW MEMO</div><h3>새 메모</h3></div></div><div class="edit-grid"><div class="edit-span"><label>제목</label><input id="memoManualTitle" maxlength="200" placeholder="메모 제목"></div><div class="edit-span"><label>내용</label><textarea id="memoManualDetails" class="edit-details memo-detail-textarea" placeholder="메모 내용을 직접 입력하세요."></textarea></div></div><div class="actions edit-actions"><button type="button" class="small ghost" data-assistant-action="cancel-new-memo">취소</button><button type="button" class="small primary" data-assistant-action="add-memo">메모 저장</button></div></div>`;}
  function formatMemoModifiedAt(x){const raw=AssistantUtils.memoModifiedAt(x);if(!raw)return '수정일 없음';const d=new Date(raw);if(Number.isNaN(d.getTime()))return String(raw).slice(0,16).replace('T',' ');return d.toLocaleString('ko-KR',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});}
  function memoListRow(x){const selected=String(x.id)===String(activeMemoId);const preview=String(x.details||'').trim().replace(/\s+/g,' ');return `<button type="button" class="memo-list-row ${selected?'active':''}" data-memo-select="${esc(x.id)}" data-assistant-item-id="${esc(x.id)}"><div class="memo-list-row-title">${esc(x.title||'제목 없음')}</div>${preview?`<div class="memo-list-row-preview">${esc(preview)}</div>`:''}<div class="memo-list-row-date">${esc(formatMemoModifiedAt(x))}</div></button>`;}
  function memoDetailView(x){if(!x)return `<div class="memo-detail-empty"><b>메모를 선택하세요.</b><span>왼쪽 목록에서 메모를 클릭하면 내용이 여기에 표시됩니다.</span></div>`;if(s.editingAssistantId===x.id)return editCard(x);const tags=(Array.isArray(x.tags)?x.tags:[]).map(tag=>`<span class="chip">#${esc(tag)}</span>`).join('');return `<article class="memo-detail-card" data-assistant-item-id="${esc(x.id)}"><div class="memo-detail-head"><div><div class="memo-detail-eyebrow">MEMO</div><h3>${esc(x.title||'제목 없음')}</h3><div class="memo-detail-date">수정 ${esc(formatMemoModifiedAt(x))}</div></div><div class="actions"><button class="small ghost" data-assistant-action="edit" data-id="${esc(x.id)}">수정</button><button class="small ghost danger" data-assistant-action="delete" data-id="${esc(x.id)}">삭제</button></div></div><div class="memo-detail-body ${String(x.details||'').trim()?'':'empty-body'}">${esc(String(x.details||'').trim()||'내용 없음')}</div>${x.projectTitle||tags?`<div class="memo-detail-meta">${x.projectTitle?`<span class="chip">↳ ${esc(x.projectTitle)}</span>`:''}${tags}</div>`:''}</article>`;}
  function renderMemoSplit(memos){const sorted=AssistantUtils.sortMemosByModifiedAt(memos,memoSortDirection);if(activeMemoId&&!sorted.some(x=>String(x.id)===String(activeMemoId)))activeMemoId=null;if(!activeMemoId&&sorted.length&&!memoComposerOpen)activeMemoId=sorted[0].id;const selected=sorted.find(x=>String(x.id)===String(activeMemoId))||null;const sortLabel=memoSortDirection==='desc'?'최신순 ↓':'오래된순 ↑';return `<div class="memo-split-view"><aside class="memo-list-pane"><div class="memo-list-toolbar"><div><b>메모</b><span>${sorted.length}개</span></div><div class="memo-list-toolbar-actions"><button type="button" class="small ghost" data-memo-sort>${sortLabel}</button><button type="button" class="small primary" data-assistant-action="new-memo">+ 새 메모</button></div></div><div class="memo-list-scroll">${sorted.length?sorted.map(memoListRow).join(''):'<div class="memo-list-empty">메모가 없습니다.</div>'}</div></aside><section class="memo-detail-pane">${memoComposerOpen?memoComposer():memoDetailView(selected)}</section></div>`;}
  function renderPastSchedules(items){if(!items.length)return '';return `<details class="past-schedules" style="margin-top:18px"><summary style="cursor:pointer;font-weight:700">과거 일정 ${items.length}개</summary><div class="list" style="margin-top:10px">${items.map(x=>s.editingAssistantId===x.id?editCard(x):viewCard(x)).join('')}</div></details>`;}
  function renderTrash(items){const controls=items.length?`<div class="trash-toolbar"><div><b>휴지통</b><span>${items.length}개 항목</span></div><button type="button" class="small ghost danger" data-assistant-action="empty-trash">휴지통 비우기</button></div>`:'';$('assistantList').innerHTML=controls+(items.length?items.map(trashCard).join(''):'<div class="empty">휴지통이 비어 있습니다.</div>');}
  function render(){
    const grouped=AssistantUtils.groupAssistantItems(s.assistant,GPA.today());
    const projects=projectHub.getProjects();$('todoKpi').textContent=grouped.counts.todo;$('memoKpi').textContent=grouped.counts.memo;$('projKpi').textContent=projects.length;$('doneKpi').textContent=grouped.counts.done;$('trashKpi').textContent=grouped.counts.trash;
    document.querySelectorAll('[data-assistant-filter]').forEach(tab=>{const selected=tab.dataset.assistantFilter===activeFilter;tab.classList.toggle('active',selected);tab.setAttribute('aria-selected',selected?'true':'false');});const projectMode=activeFilter === 'project';$('assistantListPanel')?.classList.toggle('active',!projectMode);$('assistantProjectHub')?.classList.toggle('active',projectMode);if(projectMode){projectHub.render(projects);return;}
    const todoModeTabs=$('assistantTodoModeTabs');if(todoModeTabs){todoModeTabs.hidden=activeFilter!=='todo';todoModeTabs.querySelectorAll('[data-assistant-item-mode]').forEach(tab=>{const selected=tab.dataset.assistantItemMode===activeTodoMode;tab.classList.toggle('active',selected);tab.setAttribute('aria-selected',selected?'true':'false');});}
    const list=$('assistantList');list.classList.remove('memo-board');list.classList.toggle('memo-split-host',activeFilter==='memo');
    if(activeFilter==='trash'){renderTrash(grouped.trash);return;}
    if(activeFilter==='todo'&&activeTodoMode==='schedule'){
      const parts=typeof CalendarUtils!=='undefined'?CalendarUtils.partitionSchedules(s.assistant,GPA.today()):{upcoming:grouped.schedules.current,undecided:[],past:grouped.schedules.past,canceled:[]};
      const current=[...parts.upcoming,...parts.undecided];const currentHtml=current.length?current.map(x=>s.editingAssistantId===x.id?editCard(x):viewCard(x)).join(''):'<div class="empty">일정 항목이 없습니다.</div>';
      const canceledHtml=parts.canceled.length?`<details class="past-schedules" style="margin-top:18px"><summary style="cursor:pointer;font-weight:700">취소된 일정 ${parts.canceled.length}개</summary><div class="list" style="margin-top:10px">${parts.canceled.map(x=>s.editingAssistantId===x.id?editCard(x):viewCard(x)).join('')}</div></details>`:'';
      list.innerHTML=currentHtml+renderPastSchedules(parts.past)+canceledHtml;return;
    }
    let visible;
    if(activeFilter==='todo')visible=grouped.todoList;
    else if(activeFilter==='memo')visible=grouped.memo;
    else if(activeFilter==='done')visible=grouped.done;
    else visible=AssistantUtils.filterAssistantItems(s.assistant,activeFilter);
    const emptyLabel=filterLabels[activeFilter];
    if(activeFilter==='memo'){list.innerHTML=renderMemoSplit(visible);return;}
    list.innerHTML=visible.length?visible.map(x=>s.editingAssistantId===x.id?editCard(x):viewCard(x)).join(''):`<div class="empty">${esc(emptyLabel)} 항목이 없습니다.</div>`;
  }
  function bind(){
    $('analyzeInbox').addEventListener('click',analyzeInbox);$('inboxText').addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){e.preventDefault();analyzeInbox();}});document.querySelector('.assistant-filter-tabs')?.addEventListener('click',e=>{const tab=e.target.closest('[data-assistant-filter]');if(tab)setActiveFilter(tab.dataset.assistantFilter);});$('assistantTodoModeTabs')?.addEventListener('click',e=>{const tab=e.target.closest('[data-assistant-item-mode]');if(tab)setTodoMode(tab.dataset.assistantItemMode);});
    $('assistantList').addEventListener('click',e=>{const memoSelect=e.target.closest('[data-memo-select]');if(memoSelect){activeMemoId=memoSelect.dataset.memoSelect;memoComposerOpen=false;s.editingAssistantId=null;render();return;}const sortButton=e.target.closest('[data-memo-sort]');if(sortButton){memoSortDirection=memoSortDirection==='desc'?'asc':'desc';render();return;}const b=e.target.closest('button[data-assistant-action]');if(!b)return;const id=b.dataset.id;switch(b.dataset.assistantAction){case'edit':activeMemoId=id||activeMemoId;memoComposerOpen=false;startEdit(id);break;case'toggle':toggle(id);break;case'cancel-schedule':cancelSchedule(id);break;case'delete':softDelete(id);break;case'save':saveEdit(id);break;case'cancel':cancelEdit();break;case'restore':restore(id);break;case'permanent-delete':permanentDelete(id);break;case'empty-trash':emptyTrash();break;case'new-memo':memoComposerOpen=true;activeMemoId=null;s.editingAssistantId=null;render();requestAnimationFrame(()=>$('memoManualTitle')?.focus());break;case'cancel-new-memo':memoComposerOpen=false;render();break;case'add-memo':addManualMemo();break;}});
    $('assistantList').addEventListener('change',e=>{const classification=e.target.closest('[data-assistant-classification]');if(classification)toggleClassificationFields(classification.dataset.assistantClassification,classification.value);const year=e.target.closest('[data-undecided-date-year]');const month=e.target.closest('[data-undecided-date-month]');const id=year?.dataset.undecidedDateYear||month?.dataset.undecidedDateMonth;if(id)updatePendingDayOptions(id);});
    $('resetClassificationLearning')?.addEventListener('click',resetClassificationLearning);
    $('resetAssistantData')?.addEventListener('click',resetAssistantData);
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
    else{if(item.type==='memo')activeMemoId=item.id;setActiveFilter(item.type==='memo'?'memo':'todo');}
    scrollToAssistantItem(id);return true;
  }
  GPA.assistant={render,bind,openFilter,openProject,openItem,getActiveFilter:()=>activeFilter};
})(window);
