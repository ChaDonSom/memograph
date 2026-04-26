<template>
<div class="layout">

  <!-- ── Sidebar ──────────────────────────────── -->
  <div class="sidebar" :class="{ 'list-open': listOpen }">

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
    <div class="main-scroll">

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

      <!-- Page actions -->
      <div class="page-actions">
        <button class="btn btn-danger" @click="deletePage">Delete page</button>
      </div>

      <!-- Relations -->
      <div class="rel-section">
        <div class="rel-head">
          <span class="rel-label">Relations</span>
          <button class="btn-add-rel" @click="openModal">+ Add relation</button>
        </div>

        <div class="rel-grid" v-if="ranked.length">
          <div
            v-for="r in ranked"
            :key="r.edgeId"
            class="rel-card"
            @click="loadNode(r.targetId)"
            @mouseenter="showPrev($event, r.targetId)"
            @mouseleave="hidePrev"
          >
            <div class="rel-dir">{{ r.dir }}</div>
            <!-- Incoming: other page is the subject, its title leads -->
            <template v-if="r.dir.startsWith('←')">
              <div class="rel-title">{{ r.title }}</div>
              <div class="rel-label-text" v-if="r.label">{{ r.label }}</div>
              <div class="rel-detail" v-if="r.detail">{{ r.detail }}</div>
            </template>
            <!-- Outgoing: relation label is the predicate, target title follows -->
            <template v-else>
              <div class="rel-label-text" v-if="r.label">{{ r.label }}</div>
              <div class="rel-title">{{ r.title }}</div>
              <div class="rel-detail" v-if="r.detail">{{ r.detail }}</div>
            </template>
            <div class="rel-foot">
              <span class="rel-score">P={{ r.score.toFixed(1) }}</span>
              <button class="rel-del" @click.stop="dropEdge(r.edgeId)" title="Remove relation">✕</button>
            </div>
          </div>
        </div>

        <div class="rel-empty" v-else>
          No relations yet. Add one above to connect this page to another.
        </div>
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

<!-- ── Hover preview ────────────────────────── -->
<div
  class="preview"
  v-show="prev.on"
  :style="{ top: prev.y + 'px', left: prev.x + 'px' }"
>
  <div class="preview-title">{{ prev.title }}</div>
  <div class="preview-body" v-html="prev.html"></div>
  <div class="preview-fade"></div>
</div>

<!-- ── Add relation modal ────────────────────── -->
<div class="overlay" v-if="modal.on" @click.self="closeModal">
  <div class="modal">
    <div class="modal-title">Add Relation</div>

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
      <textarea
        v-model="modal.desc"
        placeholder="First line is the relation label. Add more lines for details shown below the related page title."
      ></textarea>
    </div>

    <div class="field">
      <label>Direction</label>
      <select v-model="modal.dir">
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
      <button class="btn btn-primary" @click="saveRel" :disabled="!modal.targetId">Save</button>
    </div>
  </div>
</div>
</template>

<script setup>
import { computed, nextTick, onMounted, reactive, ref } from 'vue';
import Quill from 'quill';
import { loadGraph, saveGraph } from './services/graphRepository.js';

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

const DEFAULT_EDGE_WEIGHT = 5;
const SAVE_DELAY_MS = 500;
const MS_PER_DAY = 86_400_000;
const PREVIEW_WIDTH = 300;
const PREVIEW_GUTTER = 18;
const PREVIEW_HEIGHT_WITH_GUTTER = 230;

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
  saveGraph(nodes.value, edges.value);
}

const currentId = ref(null);
const search = ref('');
const listOpen = ref(false);
let editor = null;
let saveTimer = null;

const modal = reactive({
  on: false,
  targetId: '',
  targetSearch: '',
  desc: '',
  dir: 'out',
  w: DEFAULT_EDGE_WEIGHT,
});
const prev = reactive({ on: false, title: '', html: '', x: 0, y: 0 });

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

function splitRelationDescription(desc = '') {
  const [label = '', ...detailLines] = desc.replace(/\r\n/g, '\n').split('\n');
  return {
    label: label.trim(),
    detail: detailLines.join('\n').replace(/\s+$/, ''),
  };
}

function findNode(id) {
  return nodes.value.find(n => n.id === id) ?? null;
}

const ranked = computed(() => {
  if (!currentId.value) return [];
  const cid = currentId.value;
  const out = [];
  for (const e of edges.value) {
    let tid = null;
    let dir = '';
    if (e.fromId === cid) {
      tid = e.toId;
      dir = '→ outgoing';
    } else if (e.toId === cid) {
      tid = e.fromId;
      dir = '← incoming';
    }
    if (!tid) continue;
    const t = findNode(tid);
    if (!t) continue;
    const relationText = splitRelationDescription(e.desc);
    out.push({
      edgeId: e.id,
      targetId: tid,
      title: t.title || '(untitled)',
      label: relationText.label,
      detail: relationText.detail,
      dir,
      score: pScore(e, t),
    });
  }
  return out.sort((a, b) => b.score - a.score);
});

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
      toolbar: [
        ['bold', 'italic', 'underline', 'strike'],
        [{ header: [1, 2, 3, false] }],
        ['blockquote', 'code-block'],
        [{ list: 'ordered' }, { list: 'bullet' }],
        ['link'],
        ['clean'],
      ]
    },
  });
  const node = current.value;
  if (node?.bodyDelta) {
    try {
      editor.setContents(JSON.parse(node.bodyDelta));
    } catch {
      editor.setText(node.bodyDelta);
    }
  }
  editor.on('text-change', queueSave);
}

function queueSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, SAVE_DELAY_MS);
}

function flush() {
  const node = current.value;
  if (node && editor) {
    node.bodyDelta = JSON.stringify(editor.getContents());
    node.bodyHtml = editor.root.innerHTML;
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

// ── Edges ─────────────────────────────────────────────────────────────
function openModal() {
  Object.assign(modal, {
    on: true,
    targetId: '',
    targetSearch: '',
    desc: '',
    dir: 'out',
    w: DEFAULT_EDGE_WEIGHT,
  });
}

function closeModal() {
  modal.on = false;
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
  const cid = currentId.value;
  const from = modal.dir === 'in' ? modal.targetId : cid;
  const to = modal.dir === 'in' ? cid : modal.targetId;
  edges.value.push({ id: uid(), fromId: from, toId: to, desc: modal.desc, weight: modal.w });
  if (modal.dir === 'bi') {
    edges.value.push({ id: uid(), fromId: to, toId: from, desc: modal.desc, weight: modal.w });
  }
  modal.on = false;
  persist();
}

function dropEdge(eid) {
  edges.value = edges.value.filter(e => e.id !== eid);
  persist();
}

// ── Hover preview ─────────────────────────────────────────────────────
function showPrev(evt, tid) {
  const t = findNode(tid);
  if (!t) return;
  const rect = evt.currentTarget.getBoundingClientRect();
  const x = Math.min(rect.right + 12, window.innerWidth - PREVIEW_WIDTH - PREVIEW_GUTTER);
  const y = Math.max(8, Math.min(rect.top, window.innerHeight - PREVIEW_HEIGHT_WITH_GUTTER));
  prev.title = t.title || '(untitled)';
  prev.html = t.bodyHtml || '<em style="opacity:.45">No content yet.</em>';
  prev.x = x;
  prev.y = y;
  prev.on = true;
}

function hidePrev() { prev.on = false; }

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

// ── Mount ─────────────────────────────────────────────────────────────
onMounted(async () => {
  if (nodes.value.length) {
    const latest = [...nodes.value].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0];
    await loadNode(latest.id);
  }
});

</script>
