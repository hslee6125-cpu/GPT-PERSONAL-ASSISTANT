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
  function parseScheduleBody(value) {
    let body = String(value ?? '').trim();
    if (!body) return null;
    let dueTime = null;
    const patterns = [
      /(?:^|\s)(오전|오후)?\s*(\d{1,2}):(\d{2})(?=\s|$)/,
      /(?:^|\s)(오전|오후)?\s*(\d{1,2})시(?:\s*(\d{1,2})분)?(?:에)?(?=\s|$)/
    ];
    for (const pattern of patterns) {
      const match = body.match(pattern);
      if (!match) continue;
      let hour = Number(match[2]);
      const minute = Number(match[3] || 0);
      const meridiem = match[1] || '';
      if (meridiem) {
        if (hour < 1 || hour > 12 || minute > 59) continue;
        if (meridiem === '오전' && hour === 12) hour = 0;
        if (meridiem === '오후' && hour !== 12) hour += 12;
      } else if (hour > 23 || minute > 59) continue;
      dueTime = `${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}`;
      body = `${body.slice(0, match.index)} ${body.slice(match.index + match[0].length)}`.replace(/\s+/g,' ').trim();
      break;
    }
    body = stripTrailingSaveVerb(body);
    return body ? {title:body,dueTime} : null;
  }
  function parseLocalInboxCommand(value, today) {
    const text = String(value ?? '').trim();
    const dueToday = normalizeDueDate(today);
    if (!text || !dueToday) return null;
    const definitions = [
      {command:'오늘일정',kind:'schedule',offset:0},
      {command:'내일일정',kind:'schedule',offset:1},
      {command:'오늘할일',kind:'todo',offset:0},
      {command:'내일할일',kind:'todo',offset:1},
      {command:'메모',kind:'memo',offset:null}
    ];
    const def = definitions.find(entry=>text===entry.command||text.startsWith(`${entry.command} `));
    if (!def) return null;
    let body = text.slice(def.command.length).trim();
    if (!body) return {command:def.command,item:null};
    if (def.kind === 'schedule') {
      const parsed = parseScheduleBody(body);
      if (!parsed) return {command:def.command,item:null};
      return {command:def.command,item:{
        type:'todo',title:parsed.title,details:'',priority:'medium',dueDate:addDays(dueToday,def.offset),dueTime:parsed.dueTime,
        tags:[],projectTitle:null,scheduleOnly:true
      }};
    }
    body = stripTrailingSaveVerb(body);
    if (!body) return {command:def.command,item:null};
    if (def.kind === 'memo') return {command:def.command,item:{
      type:'memo',title:body,details:'',priority:'medium',dueDate:null,dueTime:null,tags:[],projectTitle:null
    }};
    return {command:def.command,item:{
      type:'todo',title:body,details:'',priority:'medium',dueDate:addDays(dueToday,def.offset),dueTime:null,tags:[],projectTitle:null
    }};
  }
  function parseTodayScheduleCommand(value, today) {
    const parsed = parseLocalInboxCommand(value,today);
    return parsed?.command==='오늘일정' ? parsed.item : null;
  }

  function normalizeInboxItem(item) {
    if (!item || typeof item !== 'object') return null;
    const title = String(item.title ?? '').trim();
    if (!title) return null;
    return {
      type: TYPES.has(item.type) ? item.type : 'memo',
      title,
      details: String(item.details ?? '').trim(),
      priority: PRIORITIES.has(item.priority) ? item.priority : 'medium',
      dueDate: normalizeDueDate(item.dueDate),
      tags: normalizeTags(item.tags),
      projectTitle: normalizeOptional(item.projectTitle)
    };
  }
  function summarizeInboxItems(items) {
    const source = Array.isArray(items) ? items : [];
    const counts = { todo:0, memo:0, project:0 };
    for (const item of source) if (counts[item?.type] !== undefined) counts[item.type] += 1;
    const labels = [];
    if (counts.todo) labels.push(`할 일 ${counts.todo}`);
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

  function updateAssistantItem(items, id, patch) {
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
    if ('dueTime' in nextPatch) nextPatch.dueTime = normalizeDueTime(nextPatch.dueTime);
    if ('projectTitle' in nextPatch) nextPatch.projectTitle = normalizeOptional(nextPatch.projectTitle);
    return source.map(item => item?.id === id ? { ...item, ...nextPatch } : item);
  }

  function toggleAssistantItem(items, id) {
    const source = Array.isArray(items) ? items : [];
    return source.map(item => item?.id === id && !item?.deletedAt ? { ...item, done: !Boolean(item.done) } : item);
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
      tags: normalizeTags(values.tags),
      projectTitle: project,
      done: Boolean(values.done),
      createdAt: meta.createdAt || new Date().toISOString()
    };
    if (kind === 'todo') return { ...common, type:'todo' };
    if (kind === 'memo') return { ...common, type:'memo', dueDate:null };
    if (kind === 'schedule') {
      if (!common.dueDate) throw new Error('일정 날짜를 입력해 주세요.');
      return { ...common, type:'todo', scheduleOnly:true };
    }
    if (kind === 'activity') return { ...common, type:'memo', dueDate:null, activityOnly:true };
    throw new Error('지원하지 않는 프로젝트 항목입니다.');
  }
  function updateProjectRecord(items, id, patch={}) {
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
    delete next.projectTitle;
    delete next.activityOnly;
    delete next.scheduleOnly;
    return source.map(item => item?.id === id ? { ...item, ...next } : item);
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
    return [...items].sort((a,b)=>{
      if (Boolean(a.done) !== Boolean(b.done)) return Number(a.done) - Number(b.done);
      const dueDiff = parseDateMs(a.dueDate) - parseDateMs(b.dueDate);
      if (Number.isFinite(dueDiff) && dueDiff !== 0) return dueDiff;
      const timeDiff=String(a.dueTime||'99:99').localeCompare(String(b.dueTime||'99:99'));
      if(timeDiff!==0)return timeDiff;
      return String(a.title||'').localeCompare(String(b.title||''), 'ko');
    });
  }
  function sortSchedules(items) {
    return [...items].sort((a,b)=>{
      const diff = parseDateMs(a.dueDate) - parseDateMs(b.dueDate);
      if (Number.isFinite(diff) && diff !== 0) return diff;
      const timeDiff=String(a.dueTime||'99:99').localeCompare(String(b.dueTime||'99:99'));
      if(timeDiff!==0)return timeDiff;
      return String(a.title||'').localeCompare(String(b.title||''), 'ko');
    });
  }
  function sortRecent(items) {
    return [...items].sort((a,b)=>{
      const diff = parseTimeMs(b.createdAt) - parseTimeMs(a.createdAt);
      if (diff !== 0) return diff;
      return String(b.dueDate||'').localeCompare(String(a.dueDate||''), 'ko');
    });
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
      const scheduleItems = sortSchedules(linked.filter(item => item.scheduleOnly && item.dueDate && !item.done));
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
    if (item.scheduleOnly) return item.done ? '일정 완료' : '일정 추가';
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
    parseTodayScheduleCommand,
    parseLocalInboxCommand,
    summarizeInboxItems,
    filterAssistantItems,
    updateAssistantItem,
    toggleAssistantItem,
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
