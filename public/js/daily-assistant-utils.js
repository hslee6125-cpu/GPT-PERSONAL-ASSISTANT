(function(root,factory){
  const nodeCalendar=typeof require==='function'?(()=>{try{return require('./calendar-utils.js');}catch{return null;}})():null;
  const api=factory(root?.CalendarUtils,nodeCalendar);
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(root)root.DailyAssistantUtils=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(browserCalendarUtils,nodeCalendarUtils){
  const CU=browserCalendarUtils||nodeCalendarUtils;
  if(!CU)throw new Error('CalendarUtils가 필요합니다.');
  const pad=n=>String(n).padStart(2,'0');
  const validTime=v=>/^([01]\d|2[0-3]):[0-5]\d$/.test(String(v||''));
  const toMinutes=v=>validTime(v)?Number(String(v).slice(0,2))*60+Number(String(v).slice(3,5)):null;
  const fromMinutes=n=>`${pad(Math.floor(n/60))}:${pad(n%60)}`;
  const itemTime=item=>validTime(item?.dueTime)?item.dueTime:'99:99';
  const sortItems=(a,b)=>String(a?.dueDate||'9999-99-99').localeCompare(String(b?.dueDate||'9999-99-99'))||itemTime(a).localeCompare(itemTime(b))||String(a?.title||'').localeCompare(String(b?.title||''),'ko');
  const isTodo=item=>item&&item.type==='todo'&&!item.scheduleOnly&&!item.deletedAt;
  const datePart=value=>{const raw=String(value||'');const d=new Date(raw);if(!Number.isNaN(d.getTime())){const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(d);const get=t=>parts.find(x=>x.type===t)?.value;const y=get('year'),m=get('month'),day=get('day');if(y&&m&&day)return`${y}-${m}-${day}`;}const match=raw.match(/^(\d{4}-\d{2}-\d{2})/);return match?match[1]:null;};
  function dayDiff(a,b){
    const av=CU.validDate(a),bv=CU.validDate(b);if(!av||!bv)return 0;
    const [ay,am,ad]=av.split('-').map(Number),[by,bm,bd]=bv.split('-').map(Number);
    return Math.round((Date.UTC(by,bm-1,bd)-Date.UTC(ay,am-1,ad))/86400000);
  }
  function normalizeNow(now){
    if(validTime(now))return String(now);
    if(now instanceof Date&&!Number.isNaN(now.getTime()))return `${pad(now.getHours())}:${pad(now.getMinutes())}`;
    const parsed=new Date(now||Date.now());
    if(!Number.isNaN(parsed.getTime()))return `${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`;
    return'00:00';
  }
  function dayPartForTime(value){
    const time=normalizeNow(value),minutes=toMinutes(time);
    if(minutes==null)return'evening';
    if(minutes>=390&&minutes<=720)return'morning';
    if(minutes>=721&&minutes<=1110)return'afternoon';
    return'evening';
  }
  function greetingForTime(value){
    const part=dayPartForTime(value);
    if(part==='morning')return'좋은 아침입니다.';
    if(part==='afternoon')return'좋은 오후입니다.';
    return'좋은 저녁입니다.';
  }
  function openWindows(schedules,nowTime,{dayStart='05:00',dayEnd='22:00',minimumMinutes=45}={}){
    const start=Math.max(toMinutes(dayStart),toMinutes(nowTime)??0),end=toMinutes(dayEnd);
    if(start==null||end==null||start>=end)return[];
    const busy=[];
    for(const item of schedules){
      if(item?.allDay)continue;
      const s=toMinutes(item?.dueTime);if(s==null)continue;
      const e=toMinutes(item?.endTime)??Math.min(s+60,24*60);
      if(e<=start||s>=end)continue;
      busy.push([Math.max(s,start),Math.min(Math.max(e,s+1),end)]);
    }
    busy.sort((a,b)=>a[0]-b[0]);
    const merged=[];
    for(const span of busy){const last=merged[merged.length-1];if(last&&span[0]<=last[1])last[1]=Math.max(last[1],span[1]);else merged.push([...span]);}
    const out=[];let cursor=start;
    for(const [s,e] of merged){if(s-cursor>=minimumMinutes)out.push({start:fromMinutes(cursor),end:fromMinutes(s),minutes:s-cursor});cursor=Math.max(cursor,e);}
    if(end-cursor>=minimumMinutes)out.push({start:fromMinutes(cursor),end:fromMinutes(end),minutes:end-cursor});
    return out;
  }
  function buildDailyContext({assistant=[],today,now}={}){
    const day=CU.validDate(today);if(!day)throw new Error('오늘 날짜 형식이 올바르지 않습니다.');
    const tomorrow=CU.addDays(day,1),nowTime=normalizeNow(now),nowMin=toMinutes(nowTime)??0;
    const source=Array.isArray(assistant)?assistant:[];
    const active=source.filter(item=>item&&!item.deletedAt);
    let todaySchedules=[],tomorrowSchedules=[];
    try{todaySchedules=CU.expandSchedules(active,day,day).sort(sortItems);}catch{todaySchedules=[];}
    try{tomorrowSchedules=CU.expandSchedules(active,tomorrow,tomorrow).sort(sortItems);}catch{tomorrowSchedules=[];}
    const todayTodos=active.filter(item=>isTodo(item)&&!item.done&&item.dueDate===day).sort(sortItems);
    const overdueTodos=active.filter(item=>isTodo(item)&&!item.done&&CU.validDate(item.dueDate)&&item.dueDate<day).sort(sortItems).map(item=>({...item,overdueDays:dayDiff(item.dueDate,day)}));
    const completedToday=active.filter(item=>isTodo(item)&&item.done&&datePart(item.updatedAt)===day).sort(sortItems);
    const timedToday=todaySchedules.filter(item=>!item.allDay&&validTime(item.dueTime));
    const nextSchedule=timedToday.find(item=>(toMinutes(item.dueTime)??-1)>=nowMin)||null;
    const tomorrowFirstSchedule=tomorrowSchedules.find(item=>validTime(item.dueTime))||tomorrowSchedules[0]||null;
    const passedSchedules=timedToday.filter(item=>{
      const start=toMinutes(item.dueTime),end=toMinutes(item.endTime);
      return(end??start??9999)<=nowMin;
    });
    const review={
      completedTodos:completedToday.length,
      unfinishedTodos:todayTodos.length,
      passedSchedules:passedSchedules.length,
      tomorrowFirstSchedule
    };
    return{
      today:day,tomorrow,nowTime,
      todaySchedules,todayTodos,overdueTodos,completedToday,
      nextSchedule,tomorrowFirstSchedule,
      openTimeWindows:openWindows(todaySchedules,nowTime),
      review,
      metrics:{
        todaySchedules:todaySchedules.length,
        todayTodos:todayTodos.length,
        important:todayTodos.filter(item=>item.priority==='high').length+overdueTodos.filter(item=>item.priority==='high').length,
        unresolved:overdueTodos.length
      }
    };
  }
  function timePhrase(item){if(!item)return'';if(item.allDay)return'종일';return validTime(item.dueTime)?item.dueTime:'시간 미정';}
  function buildFallbackBrief(context,mode='day'){
    const c=context||{};
    if(mode==='review'){
      const out=[`오늘 완료한 할 일은 ${Number(c.review?.completedTodos||0)}개이고, 미완료 할 일은 ${Number(c.review?.unfinishedTodos||0)}개입니다.`];
      out.push(`오늘 지나간 시간 지정 일정은 ${Number(c.review?.passedSchedules||0)}개입니다.`);
      if(c.tomorrowFirstSchedule)out.push(`내일 첫 일정은 ${timePhrase(c.tomorrowFirstSchedule)} ${String(c.tomorrowFirstSchedule.title||'일정')}입니다.`);
      else out.push('내일 예정된 일정은 없습니다.');
      return out.slice(0,3);
    }
    const out=[];
    if(c.nextSchedule)out.push(`다음 일정은 ${timePhrase(c.nextSchedule)} ${String(c.nextSchedule.title||'일정')}입니다.`);
    else if(Number(c.metrics?.todaySchedules||0)>0)out.push(`오늘 일정은 ${Number(c.metrics.todaySchedules)}개이며, 남은 시간 지정 일정은 없습니다.`);
    else out.push('오늘 등록된 일정은 없습니다.');
    if(Number(c.metrics?.todayTodos||0)>0)out.push(`오늘 마감인 할 일이 ${Number(c.metrics.todayTodos)}개 있습니다.`);
    else out.push('오늘 마감인 할 일은 없습니다.');
    if(Number(c.metrics?.important||0)>0)out.push(`중요도가 높은 할 일은 ${Number(c.metrics.important)}개 있습니다.`);
    if(Number(c.metrics?.unresolved||0)>0)out.push(`기한이 지난 미처리 할 일이 ${Number(c.metrics.unresolved)}개 있습니다.`);
    if(Array.isArray(c.openTimeWindows)&&c.openTimeWindows.length){const w=c.openTimeWindows[0];out.push(`${w.start}부터 ${w.end}까지 비교적 여유 있는 시간이 있습니다.`);}
    return out.slice(0,4);
  }
  function contextSignature(context,mode='day'){
    const c=context||{};
    const compact={
      mode,today:c.today,nowTime:c.nowTime,
      metrics:c.metrics,
      schedules:(c.todaySchedules||[]).map(x=>[x.occurrenceOf||x.id,x.dueDate,x.dueTime,x.endTime,x.title]),
      todos:(c.todayTodos||[]).map(x=>[x.id,x.dueDate,x.dueTime,x.priority,x.title]),
      overdue:(c.overdueTodos||[]).map(x=>[x.id,x.dueDate,x.dueTime,x.priority,x.title]),
      completed:(c.completedToday||[]).map(x=>[x.id,x.updatedAt]),
      tomorrow:c.tomorrowFirstSchedule?[c.tomorrowFirstSchedule.occurrenceOf||c.tomorrowFirstSchedule.id,c.tomorrowFirstSchedule.dueDate,c.tomorrowFirstSchedule.dueTime,c.tomorrowFirstSchedule.title]:null
    };
    return JSON.stringify(compact);
  }
  return{buildDailyContext,buildFallbackBrief,contextSignature,dayPartForTime,greetingForTime};
});
