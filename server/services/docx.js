const mammoth = require('mammoth');

function decodeEntities(s) {
  const map = {'&nbsp;':' ','&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&#39;':"'"};
  return String(s).replace(/&(nbsp|amp|lt|gt|quot|#39);/g, m => map[m] ?? m);
}

function htmlToStructuredText(html) {
  let s = String(html || '');
  s = s
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<h1[^>]*>/gi, '\n# ')
    .replace(/<h2[^>]*>/gi, '\n## ')
    .replace(/<h3[^>]*>/gi, '\n### ')
    .replace(/<\/h[1-6]>/gi, '\n')
    .replace(/<table[^>]*>/gi, '\n[TABLE]\n')
    .replace(/<\/table>/gi, '\n[/TABLE]\n')
    .replace(/<tr[^>]*>/gi, '\n')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<\/t[dh]>\s*<t[dh][^>]*>/gi, ' | ')
    .replace(/<li[^>]*>/gi, '\n- ')
    .replace(/<\/li>/gi, '')
    .replace(/<\/p>/gi, '\n')
    .replace(/<p[^>]*>/gi, '')
    .replace(/<[^>]+>/g, '');
  return decodeEntities(s)
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function extractDocxText(buffer) {
  const converted = await mammoth.convertToHtml({buffer}, { includeDefaultStyleMap: true });
  const structured = htmlToStructuredText(converted.value);
  if (structured.length >= 20) return structured;
  const raw = await mammoth.extractRawText({buffer});
  return String(raw.value || '').trim();
}

module.exports = { decodeEntities, htmlToStructuredText, extractDocxText };
