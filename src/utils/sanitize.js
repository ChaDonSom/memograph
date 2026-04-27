import { MAX_DATA_IMAGE_URL_LENGTH } from './imageCompression.js';

export const RICH_CONTENT_TOOLBAR = [
  ['bold', 'italic', 'underline', 'strike'],
  [{ header: [1, 2, 3, false] }],
  ['blockquote', 'code-block'],
  [{ list: 'ordered' }, { list: 'bullet' }],
  ['link', 'image'],
  ['clean'],
];

export const RICH_ALLOWED_TAGS = new Set([
  'A', 'B', 'BLOCKQUOTE', 'BR', 'CODE', 'DIV', 'EM', 'H1', 'H2', 'H3', 'IMG',
  'LI', 'OL', 'P', 'PRE', 'S', 'SPAN', 'STRONG', 'U', 'UL',
]);
export const RICH_GLOBAL_ATTRS = new Set(['class']);
export const RICH_ALLOWED_ATTRS = {
  A: new Set(['href', 'rel', 'target', 'title']),
  IMG: new Set(['alt', 'src', 'style', 'title']),
  LI: new Set(['data-list']),
  SPAN: new Set(['contenteditable']),
};

export const MAX_SANITIZED_HTML_CACHE_ENTRIES = 200;
const MAX_IMAGE_WIDTH_PX = 2_000;

export function sanitizeImageWidth(value) {
  const trimmed = String(value || '').trim();
  const match = /^(\d+(?:\.\d+)?)(%|px)$/i.exec(trimmed);
  if (!match) return '';

  const size = Number(match[1]);
  const unit = match[2].toLowerCase();
  if (!Number.isFinite(size) || size <= 0) return '';
  if (unit === '%' && size > 100) return '';
  if (unit === 'px' && size > MAX_IMAGE_WIDTH_PX) return '';
  return `${size}${unit}`;
}

export function isSafeRichUrl(value, allowDataImage = false) {
  const trimmed = value.trim();
  if (allowDataImage && /^data:image\/(png|jpe?g|gif|webp);base64,/i.test(trimmed)) {
    if (trimmed.length > MAX_DATA_IMAGE_URL_LENGTH) return false;
    const commaIndex = trimmed.indexOf(',');
    const data = trimmed.slice(commaIndex + 1);
    if (!data || data.length % 4 !== 0 || !/^[a-z0-9+/]+={0,2}$/i.test(data)) return false;
    try {
      atob(data);
      return true;
    } catch {
      return false;
    }
  }

  try {
    const url = new URL(trimmed, window.location.origin);
    return ['http:', 'https:', 'mailto:'].includes(url.protocol);
  } catch {
    return false;
  }
}

const sanitizedHtmlCache = new Map();

export function sanitizeRichHtml(html = '') {
  if (sanitizedHtmlCache.has(html)) {
    const cached = sanitizedHtmlCache.get(html);
    sanitizedHtmlCache.delete(html);
    sanitizedHtmlCache.set(html, cached);
    return cached;
  }

  const template = document.createElement('template');
  template.innerHTML = html;

  function cleanNode(node) {
    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const element = node;
    for (const child of [...element.children]) {
      cleanNode(child);
    }

    if (['SCRIPT', 'STYLE'].includes(element.tagName)) {
      element.remove();
      return;
    }

    if (!RICH_ALLOWED_TAGS.has(element.tagName)) {
      element.replaceWith(...element.childNodes);
      return;
    }

    for (const attr of [...element.attributes]) {
      const allowedForTag = RICH_ALLOWED_ATTRS[element.tagName] ?? new Set();
      const isAllowed = RICH_GLOBAL_ATTRS.has(attr.name) || allowedForTag.has(attr.name);
      if (!isAllowed || /^on/i.test(attr.name)) {
        element.removeAttribute(attr.name);
      }
    }

    if (element.tagName === 'A') {
      const href = element.getAttribute('href');
      if (!href || !isSafeRichUrl(href)) {
        element.removeAttribute('href');
      } else {
        element.setAttribute('rel', 'noopener noreferrer');
        element.setAttribute('target', '_blank');
      }
    }

    if (element.tagName === 'IMG') {
      const src = element.getAttribute('src');
      if (!src || !isSafeRichUrl(src, true)) {
        element.remove();
        return;
      }
      // Preserve only width from style to support image resize feature.
      const style = element.getAttribute('style');
      if (style) {
        const width = sanitizeImageWidth(/width\s*:\s*([^;]+)/i.exec(style)?.[1]);
        if (width) {
          element.setAttribute('style', `width: ${width}`);
        } else {
          element.removeAttribute('style');
        }
      }
    }
  }

  for (const el of [...template.content.children]) {
    cleanNode(el);
  }

  const sanitized = template.innerHTML;
  if (sanitizedHtmlCache.size >= MAX_SANITIZED_HTML_CACHE_ENTRIES) {
    sanitizedHtmlCache.delete(sanitizedHtmlCache.keys().next().value);
  }
  sanitizedHtmlCache.set(html, sanitized);
  return sanitized;
}

export function sanitizeRichDelta(delta) {
  const ops = Array.isArray(delta?.ops) ? delta.ops : [];
  return {
    ops: ops
      .filter(op => {
        if (!op || typeof op !== 'object') return false;
        const image = typeof op.insert === 'object' ? op.insert?.image : null;
        return !image || isSafeRichUrl(String(image), true);
      })
      .map(op => {
        const cleaned = { ...op };
        if (op.insert && typeof op.insert === 'object') {
          cleaned.insert = { ...op.insert };
        }
        if (op.attributes && typeof op.attributes === 'object') {
          cleaned.attributes = { ...op.attributes };
        }

        const image = typeof cleaned.insert === 'object' ? cleaned.insert?.image : null;
        const width = cleaned.attributes?.width;
        if (width) {
          const safeWidth = image ? sanitizeImageWidth(width) : '';
          if (safeWidth) {
            cleaned.attributes.width = safeWidth;
          } else {
            delete cleaned.attributes.width;
          }
        }

        const link = cleaned.attributes?.link;
        if (!link || isSafeRichUrl(String(link))) {
          if (cleaned.attributes && !Object.keys(cleaned.attributes).length) {
            delete cleaned.attributes;
          }
          return cleaned;
        }

        delete cleaned.attributes.link;
        if (!Object.keys(cleaned.attributes).length) {
          delete cleaned.attributes;
        }
        return cleaned;
      }),
  };
}

export function normalizeEditorHtml(html = '') {
  return html === '<p><br></p>' ? '' : html;
}
