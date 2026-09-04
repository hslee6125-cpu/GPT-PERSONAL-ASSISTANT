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

  return { updateAssistantItem };
});
