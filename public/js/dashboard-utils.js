(function(root,factory){
  const api=factory(root?.AssistantUtils, typeof require==='function' ? (()=>{try{return require('./assistant-utils.js');}catch{return null;}})() : null);
  if(typeof module!=='undefined'&&module.exports) module.exports=api;
  if(root) root.DashboardUtils=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(browserAssistantUtils,nodeAssistantUtils){
  const AU=browserAssistantUtils||nodeAssistantUtils;
  function validDate(value){return /^\d{4}-\d{2}-\d{2}$/.test(String(value||''));}
  function validTime(value){return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value||''));}
  function normalizeTime(value){return validTime(value)?String(value):null;}
  function dayNumber(value){
    if(!validDate(value)) return null;
    const [y,m,d]=value.split('-').map(Number);
    const ms=Date.UTC(y,m-1,d);
    const dt=new Date(ms);
    if(dt.getUTCFullYear()!==y||dt.getUTCMonth()!==m-1||dt.getUTCDate()!==d) return null;
    return Math.floor(ms/86400000);
  }
  function sortByDateTimeTitle(items){
    return [...items].sort((a,b)=>{
      const dateDiff=String(a.dueDate||a.date||'9999-99-99').localeCompare(String(b.dueDate||b.date||'9999-99-99'));
      if(dateDiff!==0)return dateDiff;
      const timeDiff=String(a.dueTime||'99:99').localeCompare(String(b.dueTime||'99:99'));
      if(timeDiff!==0)return timeDiff;
      return String(a.title||a.name||'').localeCompare(String(b.title||b.name||''),'ko');
    });
  }
  function createQuickItem(kind,values={},meta={}){
    const title=String(values.title||'').trim();
    if(!title)throw new Error('제목을 입력해 주세요.');
    const dueDate=validDate(values.dueDate)?String(values.dueDate):null;
    const dueTime=normalizeTime(values.dueTime);
    const endTime=normalizeTime(values.endTime);
    const allDay=Boolean(values.allDay);
    const common={
      id:meta.id||`${Date.now()}-${Math.random()}`,
      title,
      details:String(values.details||'').trim(),
      priority:'medium',
      dueDate,
      dueTime,
      endTime,
      allDay,
      projectTitle:String(values.projectTitle||'').trim()||null,
      tags:[],
      done:false,
      createdAt:meta.createdAt||new Date().toISOString()
    };
    if(kind==='todo')return {...common,type:'todo'};
    if(kind==='memo')return {...common,type:'memo',dueDate:null,dueTime:null};
    if(kind==='schedule'){
      if(!dueDate)throw new Error('일정 날짜를 입력해 주세요.');
      if(allDay)return {...common,dueTime:null,endTime:null,type:'todo',scheduleOnly:true};
      if(dueTime&&endTime&&endTime<=dueTime)throw new Error('종료 시간은 시작 시간보다 늦어야 합니다.');
      return {...common,type:'todo',scheduleOnly:true};
    }
    throw new Error('지원하지 않는 빠른 추가 항목입니다.');
  }
  function buildTodayDashboard({assistant=[],cooking=[],today}){
    const todayDay=dayNumber(today);
    if(todayDay===null) throw new Error('오늘 날짜 형식이 올바르지 않습니다.');
    const active=(Array.isArray(assistant)?assistant:[]).filter(item=>item&&!item.deletedAt);
    const incomplete=active.filter(item=>!item.done);
    const todayTodos=sortByDateTimeTitle(incomplete.filter(item=>item.type==='todo'&&!item.scheduleOnly&&item.dueDate===today));
    const todaySchedules=sortByDateTimeTitle(incomplete.filter(item=>item.scheduleOnly&&item.dueDate===today));
    const overdueTodos=sortByDateTimeTitle(incomplete.filter(item=>item.type==='todo'&&!item.scheduleOnly&&validDate(item.dueDate)&&item.dueDate<today)).map(item=>({...item,overdueDays:todayDay-dayNumber(item.dueDate)}));
    const upcoming=sortByDateTimeTitle(incomplete.filter(item=>{
      if(!(item.type==='todo'||item.scheduleOnly)||!validDate(item.dueDate)) return false;
      const n=dayNumber(item.dueDate);
      return n>todayDay&&n<=todayDay+7;
    }));
    let projects=[];
    if(AU?.collectAssistantProjects){
      projects=AU.collectAssistantProjects(active).filter(project=>!project.done).sort((a,b)=>String(a.nextDue||'9999-99-99').localeCompare(String(b.nextDue||'9999-99-99'))||String(a.title||'').localeCompare(String(b.title||''),'ko'));
    }
    const recentMemos=active.filter(item=>item.type==='memo'&&!item.activityOnly&&!item.scheduleOnly).sort((a,b)=>Date.parse(b.createdAt||0)-Date.parse(a.createdAt||0)).slice(0,4);
    const cookingUpcoming=sortByDateTimeTitle((Array.isArray(cooking)?cooking:[]).filter(project=>{
      if(!validDate(project?.date)) return false;
      const n=dayNumber(project.date);
      return n>=todayDay&&n<=todayDay+7;
    }));
    return {
      todayTodos,
      todaySchedules,
      overdueTodos,
      upcoming,
      projects,
      recentMemos,
      cookingUpcoming,
      kpis:{todayTodos:todayTodos.length,todaySchedules:todaySchedules.length,overdueTodos:overdueTodos.length,activeProjects:projects.length}
    };
  }
  return {buildTodayDashboard,createQuickItem};
});
