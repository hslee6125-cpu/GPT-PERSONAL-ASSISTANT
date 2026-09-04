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

  return { normalizeInboxItem, summarizeInboxItems, filterAssistantItems, updateAssistantItem };
});
