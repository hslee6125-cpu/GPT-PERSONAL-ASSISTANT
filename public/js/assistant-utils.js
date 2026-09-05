(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.AssistantUtils = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const TYPES = new Set(['todo', 'memo', 'project']);
  const PRIORITIES = new Set(['high', 'medium', 'low']);

  function normalizeOptional(value) {
    const text = String(value ?? '').trim();
    return text || null;
  }
  function normalizeDueDate(value) {
    const text = String(value ?? '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
    const [year, month, day] = text.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? text : null;
  }
  function normalizeDueMonth(value) {
    const text = String(value ?? '').trim();
    if (!/^\d{4}-\d{2}$/.test(text)) return null;
    const [year, month] = text.split('-').map(Number);
    return year >= 1 && month >= 1 && month <= 12 ? text : null;
  }
  function normalizeDueTime(value) {
    const text = String(value ?? '').trim();
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(text)) return null;
    return text;
  }
  function normalizeTags(value) {
    const tags = Array.isArray(value) ? value : [];
    return [...new Set(tags.map(tag => String(tag ?? '').trim()).filter(Boolean))];
  }

  function addDays(dateString, amount) {
    const date = normalizeDueDate(dateString);
    if (!date) return null;
    const [year, month, day] = date.split('-').map(Number);
    const next = new Date(Date.UTC(year, month - 1, day + Number(amount || 0)));
    return `${next.getUTCFullYear()}-${String(next.getUTCMonth()+1).padStart(2,'0')}-${String(next.getUTCDate()).padStart(2,'0')}`;
  }
  function stripTrailingSaveVerb(value) {
    return String(value ?? '').replace(/\s*(?:추가해(?:줘)?|추가|등록해(?:줘)?|등록|저장해(?:줘)?|저장)\s*[.!?]?$/,'').trim();
  }
  function parseClock(hourValue, minuteValue=0, meridiem='') {
    let hour = Number(hourValue);
    const minute = Number(minuteValue || 0);
    if (!Number.isInteger(hour) || !Number.isInteger(minute) || minute < 0 || minute > 59) return null;
    if (meridiem) {
      if (hour < 1 || hour > 12) return null;
      if (meridiem === '오전' && hour === 12) hour = 0;
      if (meridiem === '오후' && hour !== 12) hour += 12;
    } else if (hour < 0 || hour > 23) return null;
    return `${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}`;
  }
  function naturalDaypartMeridiem(value) {
    const part=String(value||'').trim();
    if(part==='오전'||part==='아침')return '오전';
    if(part==='오후'||part==='저녁'||part==='밤'||part==='점심')return '오후';
    return '';
  }
  function parseCompactClock(value) {
    const text=String(value||'');
    if(!/^\d{4}$/.test(text))return null;
    return parseClock(Number(text.slice(0,2)),Number(text.slice(2)), '');
  }
  function parseScheduleBody(value) {
    let body = String(value ?? '').trim();
    if (!body) return null;
    let dueTime = null, endTime = null;

    const rangeParsers = [
      {pattern:/(?:^|\s)(\d{4})\s*[-~]\s*(\d{4})(?=\s|$)/, parse:m=>[parseCompactClock(m[1]),parseCompactClock(m[2])]},
      {pattern:/(?:^|\s)(오전|오후)?\s*(\d{1,2}):(\d{2})\s*[-~]\s*(?:(오전|오후)\s*)?(\d{1,2}):(\d{2})(?=\s|$)/, parse:m=>{const first=m[1]||'';return[parseClock(m[2],m[3],first),parseClock(m[5],m[6],m[4]||first)];}},
      {pattern:/(?:^|\s)(오전|오후)?\s*(\d{1,2})시(?:\s*(\d{1,2})분)?\s*[-~]\s*(?:(오전|오후)\s*)?(\d{1,2})시(?:\s*(\d{1,2})분)?(?:에)?(?=\s|$)/, parse:m=>{const first=m[1]||'';return[parseClock(m[2],m[3]||0,first),parseClock(m[5],m[6]||0,m[4]||first)];}}
    ];
    for(const {pattern,parse} of rangeParsers){
      const match=body.match(pattern);
      if(!match)continue;
      const [start,end]=parse(match);
      if(!start||!end||end<=start)continue;
      dueTime=start;endTime=end;
      body=`${body.slice(0,match.index)} ${body.slice(match.index+match[0].length)}`.replace(/\s+/g,' ').trim();
      break;
    }

    if(!dueTime){
      const patterns = [
        /(?:^|\s)(오전|오후)?\s*(\d{1,2}):(\d{2})(?=\s|$)/,
        /(?:^|\s)(오전|오후)?\s*(\d{1,2})시(?:\s*(\d{1,2})분)?(?:에)?(?=\s|$)/
      ];
      for (const pattern of patterns) {
        const match = body.match(pattern);
        if (!match) continue;
        const parsed=parseClock(match[2],match[3]||0,match[1]||'');
        if(!parsed)continue;
        dueTime=parsed;
        body = `${body.slice(0, match.index)} ${body.slice(match.index + match[0].length)}`.replace(/\s+/g,' ').trim();
        break;
      }
    }
    body = stripTrailingSaveVerb(body);
    return body ? {title:body,dueTime,endTime} : null;
  }


  const WEEKDAYS = {일요일:0,월요일:1,화요일:2,수요일:3,목요일:4,금요일:5,토요일:6};
  const SCHEDULE_KEYWORDS = ['약속','미팅','회의','예약','진료','상담','식사','점심','저녁','면접','수업','미용실','공연','비행기','기차'];
  const TODO_KEYWORDS = ['해야','하기','구매','신청','정리','준비','확인','보내기','전화하기','예약하기','제출','결제','갱신','작성','잡기'];

  function parseSupportedRecurrence(text) {
    const source=String(text||'').trim();
    if(!source)return null;
    if(/(?:격주|매\s*\d+\s*(?:일|주|개월|달|년)\s*마다|\d+\s*(?:일|주|개월|달|년)\s*마다|매월\s*(?:첫째|둘째|셋째|넷째|마지막)|평일마다)/.test(source))return null;
    if(/(?:^|\s|,)매일(?=\s|,|$)/.test(source))return {type:'daily',interval:1};
    const weekly=source.match(/(?:^|\s|,)매주(?:\s+(일요일|월요일|화요일|수요일|목요일|금요일|토요일))?(?=\s|,|$)/);
    if(weekly)return {type:'weekly',interval:1,weekday:weekly[1]?WEEKDAYS[weekly[1]]:null};
    const monthly=source.match(/(?:^|\s|,)(?:매월|매달)(?:\s+(\d{1,2})일)?(?=\s|,|$)/);
    if(monthly)return {type:'monthly',interval:1,dayOfMonth:monthly[1]?Number(monthly[1]):null};
    const yearly=source.match(/(?:^|\s|,)매년(?:\s+(\d{1,2})월\s*(\d{1,2})일)?(?=\s|,|$)/);
    if(yearly)return {type:'yearly',interval:1,month:yearly[1]?Number(yearly[1]):null,day:yearly[2]?Number(yearly[2]):null};
    return null;
  }
  function detectUnsupportedRecurrence(text) {
    const source=String(text||'').trim();
    if(!source||parseSupportedRecurrence(source))return null;
    const match=source.match(/(?:격주|매월\s*(?:첫째|둘째|셋째|넷째|마지막)|평일마다|매\s*\d+\s*(?:일|주|개월|달|년)\s*마다|\d+\s*(?:일|주|개월|달|년)\s*마다)/);
    return match ? { token:match[0], error:'이 반복 규칙은 아직 지원하지 않습니다. 매일/매주/매월/매년 형식으로 입력해 주세요.' } : null;
  }
  function hasExplicitMultipleIntent(text){
    const source=String(text||'');
    return /(?:\n|,|그리고|또\s|\s및\s|\s하고\s)/.test(source);
  }
  function titleTokens(value){
    return String(value||'').toLowerCase().replace(/[^0-9a-z가-힣\s]/g,' ').split(/\s+/).filter(Boolean);
  }
  function titleSimilarity(a,b){
    const A=new Set(titleTokens(a)),B=new Set(titleTokens(b));
    if(!A.size||!B.size)return 0;
    let inter=0;for(const t of A)if(B.has(t))inter++;
    return inter/Math.min(A.size,B.size);
  }

  function weekdayDate(today, weekday, weekOffset=null) {
    const base = normalizeDueDate(today);
    if (!base || !Number.isInteger(weekday)) return null;
    const [y,m,d]=base.split('-').map(Number);
    const date=new Date(Date.UTC(y,m-1,d));
    const current=date.getUTCDay();
    let diff;
    if (weekOffset === 1) {
      const mondayOffset=(current+6)%7;
      const targetOffset=(weekday+6)%7;
      diff=(7-mondayOffset)+targetOffset;
    } else if (weekOffset === 0) {
      const mondayOffset=(current+6)%7;
      const targetOffset=(weekday+6)%7;
      diff=targetOffset-mondayOffset;
    } else {
      diff=(weekday-current+7)%7;
      if(diff===0) diff=7;
    }
    return addDays(base,diff);
  }
  function resolveNaturalDate(text,today) {
    const source=String(text||'');
    const base=normalizeDueDate(today);
    if(!base)return null;
    if(/오늘/.test(source))return base;
    if(/내일/.test(source))return addDays(base,1);
    if(/모레/.test(source))return addDays(base,2);
    const explicit=source.match(/(?:(\d{4})년\s*)?(\d{1,2})월\s*(\d{1,2})일/);
    if(explicit){
      const year=explicit[1]?Number(explicit[1]):Number(base.slice(0,4));
      const month=Number(explicit[2]),day=Number(explicit[3]);
      return isValidCalendarDate(year,month,day)?formatDateParts(year,month,day):null;
    }
    const weekdayMatch=source.match(/(?:(이번주|다음주)\s*)?(일요일|월요일|화요일|수요일|목요일|금요일|토요일)/);
    if(weekdayMatch){
      const week=weekdayMatch[1]==='다음주'?1:weekdayMatch[1]==='이번주'?0:null;
      return weekdayDate(base,WEEKDAYS[weekdayMatch[2]],week);
    }
    return null;
  }
  function extractNaturalTemporalSignals(text,today) {
    const source=String(text||'').trim();
    const dueDate=resolveNaturalDate(source,today);
    let dueTime=null,endTime=null,timeRange=false;
    const range=source.match(/(오전|오후|아침|점심|저녁|밤)?\s*(\d{1,2})시?(?:\s*(\d{1,2})분)?\s*(?:부터|에서)\s*(?:(오전|오후|아침|점심|저녁|밤)\s*)?(\d{1,2})시?(?:\s*(\d{1,2})분)?\s*까지/);
    if(range){
      const first=naturalDaypartMeridiem(range[1]);
      dueTime=parseClock(range[2],range[3]||0,first);
      endTime=parseClock(range[5],range[6]||0,naturalDaypartMeridiem(range[4])||first);
      if(dueTime&&endTime&&endTime>dueTime)timeRange=true;else{dueTime=null;endTime=null;}
    }
    if(!dueTime){
      const single=source.match(/(오전|오후|아침|점심|저녁|밤)\s*(\d{1,2})시(?:\s*(\d{1,2})분)?/);
      if(single)dueTime=parseClock(single[2],single[3]||0,naturalDaypartMeridiem(single[1]));
    }
    const deadline=!timeRange && /까지/.test(source) && Boolean(dueDate || dueTime);
    const scheduleKeywords=SCHEDULE_KEYWORDS.filter(k=>source.includes(k));
    const todoKeywords=TODO_KEYWORDS.filter(k=>source.includes(k));
    return {dueDate,dueTime,endTime,timeRange,deadline,hasDate:Boolean(dueDate),hasTime:Boolean(dueTime),scheduleKeywords,todoKeywords};
  }
  function analyzeNaturalInput(text,today) {
    const source=String(text||'').trim();
    return {
      source,
      recurrence:detectUnsupportedRecurrence(source),
      repeat:parseSupportedRecurrence(source),
      multipleIntent:hasExplicitMultipleIntent(source),
      temporal:extractNaturalTemporalSignals(source,today)
    };
  }
  function feedbackFeatures(text) {
    const source=String(text||'');
    const keywords=[...new Set([...SCHEDULE_KEYWORDS,...TODO_KEYWORDS].filter(k=>source.includes(k)))];
    return {keywords};
  }
  function createClassificationFeedback(sourceText,from,to,createdAt=new Date().toISOString()) {
    return {sourceText:String(sourceText||'').trim(),from:String(from||''),to:String(to||''),features:feedbackFeatures(sourceText),createdAt:String(createdAt)};
  }
  function feedbackScore(text,feedback) {
    const source=String(text||'');
    let score=0;
    for(const entry of Array.isArray(feedback)?feedback:[]){
      if(!entry||!['todo','schedule'].includes(entry.to)||!['todo','schedule'].includes(entry.from)||entry.to===entry.from)continue;
      const keys=Array.isArray(entry.features?.keywords)?entry.features.keywords:feedbackFeatures(entry.sourceText).keywords;
      const matches=keys.filter(k=>source.includes(k)).length;
      if(!matches)continue;
      score += (entry.to==='schedule'?1:-1) * Math.min(5,matches*5);
    }
    return score;
  }

  function recurrenceStartDate(repeat,today,resolvedDate=null){
    const base=normalizeDueDate(today);if(!base||!repeat)return resolvedDate||base;
    if(repeat.type==='daily')return base;
    if(repeat.type==='weekly')return resolvedDate||base;
    if(repeat.type==='monthly'&&repeat.dayOfMonth){
      const [y,m,d]=base.split('-').map(Number),target=Number(repeat.dayOfMonth);
      const candidate=formatDateParts(y,m,target);if(isValidCalendarDate(y,m,target)&&candidate>=base)return candidate;
      const next=new Date(Date.UTC(y,m,1)),ny=next.getUTCFullYear(),nm=next.getUTCMonth()+1;
      return isValidCalendarDate(ny,nm,target)?formatDateParts(ny,nm,target):base;
    }
    if(repeat.type==='yearly'&&repeat.month&&repeat.day){
      const y=Number(base.slice(0,4)),candidate=formatDateParts(y,repeat.month,repeat.day);
      if(isValidCalendarDate(y,repeat.month,repeat.day)&&candidate>=base)return candidate;
      return isValidCalendarDate(y+1,repeat.month,repeat.day)?formatDateParts(y+1,repeat.month,repeat.day):base;
    }
    return resolvedDate||base;
  }

  function refineNaturalInboxItem(item,sourceText,today,feedback=[],analysis=null) {
    const normalized=normalizeInboxItem({...item,sourceText});
    if(!normalized)return null;
    const source=String(sourceText||'').trim();
    if(!source)return normalized;
    const inputAnalysis=analysis||analyzeNaturalInput(source,today);
    const sig=inputAnalysis.temporal;
    const strongTodo=sig.todoKeywords.some(k=>['준비','하기','구매','신청','정리','확인','보내기','전화하기','예약하기','제출','결제','갱신','작성','잡기'].includes(k));
    const strongSchedule=Boolean(inputAnalysis.repeat) || sig.timeRange || (sig.hasDate&&sig.hasTime&&!sig.deadline);
    let schedule=Boolean(normalized.scheduleOnly);
    if(sig.deadline)schedule=false;
    else if(strongSchedule)schedule=true;
    else if(strongTodo)schedule=false;
    else {
      let score=0;
      if(sig.hasDate)score+=10;
      score+=sig.scheduleKeywords.length*20;
      score-=sig.todoKeywords.length*20;
      score+=feedbackScore(source,feedback);
      if(score>=20)schedule=true;
      else if(score<=-20)schedule=false;
    }
    if((sig.deadline||strongTodo)&&normalized.type==='memo')normalized.type='todo';
    normalized.sourceText=source;
    if(sig.dueDate){
      if(!inputAnalysis.multipleIntent||!normalized.dueDate)normalized.dueDate=sig.dueDate;
    }
    if(schedule){
      normalized.type='todo';normalized.scheduleOnly=true;
      normalized.dueTime=sig.dueTime||normalized.dueTime||null;
      normalized.endTime=sig.endTime||normalized.endTime||null;
      normalized.allDay=!normalized.dueTime;
      if(inputAnalysis.repeat){
        const repeat={...inputAnalysis.repeat};
        const date=normalized.dueDate||sig.dueDate||today;
        if(repeat.type==='weekly'&&repeat.weekday==null&&date){const [y,m,d]=String(date).split('-').map(Number);repeat.weekday=new Date(Date.UTC(y,m-1,d)).getUTCDay();}
        if(repeat.type==='monthly'&&!repeat.dayOfMonth&&date)repeat.dayOfMonth=Number(String(date).slice(8,10));
        if(repeat.type==='yearly'&&(!repeat.month||!repeat.day)&&date){repeat.month=Number(String(date).slice(5,7));repeat.day=Number(String(date).slice(8,10));}
        normalized.repeat=repeat;
        normalized.dueDate=recurrenceStartDate(repeat,today,normalized.dueDate||sig.dueDate);
      }
    }else if(normalized.type==='todo'){
      normalized.scheduleOnly=false;normalized.dueTime=null;normalized.endTime=null;normalized.allDay=false;
    }
    return normalized;
  }

  function prepareNaturalInboxItems(rawItems,sourceText,today,feedback=[],analysis=null) {
    const source=String(sourceText||'').trim();
    const inputAnalysis=analysis||analyzeNaturalInput(source,today);
    const prepared=[];
    for(const raw of Array.isArray(rawItems)?rawItems:[]){
      const refined=refineNaturalInboxItem(raw,source,today,feedback,inputAnalysis);
      if(!refined)continue;
      if(refined.type==='memo'&&!refined.scheduleOnly)continue;
      prepared.push(refined);
    }
    const deduped=[];
    for(const item of prepared){
      const kind=item.scheduleOnly?'schedule':item.type;
      const duplicateIndex=deduped.findIndex(other=>{
        const otherKind=other.scheduleOnly?'schedule':other.type;
        if(kind!==otherKind)return false;
        if((item.dueDate||null)!==(other.dueDate||null))return false;
        if((item.dueTime||null)!==(other.dueTime||null))return false;
        if((item.endTime||null)!==(other.endTime||null))return false;
        return titleSimilarity(item.title,other.title)>=0.6;
      });
      if(duplicateIndex<0)deduped.push(item);
      else if(String(item.title||'').length>String(deduped[duplicateIndex].title||'').length)deduped[duplicateIndex]=item;
    }
    if(deduped.length>1&&!inputAnalysis.multipleIntent){
      const sig=inputAnalysis.temporal;
      if(sig.deadline){const todo=deduped.find(x=>x.type==='todo'&&!x.scheduleOnly);if(todo)return [todo];}
      if(sig.timeRange||(sig.hasDate&&sig.hasTime&&!sig.deadline)){
        const schedules=deduped.filter(x=>x.scheduleOnly);
        if(schedules.length){
          const schedule=schedules.slice().sort((a,b)=>{
            const metaPenalty=x=>/(?:메모|참고|요약|정리)$/.test(String(x.title||'').trim())?0.25:0;
            const score=x=>titleSimilarity(source,x.title)-metaPenalty(x)+(x.dueTime?0.05:0)+(x.endTime?0.03:0);
            return score(b)-score(a);
          })[0];
          return [schedule];
        }
      }
    }
    return deduped;
  }

  function createManualMemo(title,details='',meta={}){
    const cleanTitle=String(title||'').trim();
    if(!cleanTitle)throw new Error('메모 제목을 입력해 주세요.');
    return {
      id:meta.id||`${Date.now()}-${Math.random()}`,type:'memo',title:cleanTitle,details:String(details||'').trim(),priority:'medium',
      dueDate:null,dueTime:null,endTime:null,allDay:false,tags:[],projectTitle:null,done:false,createdAt:meta.createdAt||new Date().toISOString()
    };
  }

  function formatDateParts(year,month,day) {
    return `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
  }
  function isValidCalendarDate(year,month,day) {
    const normalized = normalizeDueDate(formatDateParts(year,month,day));
    return Boolean(normalized);
  }
  function parseSpecificDateCommand(text,today) {
    const current = normalizeDueDate(today);
    if (!current) return null;
    const currentYear = Number(current.slice(0,4));

    const full = text.match(/^\/((?:(\d{4})년)?(\d{1,2})월(\d{1,2})일)(?:\s+(.*))?$/);
    if (full) {
      const command = `/${full[1]}`;
      const year = full[2] ? Number(full[2]) : currentYear;
      const month = Number(full[3]);
      const day = Number(full[4]);
      if (!isValidCalendarDate(year,month,day)) return {command,item:null,error:'존재하지 않는 날짜입니다.'};
      const dueDate = formatDateParts(year,month,day);
      if (dueDate < current) return {command,item:null,error:`${year}년 ${month}월 ${day}일은 이미 지난 날짜입니다.`};
      const body = String(full[5] || '').trim();
      if (!body) return {command,item:null,error:`${command} 뒤에 내용을 입력해 주세요.`};
      const parsed = parseScheduleBody(body);
      if (!parsed) return {command,item:null,error:`${command} 뒤에 내용을 입력해 주세요.`};
      return {command,error:null,item:{
        type:'todo',title:parsed.title,details:'',priority:'medium',dueDate,dueTime:parsed.dueTime,endTime:parsed.endTime,
        tags:[],projectTitle:null,scheduleOnly:true
      }};
    }

    const monthOnly = text.match(/^\/(?:((\d{4})년)?(\d{1,2})월)(?:\s+(.*))?$/);
    if (monthOnly) {
      const year = monthOnly[2] ? Number(monthOnly[2]) : currentYear;
      const month = Number(monthOnly[3]);
      const command = `/${monthOnly[1]}`;
      if (month < 1 || month > 12) return {command,item:null,error:'존재하지 않는 날짜입니다.'};
      const pendingMonth = `${year}-${String(month).padStart(2,'0')}`;
      const currentMonth = current.slice(0,7);
      if (pendingMonth < currentMonth) return {command,item:null,error:monthOnly[2]?`${year}년 ${month}월은 이미 지난 달입니다.`:`${year}년 ${month}월은 이미 지난 달입니다. 연도를 함께 입력해 주세요.`};
      const body = String(monthOnly[4] || '').trim();
      if (!body) return {command,item:null,error:`${command} 뒤에 내용을 입력해 주세요.`};
      const parsed = parseScheduleBody(body);
      if (!parsed) return {command,item:null,error:`${command} 뒤에 내용을 입력해 주세요.`};
      if (parsed.dueTime || parsed.endTime) return {command,item:null,error:`날짜 미정 일정에는 시간을 지정할 수 없습니다. 날짜까지 입력해 주세요. 예: /${month}월9일 1400-1600 ${parsed.title}`};
      return {command,error:null,item:{
        type:'todo',title:parsed.title,details:'',priority:'medium',dueDate:null,dueTime:null,endTime:null,allDay:true,
        tags:[],projectTitle:null,scheduleOnly:true,dateUndecided:true,pendingMonth
      }};
    }
    return null;
  }

  function parseLocalInboxCommand(value, today) {
    const text = String(value ?? '').trim();
    const dueToday = normalizeDueDate(today);
    if (!text || !dueToday) return null;
    if(text==='/메모'||text.startsWith('/메모 '))return {command:'/메모',item:null,error:'메모는 자동 생성하지 않습니다. 메모 탭에서 직접 작성해 주세요.'};
    const specificDate = parseSpecificDateCommand(text,dueToday);
    if (specificDate) return specificDate;
    const definitions = [
      {command:'/오늘일정',kind:'schedule',offset:0},
      {command:'/내일일정',kind:'schedule',offset:1},
      {command:'/오늘할일',kind:'todo',offset:0},
      {command:'/내일할일',kind:'todo',offset:1}
    ];
    const def = definitions.find(entry=>text===entry.command||text.startsWith(`${entry.command} `));
    if (!def) return null;
    let body = text.slice(def.command.length).trim();
    if (!body) return {command:def.command,item:null};
    if (def.kind === 'schedule') {
      const parsed = parseScheduleBody(body);
      if (!parsed) return {command:def.command,item:null};
      return {command:def.command,item:{
        type:'todo',title:parsed.title,details:'',priority:'medium',dueDate:addDays(dueToday,def.offset),dueTime:parsed.dueTime,endTime:parsed.endTime,
        tags:[],projectTitle:null,scheduleOnly:true
      }};
    }
    body = stripTrailingSaveVerb(body);
    if (!body) return {command:def.command,item:null};
    return {command:def.command,item:{
      type:'todo',title:body,details:'',priority:'medium',dueDate:addDays(dueToday,def.offset),dueTime:null,endTime:null,tags:[],projectTitle:null
    }};
  }
  function parseTodayScheduleCommand(value, today) {
    const parsed = parseLocalInboxCommand(value,today);
    return parsed?.command==='/오늘일정' ? parsed.item : null;
  }

  function normalizeInboxItem(item) {
    if (!item || typeof item !== 'object') return null;
    const title = String(item.title ?? '').trim();
    if (!title || !TYPES.has(item.type)) return null;
    const scheduleOnly=Boolean(item.scheduleOnly);
    const dateUndecided=Boolean(item.dateUndecided);
    const dueTime=normalizeDueTime(item.dueTime);
    const endTime=normalizeDueTime(item.endTime);
    return {
      type: item.type,
      title,
      details: String(item.details ?? '').trim(),
      priority: PRIORITIES.has(item.priority) ? item.priority : 'medium',
      dueDate: normalizeDueDate(item.dueDate),
      dueTime,
      endTime,
      allDay: Boolean(item.allDay),
      scheduleOnly,
      dateUndecided,
      pendingMonth: normalizeDueMonth(item.pendingMonth),
      sourceText: normalizeOptional(item.sourceText),
      tags: normalizeTags(item.tags),
      projectTitle: normalizeOptional(item.projectTitle),
      repeat: item.repeat&&typeof item.repeat==='object'?{...item.repeat}:null,
      canceledAt: normalizeOptional(item.canceledAt)
    };
  }
  function summarizeInboxItems(items) {
    const source = Array.isArray(items) ? items : [];
    const counts = { todo:0, schedule:0, memo:0, project:0 };
    for (const item of source) {
      if (item?.type === 'todo' && item?.scheduleOnly) counts.schedule += 1;
      else if (counts[item?.type] !== undefined) counts[item.type] += 1;
    }
    const labels = [];
    if (counts.todo) labels.push(`할 일 ${counts.todo}`);
    if (counts.schedule) labels.push(`일정 ${counts.schedule}`);
    if (counts.memo) labels.push(`메모 ${counts.memo}`);
    if (counts.project) labels.push(`프로젝트 ${counts.project}`);
    return { total:source.length, counts, text:labels.join(' · ') };
  }
  function isSpecialRecord(item) {
    return Boolean(item?.activityOnly || item?.scheduleOnly);
  }
  function filterAssistantItems(items, filter='todo') {
    const source = Array.isArray(items) ? items : [];
    if (filter === 'trash') return source.filter(item => Boolean(item?.deletedAt));
    const active = source.filter(item => !item?.deletedAt);
    if (filter === 'done') return active.filter(item => Boolean(item?.done) && !isSpecialRecord(item));
    if (filter === 'memo') return active.filter(item => item?.type === 'memo' && !item?.done && !item?.activityOnly);
    if (filter === 'schedule') return active.filter(item => item?.type === 'todo' && !item?.done && item?.scheduleOnly);
    if (filter === 'todo') return active.filter(item => item?.type === 'todo' && !item?.done && !item?.scheduleOnly);
    if (filter === 'project') return active.filter(item => item?.type === 'project' && !item?.done);
    return active.filter(item => item?.type === 'todo' && !item?.done && !item?.scheduleOnly);
  }

  function updateAssistantItem(items, id, patch, updatedAt=new Date().toISOString()) {
    const source = Array.isArray(items) ? items : [];
    const target = source.find(item => item?.id === id);
    if (!target) throw new Error('수정할 항목을 찾지 못했습니다.');
    const nextPatch = { ...(patch || {}) };
    if ('title' in nextPatch) {
      nextPatch.title = String(nextPatch.title ?? '').trim();
      if (!nextPatch.title) throw new Error('제목을 입력해 주세요.');
    }
    if ('details' in nextPatch) nextPatch.details = String(nextPatch.details ?? '').trim();
    if ('type' in nextPatch && !TYPES.has(nextPatch.type)) throw new Error('올바른 분류를 선택해 주세요.');
    if ('priority' in nextPatch && !PRIORITIES.has(nextPatch.priority)) throw new Error('올바른 중요도를 선택해 주세요.');
    if ('dueDate' in nextPatch) nextPatch.dueDate = normalizeDueDate(nextPatch.dueDate);
    if ('pendingMonth' in nextPatch) nextPatch.pendingMonth = normalizeDueMonth(nextPatch.pendingMonth);
    if ('dateUndecided' in nextPatch) nextPatch.dateUndecided = Boolean(nextPatch.dateUndecided);
    if ('dueTime' in nextPatch) nextPatch.dueTime = normalizeDueTime(nextPatch.dueTime);
    if ('endTime' in nextPatch) nextPatch.endTime = normalizeDueTime(nextPatch.endTime);
    if ('allDay' in nextPatch) nextPatch.allDay = Boolean(nextPatch.allDay);
    if ('scheduleOnly' in nextPatch) nextPatch.scheduleOnly = Boolean(nextPatch.scheduleOnly);
    const effectiveType = 'type' in nextPatch ? nextPatch.type : target.type;
    if(target.type!=='memo'&&effectiveType==='memo')throw new Error('메모는 메모 탭에서 직접 작성해 주세요.');
    const effectiveSchedule = 'scheduleOnly' in nextPatch ? nextPatch.scheduleOnly : Boolean(target.scheduleOnly);
    if (effectiveType !== 'todo' || !effectiveSchedule) {
      nextPatch.scheduleOnly = false; nextPatch.dueTime = null; nextPatch.endTime = null; nextPatch.allDay = false; nextPatch.dateUndecided = false; nextPatch.pendingMonth = null;
    }
    if (effectiveType === 'todo' && effectiveSchedule) {
      nextPatch.scheduleOnly = true;
      const pending = 'dateUndecided' in nextPatch ? nextPatch.dateUndecided : Boolean(target.dateUndecided);
      const dueDate = 'dueDate' in nextPatch ? nextPatch.dueDate : normalizeDueDate(target.dueDate);
      const pendingMonth = 'pendingMonth' in nextPatch ? nextPatch.pendingMonth : normalizeDueMonth(target.pendingMonth);
      if (pending) {
        if (!pendingMonth) throw new Error('예정 월을 입력해 주세요.');
        if (dueDate) {
          if (!dueDate.startsWith(`${pendingMonth}-`)) throw new Error('확정 날짜는 예정 월 안에서 선택해 주세요.');
          nextPatch.dateUndecided = false;
          nextPatch.pendingMonth = null;
          nextPatch.allDay = true;
          nextPatch.dueTime = null;
          nextPatch.endTime = null;
        } else {
          nextPatch.dueDate = null;
          nextPatch.dueTime = null;
          nextPatch.endTime = null;
          nextPatch.allDay = true;
        }
      } else {
        const allDay = 'allDay' in nextPatch ? nextPatch.allDay : Boolean(target.allDay);
        if (allDay) { nextPatch.dueTime = null; nextPatch.endTime = null; }
        else {
          const start = 'dueTime' in nextPatch ? nextPatch.dueTime : normalizeDueTime(target.dueTime);
          const end = 'endTime' in nextPatch ? nextPatch.endTime : normalizeDueTime(target.endTime);
          if (start && end && end <= start) throw new Error('종료 시간은 시작 시간보다 늦어야 합니다.');
        }
      }
    }
    if ('projectTitle' in nextPatch) nextPatch.projectTitle = normalizeOptional(nextPatch.projectTitle);
    return source.map(item => item?.id === id ? { ...item, ...nextPatch, createdAt:item.createdAt, updatedAt:String(updatedAt||new Date().toISOString()) } : item);
  }

  function toggleAssistantItem(items, id, updatedAt=new Date().toISOString()) {
    const source = Array.isArray(items) ? items : [];
    return source.map(item => item?.id === id && !item?.deletedAt ? { ...item, done: !Boolean(item.done), createdAt:item.createdAt, updatedAt:String(updatedAt||new Date().toISOString()) } : item);
  }

  function softDeleteAssistantItem(items, id, deletedAt=new Date().toISOString()) {
    const source = Array.isArray(items) ? items : [];
    return source.map(item => item?.id === id && !item?.deletedAt ? {
      ...item,
      deletedAt: String(deletedAt || new Date().toISOString()),
      deletedFromDone: Boolean(item.done)
    } : item);
  }
  function restoreAssistantItem(items, id) {
    const source = Array.isArray(items) ? items : [];
    return source.map(item => {
      if (item?.id !== id || !item?.deletedAt) return item;
      const restored = { ...item, done: 'deletedFromDone' in item ? Boolean(item.deletedFromDone) : Boolean(item.done) };
      delete restored.deletedAt;
      delete restored.deletedFromDone;
      return restored;
    });
  }
  function permanentlyDeleteAssistantItem(items, id) {
    const source = Array.isArray(items) ? items : [];
    return source.filter(item => !(item?.id === id && item?.deletedAt));
  }
  function emptyAssistantTrash(items) {
    const source = Array.isArray(items) ? items : [];
    return source.filter(item => !item?.deletedAt);
  }

  function validateTitle(value) {
    const title = String(value ?? '').trim();
    if (!title) throw new Error('제목을 입력해 주세요.');
    return title;
  }
  function createProjectRecord(kind, projectTitle, values={}, meta={}) {
    const project = String(projectTitle ?? '').trim();
    if (!project) throw new Error('연결할 프로젝트를 찾지 못했습니다.');
    const title = validateTitle(values.title);
    const common = {
      id: meta.id || `${Date.now()}-${Math.random()}`,
      title,
      details: String(values.details ?? '').trim(),
      priority: PRIORITIES.has(values.priority) ? values.priority : 'medium',
      dueDate: normalizeDueDate(values.dueDate),
      dueTime: normalizeDueTime(values.dueTime),
      endTime: normalizeDueTime(values.endTime),
      allDay: Boolean(values.allDay),
      tags: normalizeTags(values.tags),
      projectTitle: project,
      done: Boolean(values.done),
      createdAt: meta.createdAt || new Date().toISOString()
    };
    if (kind === 'todo') return { ...common, type:'todo', dueTime:null, endTime:null, allDay:false };
    if (kind === 'memo') throw new Error('메모는 메모 탭에서 직접 작성해 주세요.');
    if (kind === 'schedule') {
      if (!common.dueDate) throw new Error('일정 날짜를 입력해 주세요.');
      if (common.allDay) { common.dueTime=null; common.endTime=null; }
      else if (common.dueTime && common.endTime && common.endTime <= common.dueTime) throw new Error('종료 시간은 시작 시간보다 늦어야 합니다.');
      return { ...common, type:'todo', scheduleOnly:true };
    }
    if (kind === 'activity') return { ...common, type:'memo', dueDate:null, activityOnly:true };
    throw new Error('지원하지 않는 프로젝트 항목입니다.');
  }
  function updateProjectRecord(items, id, patch={}, updatedAt=new Date().toISOString()) {
    const source = Array.isArray(items) ? items : [];
    const target = source.find(item => item?.id === id);
    if (!target) throw new Error('수정할 프로젝트 항목을 찾지 못했습니다.');
    const next = { ...patch };
    if ('title' in next) next.title = validateTitle(next.title);
    if ('details' in next) next.details = String(next.details ?? '').trim();
    if ('priority' in next) next.priority = PRIORITIES.has(next.priority) ? next.priority : 'medium';
    if ('dueDate' in next) {
      next.dueDate = normalizeDueDate(next.dueDate);
      if (target.scheduleOnly && !next.dueDate) throw new Error('일정 날짜를 입력해 주세요.');
    }
    if ('dueTime' in next) next.dueTime = normalizeDueTime(next.dueTime);
    if ('endTime' in next) next.endTime = normalizeDueTime(next.endTime);
    if ('allDay' in next) next.allDay = Boolean(next.allDay);
    if (target.type === 'todo' && !target.scheduleOnly) { next.dueTime=null; next.endTime=null; next.allDay=false; }
    if (target.scheduleOnly) {
      const allDay='allDay' in next?next.allDay:Boolean(target.allDay);
      if(allDay){next.dueTime=null;next.endTime=null;}
      else {const start='dueTime' in next?next.dueTime:normalizeDueTime(target.dueTime);const end='endTime' in next?next.endTime:normalizeDueTime(target.endTime);if(start&&end&&end<=start)throw new Error('종료 시간은 시작 시간보다 늦어야 합니다.');}
    }
    delete next.projectTitle;
    delete next.activityOnly;
    delete next.scheduleOnly;
    return source.map(item => item?.id === id ? { ...item, ...next, createdAt:item.createdAt, updatedAt:String(updatedAt||new Date().toISOString()) } : item);
  }

  function parseDateMs(value) {
    const date = normalizeDueDate(value);
    if (!date) return Number.POSITIVE_INFINITY;
    return Date.parse(`${date}T00:00:00Z`);
  }
  function parseTimeMs(value) {
    const ms = Date.parse(String(value ?? '').trim());
    return Number.isFinite(ms) ? ms : 0;
  }
  function projectSortKey(project) {
    return `${project.done ? '1' : '0'}-${String(project.nextDue || '9999-99-99')}-${project.title}`;
  }
  function sortTodos(items) {
    return (Array.isArray(items)?items:[]).map(item=>{
      const due=normalizeDueDate(item?.dueDate);
      return {item,done:Boolean(item?.done),completedMs:parseTimeMs(item?.updatedAt||item?.createdAt),hasDue:Boolean(due),dueMs:due?parseDateMs(due):Number.POSITIVE_INFINITY,dueTime:String(item?.dueTime||'99:99'),createdMs:parseTimeMs(item?.createdAt),title:String(item?.title||'')};
    }).sort((a,b)=>{
      if(a.done!==b.done)return Number(a.done)-Number(b.done);
      if(a.done&&b.done){const completedDiff=b.completedMs-a.completedMs;if(completedDiff!==0)return completedDiff;}
      if(a.hasDue!==b.hasDue)return a.hasDue?-1:1;
      if(a.hasDue&&b.hasDue){const dueDiff=a.dueMs-b.dueMs;if(dueDiff!==0)return dueDiff;const timeDiff=a.dueTime.localeCompare(b.dueTime);if(timeDiff!==0)return timeDiff;}
      const createdDiff=b.createdMs-a.createdMs;if(createdDiff!==0)return createdDiff;
      return a.title.localeCompare(b.title,'ko');
    }).map(entry=>entry.item);
  }
  function partitionSchedules(items,today){
    const currentDate=normalizeDueDate(today);
    const active=(Array.isArray(items)?items:[]).filter(item=>item&&item.scheduleOnly&&!item.deletedAt&&!item.done);
    const past=[],current=[];
    for(const item of active){
      if(currentDate&&normalizeDueDate(item.dueDate)&&item.dueDate<currentDate)past.push(item);else current.push(item);
    }
    return {current:sortSchedules(current),past:sortSchedules(past)};
  }
  function sortSchedules(items) {
    return (Array.isArray(items)?items:[]).map(item=>({item,dueMs:parseDateMs(item?.dueDate),dueTime:String(item?.dueTime||'99:99'),title:String(item?.title||'')})).sort((a,b)=>{
      const aDated=Number.isFinite(a.dueMs),bDated=Number.isFinite(b.dueMs);
      if(aDated!==bDated)return aDated?-1:1;
      if(aDated&&bDated){const diff=a.dueMs-b.dueMs;if(diff!==0)return diff;}
      const timeDiff=a.dueTime.localeCompare(b.dueTime);if(timeDiff!==0)return timeDiff;
      return a.title.localeCompare(b.title,'ko');
    }).map(entry=>entry.item);
  }
  function sortRecent(items) {
    return [...items].sort((a,b)=>{
      const diff = parseTimeMs(b.createdAt) - parseTimeMs(a.createdAt);
      if (diff !== 0) return diff;
      return String(b.dueDate||'').localeCompare(String(a.dueDate||''), 'ko');
    });
  }
  function groupAssistantItems(items,today) {
    const currentDate=normalizeDueDate(today);
    const todoList=[],memo=[],project=[],done=[],trash=[],scheduleCurrent=[],schedulePast=[];
    let openTodoCount=0;
    for(const item of Array.isArray(items)?items:[]){
      if(!item||typeof item!=='object')continue;
      if(item.deletedAt){trash.push(item);continue;}
      if(item.type==='todo'&&!item.scheduleOnly){todoList.push(item);if(!item.done)openTodoCount++;}
      if(item.done&&!isSpecialRecord(item))done.push(item);
      if(item.done)continue;
      if(item.type==='memo'&&!item.activityOnly)memo.push(item);
      if(item.type==='project')project.push(item);
      if(item.type==='todo'&&item.scheduleOnly){
        const due=normalizeDueDate(item.dueDate);
        if(currentDate&&due&&due<currentDate)schedulePast.push(item);
        else scheduleCurrent.push(item);
      }
    }
    const sortedTodos=sortTodos(todoList);
    const current=sortSchedules(scheduleCurrent),past=sortSchedules(schedulePast);
    return {
      todoList:sortedTodos,memo,project,done,trash,schedules:{current,past},
      counts:{todo:openTodoCount,memo:memo.length,project:project.length,done:done.length,trash:trash.length,schedule:current.length+past.length}
    };
  }

  function compactTitleIdentity(value){
    return String(value||'').toLowerCase().replace(/[^0-9a-z가-힣]/g,'');
  }
  function scheduleMonth(item){
    if(!item?.scheduleOnly)return null;
    if(item.dateUndecided)return normalizeDueMonth(item.pendingMonth);
    const due=normalizeDueDate(item.dueDate);
    return due?due.slice(0,7):null;
  }
  function reconcileUndecidedScheduleConflicts(incoming,existing){
    const current=(Array.isArray(existing)?existing:[]).filter(x=>x&&!x.deletedAt&&x.scheduleOnly);
    const accepted=[];const superseded=new Set();
    for(const item of Array.isArray(incoming)?incoming:[]){
      if(!item?.scheduleOnly){accepted.push(item);continue;}
      const title=compactTitleIdentity(item.title),month=scheduleMonth(item);
      if(!title||!month){accepted.push(item);continue;}
      const isPending=Boolean(item.dateUndecided);
      const conflicts=current.filter(old=>compactTitleIdentity(old.title)===title&&scheduleMonth(old)===month);
      if(isPending){
        const exactExists=conflicts.some(old=>!old.dateUndecided&&normalizeDueDate(old.dueDate));
        const acceptedExact=accepted.some(old=>old?.scheduleOnly&&!old.dateUndecided&&compactTitleIdentity(old.title)===title&&scheduleMonth(old)===month);
        if(exactExists||acceptedExact)continue;
        accepted.push(item);continue;
      }
      if(normalizeDueDate(item.dueDate)){
        for(const old of conflicts)if(old.dateUndecided&&old.id)superseded.add(old.id);
        for(let i=accepted.length-1;i>=0;i--){
          const old=accepted[i];
          if(old?.scheduleOnly&&old.dateUndecided&&compactTitleIdentity(old.title)===title&&scheduleMonth(old)===month)accepted.splice(i,1);
        }
      }
      accepted.push(item);
    }
    return {items:accepted,supersededIds:[...superseded]};
  }

  function sameDuplicateIdentity(a,b){
    const kindA=a?.scheduleOnly?'schedule':a?.type,kindB=b?.scheduleOnly?'schedule':b?.type;
    return Boolean(a&&b&&kindA===kindB&&String(a.title||'').trim()===String(b.title||'').trim()&&
      (normalizeDueDate(a.dueDate)||null)===(normalizeDueDate(b.dueDate)||null)&&
      (normalizeDueTime(a.dueTime)||null)===(normalizeDueTime(b.dueTime)||null)&&
      (normalizeDueTime(a.endTime)||null)===(normalizeDueTime(b.endTime)||null)&&
      (normalizeDueMonth(a.pendingMonth)||null)===(normalizeDueMonth(b.pendingMonth)||null)&&
      Boolean(a.dateUndecided)===Boolean(b.dateUndecided));
  }
  function filterRecentDuplicateItems(incoming,existing,now=new Date().toISOString(),windowMs=10000){
    const nowMs=parseTimeMs(now),limit=Math.max(0,Number(windowMs)||0);
    const recent=(Array.isArray(existing)?existing:[]).filter(item=>{
      if(!item||item.deletedAt)return false;
      const created=parseTimeMs(item.createdAt);
      return Number.isFinite(nowMs)&&Number.isFinite(created)&&nowMs>=created&&(nowMs-created)<=limit;
    });
    const accepted=[];
    for(const item of Array.isArray(incoming)?incoming:[]){
      if(recent.some(old=>sameDuplicateIdentity(item,old))||accepted.some(old=>sameDuplicateIdentity(item,old)))continue;
      accepted.push(item);
    }
    return accepted;
  }

  function ensureProjectRecord(map, title) {
    const name = String(title ?? '').trim();
    if (!name) return null;
    if (!map.has(name)) map.set(name, { key:name, title:name, projectItem:null, linked:[] });
    return map.get(name);
  }
  function collectAssistantProjects(items) {
    const source = (Array.isArray(items) ? items : []).filter(item => item && !item.deletedAt);
    const map = new Map();
    for (const item of source) {
      const title = String(item.title ?? '').trim();
      if (item.type === 'project' && title) {
        const entry = ensureProjectRecord(map, title);
        if (entry && !entry.projectItem) entry.projectItem = item;
      }
      const linkedName = String(item.projectTitle ?? '').trim();
      if (linkedName) {
        const entry = ensureProjectRecord(map, linkedName);
        if (entry) entry.linked.push(item);
      }
    }
    return [...map.values()].map(entry => {
      const projectItem = entry.projectItem;
      const linked = entry.linked.filter(Boolean);
      const todos = sortTodos(linked.filter(item => item.type === 'todo' && !item.scheduleOnly));
      const memos = sortRecent(linked.filter(item => item.type === 'memo' && !item.activityOnly));
      const activities = sortRecent(linked.filter(item => item.activityOnly));
      const scheduleItems = sortSchedules(linked.filter(item => item.scheduleOnly && item.dueDate && !item.canceledAt));
      const datedItems = sortSchedules([projectItem, ...linked].filter(item => item && item.dueDate && !item.done));
      const doneTodos = todos.filter(item => item.done).length;
      const totalTodos = todos.length;
      const progress = totalTodos ? Math.round((doneTodos / totalTodos) * 100) : (projectItem?.done ? 100 : 0);
      const recent = sortRecent([projectItem, ...linked].filter(Boolean)).slice(0, 8);
      return {
        key: entry.key,
        title: projectItem?.title || entry.title,
        projectItem,
        isVirtual: !projectItem,
        description: String(projectItem?.details ?? '').trim(),
        done: Boolean(projectItem?.done),
        todos,
        memos,
        schedules: scheduleItems,
        activities,
        recent,
        nextDue: datedItems[0]?.dueDate || null,
        progress,
        doneTodos,
        totalTodos,
        stats: {
          todos: todos.filter(item => !item.done).length,
          memos: memos.length,
          schedules: scheduleItems.length,
          activities: activities.length
        }
      };
    }).sort((a,b)=>projectSortKey(a).localeCompare(projectSortKey(b), 'ko'));
  }
  function formatActivityLabel(item) {
    if (!item) return '';
    if (item.activityOnly) return '활동 기록';
    if (item.scheduleOnly) return item.canceledAt ? '일정 취소' : '일정 추가';
    if (item.type === 'project') return item.done ? '프로젝트 완료' : '프로젝트 생성';
    if (item.type === 'todo') return item.done ? '할 일 완료' : '할 일 추가';
    return '메모 추가';
  }
  function buildProjectSuggestions(project) {
    if (!project) return [];
    const suggestions = [];
    if (project.isVirtual) suggestions.push('이 프로젝트는 연결된 항목만 있습니다. 장기 프로젝트 설명을 추가해 보세요.');
    if (!project.totalTodos) suggestions.push('이 프로젝트에 다음 행동을 하나 추가해보세요.');
    if (project.nextDue) suggestions.push(`다가오는 일정(${project.nextDue}) 전에 할 일을 점검해보세요.`);
    if (project.totalTodos && project.doneTodos < project.totalTodos) suggestions.push(`남은 할 일 ${project.totalTodos-project.doneTodos}개를 이번 주 목표로 잡아볼까요?`);
    return suggestions.slice(0, 3);
  }

  return {
    normalizeInboxItem,
    analyzeNaturalInput,
    extractNaturalTemporalSignals,
    refineNaturalInboxItem,
    prepareNaturalInboxItems,
    createManualMemo,
    detectUnsupportedRecurrence,
    parseSupportedRecurrence,
    createClassificationFeedback,
    parseTodayScheduleCommand,
    parseLocalInboxCommand,
    summarizeInboxItems,
    filterAssistantItems,
    updateAssistantItem,
    toggleAssistantItem,
    sortTodos,
    sortSchedules,
    partitionSchedules,
    groupAssistantItems,
    filterRecentDuplicateItems,
    reconcileUndecidedScheduleConflicts,
    softDeleteAssistantItem,
    restoreAssistantItem,
    permanentlyDeleteAssistantItem,
    emptyAssistantTrash,
    createProjectRecord,
    updateProjectRecord,
    collectAssistantProjects,
    formatActivityLabel,
    buildProjectSuggestions
  };
});
