<template>
<div class="layout">

  <!-- ── Sidebar ──────────────────────────────── -->
  <div class="sidebar" ref="sidebarEl" :class="{ 'list-open': listOpen }">

    <!-- Compact bar: one row with search + count + new-page (mobile, stuck only) -->
    <div class="s-compact-bar">
      <input v-model="search" placeholder="Search pages…" />
      <button class="btn-icon" :class="{ active: listOpen }" title="Pages"
              @click="listOpen = !listOpen">{{ nodes.length }}</button>
      <button class="btn-icon" title="New Page" @click="createNode">+</button>
    </div>

    <div class="s-head">
      <div class="brand">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
             stroke="currentColor" stroke-width="2.5">
          <polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5"/>
        </svg>
        Memograph
      </div>
      <span class="n-count">{{ nodes.length }}</span>
    </div>

    <div class="s-search">
      <input v-model="search" placeholder="Search pages…" />
    </div>

    <div class="s-list">
      <div
        v-for="n in filteredNodes"
        :key="n.id"
        class="n-item"
        :class="{ active: n.id === currentId }"
        @click="loadNode(n.id)"
      >{{ n.title || '(untitled)' }}</div>
    </div>

    <div class="s-foot">
      <button class="btn-new" @click="createNode">+ New Page</button>
      <button class="btn-icon" title="Export JSON" @click="exportData">↓</button>
    </div>
  </div>

  <!-- ── Main: editor ─────────────────────────── -->
  <div class="main" v-if="current">
    <div class="main-scroll" ref="mainScrollEl">
      <div class="relationship-canvas" ref="relationshipCanvasEl">
        <svg
          class="rel-connectors"
          v-show="connectorLines.length"
          :width="connectorCanvas.width"
          :height="connectorCanvas.height"
          :viewBox="`0 0 ${connectorCanvas.width} ${connectorCanvas.height}`"
          aria-hidden="true"
        >
          <defs>
            <marker id="rel-arrowhead" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="strokeWidth">
              <path d="M 0 0 L 8 4 L 0 8 z" />
            </marker>
          </defs>
          <g v-for="line in connectorLines" :key="line.edgeId" class="rel-connector">
            <path :d="line.path" marker-end="url(#rel-arrowhead)" />
          </g>
        </svg>
        <div class="rel-connector-labels" v-show="connectorLines.length">
          <div
            v-for="line in connectorLines"
            :key="line.edgeId"
            class="rel-connector-hotspot"
            :class="{ active: relPopover.edgeId === line.edgeId }"
            :style="{ left: line.labelX + 'px', top: line.labelY + 'px' }"
            @mouseenter="showRelationPopover(line.edgeId)"
            @mouseleave="hideRelationPopover"
            @focusin="showRelationPopover(line.edgeId)"
            @focusout="hideRelationPopover"
          >
            <button
              type="button"
              class="rel-connector-label"
              @click.stop="toggleRelationPopover(line.edgeId)"
            >
              {{ line.label }}
            </button>
            <div
              v-if="relPopover.edgeId === line.edgeId"
              class="rel-popover"
              @click.stop
            >
              <div class="rel-popover-title">{{ line.relation.relationLabel }}</div>
              <div class="rel-popover-body" v-html="line.relation.relationBodyHtml"></div>
              <div class="rel-popover-actions">
                <button class="btn btn-ghost" @click="openEditRelationModal(line.relation)">Edit relation</button>
                <button class="btn btn-danger" @click="dropEdge(line.edgeId)">Delete relation</button>
              </div>
            </div>
          </div>
        </div>

        <section class="relation-side relation-side--incoming" aria-label="Incoming relationships">
          <div class="relation-side-head">
            <span class="rel-label">Incoming</span>
            <span class="rel-count">{{ incomingRanked.length }}</span>
          </div>
          <div class="rel-column" v-if="incomingRanked.length">
            <div
              v-for="r in incomingRanked"
              :key="r.edgeId"
              :ref="el => setRelationCardRef(r.edgeId, el)"
              class="rel-card rel-card--side"
              role="button"
              tabindex="0"
              :aria-label="r.ariaLabel"
              @click="handleRelationCardClick($event, r)"
              @keydown.enter.self.prevent="loadNode(r.targetId)"
              @keydown.space.self.prevent="loadNode(r.targetId)"
            >
              <div class="rel-dir">{{ r.dir }}</div>
              <div class="rel-title">{{ r.title }}</div>
              <div class="rel-label-text rel-page-details">{{ r.pageDetails }}</div>
              <div class="rel-foot">
                <span class="rel-score">P={{ r.score.toFixed(1) }}</span>
                <span class="rel-page-meta">{{ r.pageMeta }}</span>
              </div>
              <div class="rel-card-actions">
                <button class="rel-action" @click.stop="loadNode(r.targetId)" @keydown.stop>Edit page</button>
                <button class="rel-action rel-action--danger" @click.stop="deleteRelatedPage(r.targetId)" @keydown.stop>Delete page</button>
              </div>
            </div>
          </div>
          <div class="rel-empty" v-else>No incoming relations.</div>
        </section>

        <section class="resource-panel" ref="centerPanelEl" aria-label="Current page">
          <!-- Title -->
          <div>
            <input
              class="page-title"
              v-model="current.title"
              placeholder="Page title…"
              @input="queueSave"
            />
            <div class="page-meta">
              <span>Edited {{ timeAgo(current.updatedAt) }}</span>
              <span>{{ current.visits || 0 }} visit{{ current.visits !== 1 ? 's' : '' }}</span>
            </div>
          </div>

          <!-- Quill editor -->
          <div class="editor-wrap">
            <div id="qeditor"></div>
          </div>

          <!-- Relations -->
          <div class="rel-section">
            <div class="rel-head">
              <span class="rel-label">Relations</span>
              <button class="btn-add-rel" @click="openModal">+ Add relation</button>
            </div>
            <div class="rel-empty" v-if="!rankedRelations.length">
              No relations yet. Add one above to connect this page to another.
            </div>
          </div>

          <!-- Page actions -->
          <div class="page-actions">
            <button class="btn btn-danger" @click="deletePage">Delete page</button>
          </div>
        </section>

        <section class="relation-side relation-side--outgoing" aria-label="Outgoing relationships">
          <div class="relation-side-head">
            <span class="rel-label">Outgoing</span>
            <span class="rel-count">{{ outgoingRanked.length }}</span>
          </div>
          <div class="rel-column" v-if="outgoingRanked.length">
            <div
              v-for="r in outgoingRanked"
              :key="r.edgeId"
              :ref="el => setRelationCardRef(r.edgeId, el)"
              class="rel-card rel-card--side"
              role="button"
              tabindex="0"
              :aria-label="r.ariaLabel"
              @click="handleRelationCardClick($event, r)"
              @keydown.enter.self.prevent="loadNode(r.targetId)"
              @keydown.space.self.prevent="loadNode(r.targetId)"
            >
              <div class="rel-dir">{{ r.dir }}</div>
              <div class="rel-title">{{ r.title }}</div>
              <div class="rel-label-text rel-page-details">{{ r.pageDetails }}</div>
              <div class="rel-foot">
                <span class="rel-score">P={{ r.score.toFixed(1) }}</span>
                <span class="rel-page-meta">{{ r.pageMeta }}</span>
              </div>
              <div class="rel-card-actions">
                <button class="rel-action" @click.stop="loadNode(r.targetId)" @keydown.stop>Edit page</button>
                <button class="rel-action rel-action--danger" @click.stop="deleteRelatedPage(r.targetId)" @keydown.stop>Delete page</button>
              </div>
            </div>
          </div>
          <div class="rel-empty" v-else>No outgoing relations.</div>
        </section>
      </div>
    </div>
  </div>

  <!-- ── Main: empty state ────────────────────── -->
  <div class="main" v-else>
    <div class="empty">
      <div class="empty-icon">⬡</div>
      <h2>Memograph</h2>
      <p>A local knowledge graph. Create pages and connect them with typed, weighted relations. Relations are ranked by a priority function.</p>
      <button class="btn btn-primary empty-create" @click="createNode">Create first page</button>
    </div>
  </div>

</div>

<!-- ── Add relation modal ────────────────────── -->
<div class="overlay" v-if="modal.on" @click.self="closeModal">
  <div class="modal">
    <div class="modal-title">{{ modalTitle }}</div>

    <div class="field">
      <label>Target page</label>
      <div class="target-picker">
        <input
          v-model="modal.targetSearch"
          placeholder="Search pages or type a new title..."
          @input="modal.targetId = ''"
        />
        <div class="target-selected" v-if="selectedModalTarget">
          Selected: {{ selectedModalTarget.title || '(untitled)' }}
        </div>
        <div class="target-results" v-if="modalTargetOptions.length">
          <button
            type="button"
            v-for="n in modalTargetOptions"
            :key="n.id"
            class="target-option"
            :class="{ selected: n.id === modal.targetId }"
            @click="selectModalTarget(n)"
          >
            {{ n.title || '(untitled)' }}
          </button>
        </div>
        <button
          type="button"
          class="target-create"
          @click="createModalTarget"
        >
          + Create {{ modalTargetCreateLabel }}
        </button>
      </div>
    </div>

    <div class="field">
      <label>Description / label</label>
      <div class="rel-editor-wrap">
        <div id="rel-editor"></div>
      </div>
      <div class="field-error" v-if="modal.editorError">{{ modal.editorError }}</div>
    </div>

    <div class="field">
      <label>Direction</label>
      <div class="direction-static" v-if="modal.mode === 'edit'">{{ modalDirectionLabel }}</div>
      <select v-else v-model="modal.dir">
        <option value="out">This page → target (outgoing)</option>
        <option value="in">Target → this page (incoming)</option>
        <option value="bi">Bidirectional</option>
      </select>
    </div>

    <div class="field">
      <label>Priority weight (1 – 10)</label>
      <div class="w-track">
        <input type="range" min="1" max="10" step="1" v-model.number="modal.w" />
        <span class="w-num">{{ modal.w }}</span>
      </div>
    </div>

    <div class="modal-btns">
      <button class="btn btn-ghost" @click="closeModal">Cancel</button>
      <button class="btn btn-primary" @click="saveRel" :disabled="!modal.targetId || !!modal.editorError">{{ modalSaveLabel }}</button>
    </div>
  </div>
</div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import Quill from 'quill';
import { loadGraph, saveGraph } from './services/graphRepository.js';

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

const DEFAULT_EDGE_WEIGHT = 5;
const SAVE_DELAY_MS = 500;
const MS_PER_DAY = 86_400_000;
const RELATION_LABEL_TEXT_MAX_LENGTH = 72;
// Truncation length for relationship names shown on connector labels.
const CONNECTOR_LABEL_MAX_LENGTH = 54;
const ARIA_LABEL_DETAILS_MAX_LENGTH = 140;
const CONNECTOR_CENTER_TARGET_RATIO = 0.42;
const CONNECTOR_MIN_TARGET_OFFSET = 48;
// Keep embedded data images below a conservative URL budget because each page
// stores both Quill delta and preview HTML in localStorage.
const MAX_DATA_IMAGE_URL_LENGTH = 1_500_000;
const MAX_SANITIZED_HTML_CACHE_ENTRIES = 200;
const UPLOAD_IMAGE_MAX_EDGE_LENGTH_ATTEMPTS = [1600, 1200, 900, 600];
// canvas.toDataURL() quality values are 0–1 and only affect lossy formats.
const UPLOAD_IMAGE_QUALITIES = [0.82, 0.7, 0.6];

// Score = explicit weight (dominant) + visit popularity + recency decay.
// This determines the ranking order of relation cards on each page.
function pScore(edge, target) {
  const weight = (edge.weight || DEFAULT_EDGE_WEIGHT) * 3;
  const popularity = Math.log2((target.visits || 0) + 1) * 2;
  const daysSinceUpdate = (Date.now() - (target.updatedAt || 0)) / MS_PER_DAY;
  const recency = 8 * Math.exp(-daysSinceUpdate / 7);
  return weight + popularity + recency;
}

function timeAgo(ts) {
  if (!ts) return 'never';
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60)    return 'just now';
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

const stored = loadGraph();
const nodes = ref(stored.nodes);
const edges = ref(stored.edges);

function persist() {
  try {
    saveGraph(nodes.value, edges.value);
  } catch (error) {
    console.warn('Unable to save Memograph data to localStorage.', error);
  }
}

const currentId = ref(null);
const search = ref('');
const listOpen = ref(false);
const sidebarEl = ref(null);
const mainScrollEl = ref(null);
const relationshipCanvasEl = ref(null);
const centerPanelEl = ref(null);
const connectorLines = ref([]);
const connectorCanvas = reactive({ width: 0, height: 0 });
const relationCardEls = new Map();
let editor = null;
let relEditor = null;
let saveTimer = null;
let connectorFrame = null;
let connectorResizeObserver = null;

const RICH_CONTENT_TOOLBAR = [
  ['bold', 'italic', 'underline', 'strike'],
  [{ header: [1, 2, 3, false] }],
  ['blockquote', 'code-block'],
  [{ list: 'ordered' }, { list: 'bullet' }],
  ['link', 'image'],
  ['clean'],
];

const RICH_ALLOWED_TAGS = new Set([
  'A', 'B', 'BLOCKQUOTE', 'BR', 'CODE', 'DIV', 'EM', 'H1', 'H2', 'H3', 'IMG',
  'LI', 'OL', 'P', 'PRE', 'S', 'SPAN', 'STRONG', 'U', 'UL',
]);
const RICH_GLOBAL_ATTRS = new Set(['class']);
const RICH_ALLOWED_ATTRS = {
  A: new Set(['href', 'rel', 'target', 'title']),
  IMG: new Set(['alt', 'src', 'title']),
  LI: new Set(['data-list']),
  SPAN: new Set(['contenteditable']),
};
const sanitizedHtmlCache = new Map();

const modal = reactive({
  on: false,
  mode: 'add',
  edgeId: '',
  targetId: '',
  targetSearch: '',
  editorError: '',
  dir: 'out',
  w: DEFAULT_EDGE_WEIGHT,
  desc: '',
  descDelta: '',
});
const relPopover = reactive({ edgeId: '', pinned: false });

// ── Derived ───────────────────────────────────────────────────────────
const current = computed(() =>
  findNode(currentId.value)
);

const filteredNodes = computed(() =>
  nodes.value
    .filter(n => (n.title || '').toLowerCase().includes(search.value.toLowerCase()))
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
);

const otherNodes = computed(() =>
  nodes.value.filter(n => n.id !== currentId.value)
);

const selectedModalTarget = computed(() =>
  otherNodes.value.find(n => n.id === modal.targetId) ?? null
);

const modalTargetOptions = computed(() => {
  const query = modal.targetSearch.trim().toLowerCase();
  return otherNodes.value
    .filter(n => !query || (n.title || '').toLowerCase().includes(query))
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
});

const modalTargetCreateLabel = computed(() => {
  const title = modal.targetSearch.trim();
  return title ? `"${title}"` : 'untitled page';
});

const modalTitle = computed(() =>
  modal.mode === 'edit' ? 'Edit Relation' : 'Add Relation'
);

const modalSaveLabel = computed(() =>
  modal.mode === 'edit' ? 'Save changes' : 'Save'
);

const modalDirectionLabel = computed(() => {
  if (modal.dir === 'in') return 'Target → this page (incoming)';
  if (modal.dir === 'bi') return 'Bidirectional';
  return 'This page → target (outgoing)';
});

function normalizeEditorHtml(html = '') {
  return html === '<p><br></p>' ? '' : html;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

/**
 * Resizes an image so its longest edge fits maxEdgeLength and returns a data URL.
 */
function imageToDataUrl(image, maxEdgeLength, type = 'image/jpeg', imageQuality) {
  const scale = Math.min(1, maxEdgeLength / Math.max(1, image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    console.warn('Unable to resize image upload because this browser could not create a canvas context. The image will not be inserted; try another browser if this continues.');
    return '';
  }
  if (type === 'image/jpeg') {
    // JPEG has no transparency, so use white instead of the browser default black.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  return type === 'image/jpeg'
    ? canvas.toDataURL(type, imageQuality ?? UPLOAD_IMAGE_QUALITIES[0])
    : canvas.toDataURL(type);
}

function isSafeRichUrl(value, allowDataImage = false) {
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

/**
 * Tries progressively smaller image sizes/qualities until the data URL can be stored.
 */
async function prepareImageUpload(file) {
  const original = await readFileAsDataUrl(file);
  if (isSafeRichUrl(original, true)) return original;

  const image = await loadImage(original);
  for (const maxEdgeLength of UPLOAD_IMAGE_MAX_EDGE_LENGTH_ATTEMPTS) {
    if (file.type === 'image/png') {
      // PNG is lossless, so retrying at smaller dimensions is the only size lever.
      const png = imageToDataUrl(image, maxEdgeLength, 'image/png');
      if (isSafeRichUrl(png, true)) return png;
    }

    // If a PNG is still too large, fall back to JPEG so the image can persist.
    for (const imageQuality of UPLOAD_IMAGE_QUALITIES) {
      const jpeg = imageToDataUrl(image, maxEdgeLength, 'image/jpeg', imageQuality);
      if (isSafeRichUrl(jpeg, true)) return jpeg;
    }
  }

  return '';
}

async function handleImageUpload(quill, range, files) {
  const fileCount = files.length;
  const images = (await Promise.all(
    Array.from(files, file => prepareImageUpload(file).catch(error => {
      console.warn(`Unable to prepare image upload for ${file.name || file.type || 'selected file'}.`, error);
      return '';
    }))
  )).filter(Boolean);

  if (!images.length) {
    alert('Unable to add that image. Try a smaller image or a different image format.');
    return;
  }
  if (images.length < fileCount) {
    alert('Some images could not be added. Try smaller images or a different image format.');
  }

  quill.deleteText(range.index, range.length, 'user');
  let insertAt = range.index;
  for (const imageDataUrl of images) {
    quill.insertEmbed(insertAt, 'image', imageDataUrl, 'user');
    insertAt++;
  }
  quill.setSelection(insertAt, 0, 'silent');
}

/**
 * Quill uploader handler; Quill provides the uploader module as `this`.
 */
function imageUploadHandler(range, files) {
  // Quill calls uploader handlers with the uploader module as `this`.
  if (!this?.quill) return Promise.resolve();
  return handleImageUpload(this.quill, range, files);
}

function sanitizeRichHtml(html = '') {
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
    }
  }

  let current;
  const walker = document.createTreeWalker(template.content, NodeFilter.SHOW_ELEMENT);
  while ((current = walker.nextNode())) {
    cleanNode(current);
  }

  const sanitized = template.innerHTML;
  if (sanitizedHtmlCache.size >= MAX_SANITIZED_HTML_CACHE_ENTRIES) {
    sanitizedHtmlCache.delete(sanitizedHtmlCache.keys().next().value);
  }
  sanitizedHtmlCache.set(html, sanitized);
  return sanitized;
}

/**
 * Returns a storage-safe Quill delta with unsafe image embeds and links removed.
 * Malformed deltas and operations are omitted so persistence can continue.
 */
function sanitizeRichDelta(delta) {
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

        const link = cleaned.attributes?.link;
        if (!link || isSafeRichUrl(String(link))) return cleaned;

        delete cleaned.attributes.link;
        if (!Object.keys(cleaned.attributes).length) {
          delete cleaned.attributes;
        }
        return cleaned;
      }),
  };
}

function normalizeNewlines(text = '') {
  return text.replace(/\r\n/g, '\n');
}

function firstNormalizedLine(text = '') {
  return normalizeNewlines(text).split('\n')[0].trim();
}

function splitRelationDescription(desc = '') {
  const [label = '', ...detailLines] = normalizeNewlines(desc).split('\n');
  return {
    label: label.trim(),
    detail: detailLines.join('\n').replace(/\s+$/, ''),
  };
}

function richTextToPlainText(html = '') {
  const template = document.createElement('template');
  template.innerHTML = html;
  return (template.content.textContent || '').replace(/\s+/g, ' ').trim();
}

function richTextFirstLine(html = '') {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const blocks = doc.body.querySelectorAll('p, h1, h2, h3, li, blockquote, pre');
  for (const block of blocks) {
    const text = (block.textContent || '').replace(/\s+/g, ' ').trim();
    if (text) return text;
  }
  return firstNormalizedLine(doc.body.textContent || '');
}

function decodeHtmlEntities(text = '') {
  const textarea = document.createElement('textarea');
  textarea.innerHTML = text;
  return textarea.value;
}

function escapeHtml(text = '') {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function truncateText(text = '', maxLength) {
  return text.length > maxLength ? `${text.slice(0, maxLength - 1).trimEnd()}…` : text;
}

function extractRelationLabel(relationHtml, desc = '') {
  const plainText = relationHtml ? richTextFirstLine(relationHtml) : firstNormalizedLine(desc);
  return truncateText(plainText || 'Relationship', RELATION_LABEL_TEXT_MAX_LENGTH);
}

function formatRelationBodyHtml(relationHtml, desc = '') {
  const sanitizedRelationHtml = sanitizeRichHtml(relationHtml || '');
  if (sanitizedRelationHtml) return sanitizedRelationHtml;

  const fallback = normalizeNewlines(desc).trim();
  return `<p>${escapeHtml(fallback || 'No relationship details yet.')}</p>`;
}

function extractPageDetails(node) {
  const plainText = node.bodyHtml ? richTextToPlainText(node.bodyHtml) : '';
  return plainText || 'No page details yet.';
}

function relationAriaLabel(relation) {
  const details = truncateText(decodeHtmlEntities(relation.pageDetails), ARIA_LABEL_DETAILS_MAX_LENGTH);
  return `${relation.dir} ${relation.title}. ${details}. Press Enter or Space to open related page.`;
}

function findNode(id) {
  return nodes.value.find(n => n.id === id) ?? null;
}

function findEdge(id) {
  return edges.value.find(e => e.id === id) ?? null;
}

const rankedRelations = computed(() => {
  if (!currentId.value) return [];
  const cid = currentId.value;
  const out = [];
  for (const e of edges.value) {
    let tid = null;
    let dir = '';
    let side = '';
    if (e.fromId === cid) {
      tid = e.toId;
      dir = '→ outgoing';
      side = 'outgoing';
    } else if (e.toId === cid) {
      tid = e.fromId;
      dir = '← incoming';
      side = 'incoming';
    }
    if (!tid) continue;
    const t = findNode(tid);
    if (!t) continue;
    const relationHtml = sanitizeRichHtml(normalizeEditorHtml(e.descHtml || ''));
    let label = '';
    let detail = '';
    if (!relationHtml) {
      ({ label, detail } = splitRelationDescription(e.desc));
    }
    const relation = {
      edgeId: e.id,
      targetId: tid,
      title: t.title || '(untitled)',
      label,
      detail,
      relationHtml,
      relationBodyHtml: formatRelationBodyHtml(relationHtml, e.desc),
      dir,
      side,
      relationLabel: extractRelationLabel(relationHtml, e.desc),
      pageDetails: extractPageDetails(t),
      pageMeta: `Edited ${timeAgo(t.updatedAt)} · ${(t.visits || 0)} visit${t.visits !== 1 ? 's' : ''}`,
      score: pScore(e, t),
    };
    relation.ariaLabel = relationAriaLabel(relation);
    out.push(relation);
  }
  return out.sort((a, b) => b.score - a.score);
});

const incomingRanked = computed(() =>
  rankedRelations.value.filter(r => r.side === 'incoming')
);

const outgoingRanked = computed(() =>
  rankedRelations.value.filter(r => r.side === 'outgoing')
);

function setRelationCardRef(edgeId, el) {
  if (el) {
    relationCardEls.set(edgeId, el);
  } else {
    relationCardEls.delete(edgeId);
  }
}

function connectorPath(startX, startY, endX, endY, relationSide) {
  const curve = Math.min(120, Math.max(48, Math.abs(endX - startX) * 0.45));
  if (relationSide === 'incoming') {
    return `M ${startX} ${startY} C ${startX + curve} ${startY}, ${endX - curve} ${endY}, ${endX} ${endY}`;
  }
  return `M ${startX} ${startY} C ${startX - curve} ${startY}, ${endX + curve} ${endY}, ${endX} ${endY}`;
}

function connectorCenterVerticalOffset(centerHeight, cardMidpointY, centerTop) {
  return Math.min(
    centerHeight * CONNECTOR_CENTER_TARGET_RATIO,
    Math.max(CONNECTOR_MIN_TARGET_OFFSET, cardMidpointY - centerTop)
  );
}

function updateRelationConnectors() {
  const canvas = relationshipCanvasEl.value;
  const center = centerPanelEl.value;
  if (!canvas || !center || window.matchMedia('(max-width: 900px)').matches) {
    connectorLines.value = [];
    return;
  }

  const canvasRect = canvas.getBoundingClientRect();
  const centerRect = center.getBoundingClientRect();
  connectorCanvas.width = Math.round(canvasRect.width);
  connectorCanvas.height = Math.round(canvasRect.height);

  const nextLines = [];
  for (const r of rankedRelations.value) {
    const card = relationCardEls.get(r.edgeId);
    if (!card) continue;

    const cardRect = card.getBoundingClientRect();
    const cardMidpointY = cardRect.top - canvasRect.top + cardRect.height / 2;
    const centerTop = centerRect.top - canvasRect.top;
    const centerAttachmentY = centerTop + connectorCenterVerticalOffset(centerRect.height, cardMidpointY, centerTop);
    const isIncoming = r.side === 'incoming';
    const cardInnerX = (isIncoming ? cardRect.right : cardRect.left) - canvasRect.left;
    const centerEdgeX = (isIncoming ? centerRect.left : centerRect.right) - canvasRect.left;
    const startX = isIncoming ? cardInnerX : centerEdgeX;
    const startY = isIncoming ? cardMidpointY : centerAttachmentY;
    const endX = isIncoming ? centerEdgeX : cardInnerX;
    const endY = isIncoming ? centerAttachmentY : cardMidpointY;

    nextLines.push({
      edgeId: r.edgeId,
      path: connectorPath(startX, startY, endX, endY, r.side),
      label: truncateText(r.relationLabel, CONNECTOR_LABEL_MAX_LENGTH),
      relation: r,
      labelX: (startX + endX) / 2,
      labelY: (startY + endY) / 2 - 8,
    });
  }

  connectorLines.value = nextLines;
}

function scheduleConnectorUpdate() {
  if (connectorFrame) cancelAnimationFrame(connectorFrame);
  connectorFrame = requestAnimationFrame(() => {
    connectorFrame = null;
    updateRelationConnectors();
  });
}

function observeConnectorTargets() {
  if (!connectorResizeObserver) return;
  if (relationshipCanvasEl.value) connectorResizeObserver.observe(relationshipCanvasEl.value);
  if (centerPanelEl.value) connectorResizeObserver.observe(centerPanelEl.value);
}

function addConnectorScrollListener() {
  mainScrollEl.value?.addEventListener('scroll', scheduleConnectorUpdate, { passive: true });
}

function removeConnectorScrollListener() {
  mainScrollEl.value?.removeEventListener('scroll', scheduleConnectorUpdate);
}

// ── Quill ─────────────────────────────────────────────────────────────
function initEditor() {
  // Quill injects its toolbar as a sibling inside .editor-wrap, not inside
  // #qeditor itself. Clearing only #qeditor leaves orphaned toolbars behind.
  // Rebuild the whole wrapper so every init starts from a clean slate.
  const wrap = document.querySelector('.editor-wrap');
  if (!wrap) return;
  wrap.innerHTML = '<div id="qeditor"></div>';
  editor = new Quill('#qeditor', {
    theme: 'snow',
    placeholder: 'Write something about this page…',
    modules: {
      toolbar: RICH_CONTENT_TOOLBAR,
      uploader: {
        handler: imageUploadHandler,
      },
    },
  });
  const node = current.value;
  if (node?.bodyDelta) {
    if (!restoreEditorContents(editor, node.bodyDelta)) {
      editor.setText(node.bodyDelta);
    }
  }
  editor.on('text-change', queueSave);
}

function restoreEditorContents(quill, serializedDelta) {
  try {
    const parsed = JSON.parse(serializedDelta);
    quill.setContents(sanitizeRichDelta(parsed));
    return true;
  } catch (error) {
    console.warn('Unable to restore saved editor contents; falling back to plain text.', error);
    return false;
  }
}

function initRelationEditor() {
  try {
    relEditor = new Quill('#rel-editor', {
      theme: 'snow',
      placeholder: 'Describe this relationship. Images are supported.',
      modules: {
        toolbar: RICH_CONTENT_TOOLBAR,
        uploader: {
          handler: imageUploadHandler,
        },
      },
    });
    if (modal.descDelta) {
      if (!restoreEditorContents(relEditor, modal.descDelta)) {
        relEditor.setText(modal.desc || '');
      }
    } else if (modal.desc) {
      relEditor.setText(modal.desc);
    }
    modal.editorError = '';
  } catch (error) {
    relEditor = null;
    modal.editorError = 'Unable to initialize the relationship editor. Close this dialog and try again, or refresh the page if the problem continues.';
    console.warn(modal.editorError, error);
  }
}

function queueSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, SAVE_DELAY_MS);
}

function flush() {
  const node = current.value;
  if (node && editor) {
    node.bodyDelta = JSON.stringify(sanitizeRichDelta(editor.getContents()));
    node.bodyHtml = sanitizeRichHtml(editor.root.innerHTML);
    node.updatedAt = Date.now();
  }
  persist();
}

// ── Node CRUD ─────────────────────────────────────────────────────────
async function loadNode(id) {
  flush();
  const node = findNode(id);
  if (node) node.visits = (node.visits || 0) + 1;
  currentId.value = id;
  await nextTick();
  initEditor();
  observeConnectorTargets();
  addConnectorScrollListener();
  scheduleConnectorUpdate();
}

function createGraphNode(title = '') {
  const node = {
    id: uid(),
    title,
    bodyDelta: '',
    bodyHtml: '',
    visits: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  nodes.value.unshift(node);
  persist();
  return node;
}

function createGraphEdge(fromId, toId, desc, descDelta, descHtml, weight) {
  return { id: uid(), fromId, toId, desc, descDelta, descHtml, weight };
}

async function createNode() {
  const node = createGraphNode();
  await loadNode(node.id);
}

function deletePage() {
  const id = currentId.value;
  if (!id || !confirm('Delete this page and all its relations?')) return;
  nodes.value = nodes.value.filter(n => n.id !== id);
  edges.value = edges.value.filter(e => e.fromId !== id && e.toId !== id);
  currentId.value = null;
  editor = null;
  persist();
}

function deleteRelatedPage(id) {
  const node = findNode(id);
  if (!node || !confirm(`Delete "${node.title || '(untitled)'}" and all its relations?`)) return;
  nodes.value = nodes.value.filter(n => n.id !== id);
  edges.value = edges.value.filter(e => e.fromId !== id && e.toId !== id);
  persist();
  scheduleConnectorUpdate();
}

// ── Edges ─────────────────────────────────────────────────────────────
function openModal() {
  Object.assign(modal, {
    on: true,
    mode: 'add',
    edgeId: '',
    targetId: '',
    targetSearch: '',
    editorError: '',
    dir: 'out',
    w: DEFAULT_EDGE_WEIGHT,
    desc: '',
    descDelta: '',
  });
  openRelationEditorAfterModalUpdate();
}

function openRelationEditorAfterModalUpdate() {
  nextTick(initRelationEditor);
}

function openEditRelationModal(relation) {
  const edge = findEdge(relation.edgeId);
  const target = findNode(relation.targetId);
  if (!edge || !target) return;
  Object.assign(modal, {
    on: true,
    mode: 'edit',
    edgeId: edge.id,
    targetId: relation.targetId,
    targetSearch: target.title || '',
    editorError: '',
    dir: relation.side === 'incoming' ? 'in' : 'out',
    w: edge.weight || DEFAULT_EDGE_WEIGHT,
    desc: edge.desc || '',
    descDelta: edge.descDelta || '',
  });
  relPopover.edgeId = '';
  relPopover.pinned = false;
  openRelationEditorAfterModalUpdate();
}

function closeModal() {
  modal.on = false;
  relEditor = null;
}

function selectModalTarget(node) {
  modal.targetId = node.id;
  modal.targetSearch = node.title || '';
}

function createModalTarget() {
  const node = createGraphNode(modal.targetSearch.trim());
  selectModalTarget(node);
}

function saveRel() {
  if (!modal.targetId) return;
  if (!relEditor) {
    modal.editorError = 'Unable to save because the relationship editor is unavailable. Close this dialog and try again, or refresh the page if the problem continues.';
    return;
  }
  const cid = currentId.value;
  const from = modal.dir === 'in' ? modal.targetId : cid;
  const to = modal.dir === 'in' ? cid : modal.targetId;
  const desc = relEditor.getText().trim();
  const descDelta = JSON.stringify(sanitizeRichDelta(relEditor.getContents()));
  const descHtml = sanitizeRichHtml(normalizeEditorHtml(relEditor.root.innerHTML));
  if (modal.mode === 'edit') {
    const edge = findEdge(modal.edgeId);
    if (!edge) return;
    Object.assign(edge, {
      fromId: from,
      toId: to,
      desc,
      descDelta,
      descHtml,
      weight: modal.w,
    });
    closeModal();
    persist();
    scheduleConnectorUpdate();
    return;
  }
  edges.value.push(createGraphEdge(from, to, desc, descDelta, descHtml, modal.w));
  if (modal.dir === 'bi') {
    edges.value.push(createGraphEdge(to, from, desc, descDelta, descHtml, modal.w));
  }
  closeModal();
  persist();
}

function dropEdge(eid) {
  edges.value = edges.value.filter(e => e.id !== eid);
  persist();
  if (relPopover.edgeId === eid) {
    relPopover.edgeId = '';
    relPopover.pinned = false;
  }
  scheduleConnectorUpdate();
}

function showRelationPopover(edgeId) {
  if (relPopover.pinned && relPopover.edgeId !== edgeId) return;
  relPopover.edgeId = edgeId;
}

function hideRelationPopover() {
  if (!relPopover.pinned) relPopover.edgeId = '';
}

function toggleRelationPopover(edgeId) {
  if (relPopover.edgeId === edgeId && relPopover.pinned) {
    relPopover.edgeId = '';
    relPopover.pinned = false;
    return;
  }
  relPopover.edgeId = edgeId;
  relPopover.pinned = true;
}

function handleRelationCardClick(_evt, relation) {
  relPopover.edgeId = '';
  relPopover.pinned = false;
  loadNode(relation.targetId);
}

// ── Export ────────────────────────────────────────────────────────────
function exportData() {
  const blob = new Blob(
    [JSON.stringify({ nodes: nodes.value, edges: edges.value }, null, 2)],
    { type: 'application/json' }
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'memograph.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

// ── Click-outside: close the pages overlay when tapping away ──────────
watch(listOpen, (open, _oldValue, onCleanup) => {
  if (!open) return;
  function onPointerDown(e) {
    if (sidebarEl.value && !sidebarEl.value.contains(e.target)) {
      listOpen.value = false;
    }
  }
  document.addEventListener('pointerdown', onPointerDown);
  onCleanup(() => document.removeEventListener('pointerdown', onPointerDown));
});

watch(rankedRelations, async () => {
  await nextTick();
  scheduleConnectorUpdate();
}, { flush: 'post' });

// ── Mount ─────────────────────────────────────────────────────────────
onMounted(async () => {
  window.addEventListener('resize', scheduleConnectorUpdate);
  connectorResizeObserver = new ResizeObserver(scheduleConnectorUpdate);
  observeConnectorTargets();
  addConnectorScrollListener();

  if (nodes.value.length) {
    const latest = [...nodes.value].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0];
    await loadNode(latest.id);
  }
  scheduleConnectorUpdate();
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', scheduleConnectorUpdate);
  removeConnectorScrollListener();
  connectorResizeObserver?.disconnect();
  if (connectorFrame) cancelAnimationFrame(connectorFrame);
});

</script>
