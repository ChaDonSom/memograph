export function normalizeNewlines(text = '') {
  return text.replace(/\r\n/g, '\n');
}

export function firstNormalizedLine(text = '') {
  return normalizeNewlines(text).split('\n')[0].trim();
}

export function splitRelationDescription(desc = '') {
  const [label = '', ...detailLines] = normalizeNewlines(desc).split('\n');
  return {
    label: label.trim(),
    detail: detailLines.join('\n').replace(/\s+$/, ''),
  };
}

export function richTextToPlainText(html = '') {
  const template = document.createElement('template');
  template.innerHTML = html;
  return (template.content.textContent || '').replace(/\s+/g, ' ').trim();
}

export function richTextFirstLine(html = '') {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const blocks = doc.body.querySelectorAll('p, h1, h2, h3, li, blockquote, pre');
  for (const block of blocks) {
    const text = (block.textContent || '').replace(/\s+/g, ' ').trim();
    if (text) return text;
  }
  return firstNormalizedLine(doc.body.textContent || '');
}

export function decodeHtmlEntities(text = '') {
  const textarea = document.createElement('textarea');
  textarea.innerHTML = text;
  return textarea.value;
}

export function escapeHtml(text = '') {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function truncateText(text = '', maxLength) {
  return text.length > maxLength ? `${text.slice(0, maxLength - 1).trimEnd()}…` : text;
}
