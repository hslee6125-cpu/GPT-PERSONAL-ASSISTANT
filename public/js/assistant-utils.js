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
  function normalizeTags(value) {
    const tags = Array.isArray(value) ? value : [];
    return [...new Set(tags.map(tag => String(tag ?? '').trim()).filter(Boolean))];
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
  function filterAssistantItems(items, filter='todo') {
    const source = Array.isArray(items) ? items : [];
    if (filter === 'done') return source.filter(item => Boolean(item?.done));
    const safeFilter = TYPES.has(filter) ? filter : 'todo';
    return source.filter(item => item?.type === safeFilter && !item?.done);
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
    if ('dueDate' in nextPatch) nextPatch.dueDate = normalizeOptional(nextPatch.dueDate);
    if ('projectTitle' in nextPatch) nextPatch.projectTitle = normalizeOptional(nextPatch.projectTitle);
    return source.map(item => item?.id === id ? { ...item, ...nextPatch } : item);
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
      return String(a.title||'').localeCompare(String(b.title||''), 'ko');
    });
  }
  function sortSchedules(items) {
    return [...items].sort((a,b)=>{
      const diff = parseDateMs(a.dueDate) - parseDateMs(b.dueDate);
      if (Number.isFinite(diff) && diff !== 0) return diff;
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
    const source = Array.isArray(items) ? items : [];
    const map = new Map();
    for (const item of source) {
      if (!item || typeof item !== 'object') continue;
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
      const todos = sortTodos(linked.filter(item => item.type === 'todo'));
      const memos = sortRecent(linked.filter(item => item.type === 'memo'));
      const scheduleItems = sortSchedules([projectItem, ...linked].filter(item => item && item.dueDate && !item.done));
      const doneTodos = todos.filter(item => item.done).length;
      const totalTodos = todos.length;
      const progress = totalTodos ? Math.round((doneTodos / totalTodos) * 100) : (projectItem?.done ? 100 : 0);
      const recent = sortRecent([projectItem, ...linked].filter(Boolean)).slice(0, 5);
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
        recent,
        nextDue: scheduleItems[0]?.dueDate || null,
        progress,
        doneTodos,
        totalTodos,
        stats: {
          todos: todos.filter(item => !item.done).length,
          memos: memos.length,
          schedules: scheduleItems.length
        }
      };
    }).sort((a,b)=>projectSortKey(a).localeCompare(projectSortKey(b), 'ko'));
  }
  function formatActivityLabel(item) {
    if (!item) return '';
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
    summarizeInboxItems,
    filterAssistantItems,
    updateAssistantItem,
    collectAssistantProjects,
    formatActivityLabel,
    buildProjectSuggestions
  };
});
