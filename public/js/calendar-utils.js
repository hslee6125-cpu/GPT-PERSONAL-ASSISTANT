(function(root,factory){
  const api=factory();
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(root)root.CalendarUtils=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const dateRe=/^\d{4}-\d{2}-\d{2}$/;
  const monthRe=/^\d{4}-\d{2}$/;
  function pad(n){return String(n).padStart(2,'0');}
  function parseMonth(value){if(!monthRe.test(String(value||'')))return null;const [y,m]=value.split('-').map(Number);if(m<1||m>12)return null;return{y,m};}
  function parseDate(value){if(!dateRe.test(String(value||'')))return null;const [y,m,d]=value.split('-').map(Number);const dt=new Date(y,m-1,d);if(dt.getFullYear()!==y||dt.getMonth()!==m-1||dt.getDate()!==d)return null;return{y,m,d};}
  function formatDate(y,m,d){return`${y}-${pad(m)}-${pad(d)}`;}
  function monthKey(dateString){const p=parseDate(dateString);return p?`${p.y}-${pad(p.m)}`:null;}
  function shiftMonth(monthString,delta){const p=parseMonth(monthString);if(!p)return null;const dt=new Date(p.y,p.m-1+Number(delta||0),1);return`${dt.getFullYear()}-${pad(dt.getMonth()+1)}`;}
  function buildMonthGrid(monthString){const p=parseMonth(monthString);if(!p)throw new Error('월 형식이 올바르지 않습니다.');const first=new Date(p.y,p.m-1,1);const start=new Date(p.y,p.m-1,1-first.getDay());const cells=[];for(let i=0;i<42;i++){const dt=new Date(start.getFullYear(),start.getMonth(),start.getDate()+i);const date=formatDate(dt.getFullYear(),dt.getMonth()+1,dt.getDate());cells.push({date,inMonth:dt.getFullYear()===p.y&&dt.getMonth()+1===p.m});}return cells;}

  function addDays(dateString,delta){const p=parseDate(dateString);if(!p)return null;const dt=new Date(p.y,p.m-1,p.d+Number(delta||0));return formatDate(dt.getFullYear(),dt.getMonth()+1,dt.getDate());}
  function weekStart(dateString){const p=parseDate(dateString);if(!p)return null;const dt=new Date(p.y,p.m-1,p.d);return addDays(dateString,-dt.getDay());}
  function buildWeekDays(dateString){const start=weekStart(dateString);if(!start)throw new Error('날짜 형식이 올바르지 않습니다.');return Array.from({length:7},(_,i)=>addDays(start,i));}
  function timeToMinutes(value){const m=String(value||'').match(/^([01]\d|2[0-3]):([0-5]\d)$/);return m?Number(m[1])*60+Number(m[2]):null;}
  function minutesToTime(value){const n=Math.max(0,Math.min(1439,Math.round(Number(value)||0)));return`${pad(Math.floor(n/60))}:${pad(n%60)}`;}
  function normalizeScheduleRange(item={}){const start=timeToMinutes(item.dueTime);if(start===null)return null;const explicitEnd=timeToMinutes(item.endTime);const end=explicitEnd!==null&&explicitEnd>start?explicitEnd:Math.min(1440,start+60);return{start,end,duration:Math.max(15,end-start)};}
  function snapMinutes(value,step=15){const size=Math.max(1,Number(step)||15);return Math.max(0,Math.min(1439,Math.round((Number(value)||0)/size)*size));}
  function moveScheduleSlot(item,targetDate,targetMinutes){const range=normalizeScheduleRange(item)||{start:0,end:60,duration:60};const start=snapMinutes(targetMinutes,15);const maxStart=Math.max(0,1440-range.duration);const safeStart=Math.min(start,maxStart);return{dueDate:targetDate,dueTime:minutesToTime(safeStart),endTime:minutesToTime(safeStart+range.duration),allDay:false};}

  function entrySort(a,b){return String(a.date||'').localeCompare(String(b.date||''))||String(a.time||'99:99').localeCompare(String(b.time||'99:99'))||String(a.title||'').localeCompare(String(b.title||''),'ko');}
  function buildCalendarEntries({assistant=[],cooking=[]}={}){
    const out=[];
    for(const item of Array.isArray(assistant)?assistant:[]){
      if(!item||item.deletedAt||!parseDate(item.dueDate))continue;
      if(item.scheduleOnly)out.push({id:String(item.id),source:'assistant',kind:'schedule',title:String(item.title||''),date:item.dueDate,time:item.dueTime||null,endTime:item.endTime||null,allDay:Boolean(item.allDay),projectTitle:item.projectTitle||null,done:Boolean(item.done)});
      else if(item.type==='todo')out.push({id:String(item.id),source:'assistant',kind:'todo',title:String(item.title||''),date:item.dueDate,time:null,projectTitle:item.projectTitle||null,done:Boolean(item.done)});
    }
    for(const item of Array.isArray(cooking)?cooking:[]){if(!item||!parseDate(item.date))continue;out.push({id:String(item.id),source:'cooking',kind:'cooking',title:String(item.name||'요리 프로젝트'),date:item.date,time:item.time||null,projectTitle:null,done:false});}
    return out.sort(entrySort);
  }
  function entriesForDate(entries,date){return (Array.isArray(entries)?entries:[]).filter(x=>x?.date===date).sort(entrySort);}
  function buildDayPreview(entries,date,limit=3){const items=entriesForDate(entries,date);const count=Math.max(0,Number(limit)||0);return{visible:items.slice(0,count),overflow:Math.max(0,items.length-count)};}
  function buildCalendarSummaries({assistant=[],cooking=[],today}={}){
    if(!parseDate(today))throw new Error('오늘 날짜 형식이 올바르지 않습니다.');
    const entries=buildCalendarEntries({assistant,cooking}).filter(x=>x.date>today);
    return{
      schedules:entries.filter(x=>x.kind==='schedule').slice(0,6),
      todos:entries.filter(x=>x.kind==='todo'&&!x.done).slice(0,6),
      projects:entries.filter(x=>x.kind==='cooking'||Boolean(x.projectTitle)).slice(0,6)
    };
  }
  return{monthKey,shiftMonth,buildMonthGrid,buildCalendarEntries,entriesForDate,buildDayPreview,buildCalendarSummaries,addDays,weekStart,buildWeekDays,timeToMinutes,minutesToTime,normalizeScheduleRange,snapMinutes,moveScheduleSlot};
});
