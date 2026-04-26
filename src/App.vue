<template>
<div class="layout">

  <!-- ── Sidebar ──────────────────────────────── -->
  <div class="sidebar">
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
              <div class="rel-desc" v-if="r.desc">{{ r.desc }}</div>
            </template>
            <!-- Outgoing: description is the predicate, target title follows -->
            <template v-else>
              <div class="rel-desc" v-if="r.desc">{{ r.desc }}</div>
              <div class="rel-title">{{ r.title }}</div>
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
      <button class="btn btn-primary" style="margin-top:4px" @click="createNode">Create first page</button>
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
<div class="overlay" v-if="modal.on" @click.self="modal.on = false">
  <div class="modal">
    <div class="modal-title">Add Relation</div>

    <div class="field">
      <label>Target page</label>
      <select v-model="modal.targetId">
        <option value="">— select a page —</option>
        <option v-for="n in otherNodes" :key="n.id" :value="n.id">
          {{ n.title || '(untitled)' }}
        </option>
      </select>
    </div>

    <div class="field">
      <label>Description / label</label>
      <textarea
        v-model="modal.desc"
        placeholder="e.g. 'raced on dirt ovals', 'created from scratch in 1904', 'good sim racing progression after Ford 999'…"
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
      <button class="btn btn-ghost" @click="modal.on = false">Cancel</button>
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

// Score = explicit weight (dominant) + visit popularity + recency decay.
// This determines the ranking order of relation cards on each page.
function pScore(edge, target) {
  const w       = (edge.weight || 5) * 3;                          // weight 1-10
  const pop     = Math.log2((target.visits || 0) + 1) * 2;          // visit popularity
  const days    = (Date.now() - (target.updatedAt || 0)) / 86_400_000;
  const recency = 8 * Math.exp(-days / 7);                          // decays over ~7 days
  return w + pop + recency;
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
const nodes  = ref(stored.nodes);
const edges  = ref(stored.edges);

function persist() {
  saveGraph(nodes.value, edges.value);
}

const currentId = ref(null);
const search    = ref('');
let Q           = null;   // Quill instance (not reactive)
let saveTimer   = null;

const modal = reactive({ on: false, targetId: '', desc: '', dir: 'out', w: 5 });
const prev  = reactive({ on: false, title: '', html: '', x: 0, y: 0 });

// ── Derived ───────────────────────────────────────────────────────────
const current = computed(() =>
  nodes.value.find(n => n.id === currentId.value) ?? null
);

const filteredNodes = computed(() =>
  nodes.value
    .filter(n => (n.title || '').toLowerCase().includes(search.value.toLowerCase()))
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
);

const otherNodes = computed(() =>
  nodes.value.filter(n => n.id !== currentId.value)
);

const ranked = computed(() => {
  if (!currentId.value) return [];
  const cid = currentId.value;
  const out = [];
  for (const e of edges.value) {
    let tid = null, dir = '';
    if (e.fromId === cid)      { tid = e.toId;   dir = '→ outgoing'; }
    else if (e.toId === cid)   { tid = e.fromId; dir = '← incoming'; }
    if (!tid) continue;
    const t = nodes.value.find(n => n.id === tid);
    if (!t) continue;
    out.push({
      edgeId:   e.id,
      targetId: tid,
      title:    t.title || '(untitled)',
      desc:     e.desc || '',
      dir,
      score:    pScore(e, t),
    });
  }
  return out.sort((a, b) => b.score - a.score);
});

// ── Quill ─────────────────────────────────────────────────────────────
function initQ() {
  // Quill injects its toolbar as a sibling inside .editor-wrap, not inside
  // #qeditor itself. Clearing only #qeditor leaves orphaned toolbars behind.
  // Rebuild the whole wrapper so every init starts from a clean slate.
  const wrap = document.querySelector('.editor-wrap');
  if (!wrap) return;
  wrap.innerHTML = '<div id="qeditor"></div>';
  Q = new Quill('#qeditor', {
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
    }
  });
  const node = current.value;
  if (node?.bodyDelta) {
    try { Q.setContents(JSON.parse(node.bodyDelta)); }
    catch { Q.setText(node.bodyDelta); }
  }
  Q.on('text-change', queueSave);
}

function queueSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 500);
}

function flush() {
  const node = current.value;
  if (node && Q) {
    node.bodyDelta  = JSON.stringify(Q.getContents());
    node.bodyHtml   = Q.root.innerHTML;
    node.updatedAt  = Date.now();
  }
  persist();
}

// ── Node CRUD ─────────────────────────────────────────────────────────
async function loadNode(id) {
  flush();
  const node = nodes.value.find(n => n.id === id);
  if (node) node.visits = (node.visits || 0) + 1;
  currentId.value = id;
  await nextTick();
  initQ();
}

async function createNode() {
  const node = {
    id: uid(), title: '',
    bodyDelta: '', bodyHtml: '',
    visits: 0,
    createdAt: Date.now(), updatedAt: Date.now(),
  };
  nodes.value.unshift(node);
  persist();
  await loadNode(node.id);
}

function deletePage() {
  const id = currentId.value;
  if (!id || !confirm('Delete this page and all its relations?')) return;
  nodes.value  = nodes.value.filter(n => n.id !== id);
  edges.value  = edges.value.filter(e => e.fromId !== id && e.toId !== id);
  currentId.value = null;
  Q = null;
  persist();
}

// ── Edges ─────────────────────────────────────────────────────────────
function openModal() {
  Object.assign(modal, { on: true, targetId: '', desc: '', dir: 'out', w: 5 });
}

function saveRel() {
  if (!modal.targetId) return;
  const cid  = currentId.value;
  const from = modal.dir === 'in' ? modal.targetId : cid;
  const to   = modal.dir === 'in' ? cid : modal.targetId;
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
  const t = nodes.value.find(n => n.id === tid);
  if (!t) return;
  const rect = evt.currentTarget.getBoundingClientRect();
  // Position to the right; clamp so it doesn't overflow viewport
  const x = Math.min(rect.right + 12, window.innerWidth - 318);
  const y = Math.max(8, Math.min(rect.top, window.innerHeight - 230));
  prev.title = t.title || '(untitled)';
  prev.html  = t.bodyHtml || '<em style="opacity:.45">No content yet.</em>';
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
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'memograph.json';
  a.click();
}

// ── Mount ─────────────────────────────────────────────────────────────
onMounted(async () => {
  if (nodes.value.length) {
    const latest = [...nodes.value].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0];
    await loadNode(latest.id);
  }
});
</script>
