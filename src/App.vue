<template>
  <div class="layout">
    <!-- ── Sidebar ──────────────────────────────── -->
    <div class="sidebar" ref="sidebarEl" :class="{ 'list-open': listOpen, collapsed: sidebarCollapsed }">
      <!-- Compact bar: one row with search + count + new-page (mobile, stuck only) -->
      <div class="s-compact-bar">
        <input v-model="search" placeholder="Search pages…" />
        <button class="btn-icon" :class="{ active: listOpen }" title="Pages" @click="listOpen = !listOpen">
          {{ nodes.length }}
        </button>
        <button class="btn-icon" title="Import JSON" @click="triggerImportData">↑</button>
        <button class="btn-icon" title="New Page" @click="createNode">+</button>
      </div>

      <div class="s-head">
        <div class="brand">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5" />
          </svg>
          Memograph
        </div>
        <span class="n-count">{{ nodes.length }}</span>
        <button
          class="btn-icon btn-collapse-sidebar"
          :title="sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'"
          @click="sidebarCollapsed = !sidebarCollapsed"
        >
          {{ sidebarCollapsed ? "›" : "‹" }}
        </button>
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
          @click="navigateToNode(n.id)"
        >
          {{ n.title || "(untitled)" }}
        </div>
      </div>

      <div class="s-view-toggle" role="group" aria-label="Main view">
        <button
          type="button"
          :class="{ active: mainView === 'editor' }"
          :aria-pressed="mainView === 'editor'"
          @click="selectMainView('editor')"
        >
          Editor
        </button>
        <button
          type="button"
          :class="{ active: mainView === 'graph' }"
          :aria-pressed="mainView === 'graph'"
          @click="selectMainView('graph')"
        >
          Graph
        </button>
        <button
          type="button"
          :class="{ active: mainView === 'treemap' }"
          :aria-pressed="mainView === 'treemap'"
          @click="selectMainView('treemap')"
        >
          Treemap
        </button>
        <button
          type="button"
          :class="{ active: mainView === 'myTreemap' }"
          :aria-pressed="mainView === 'myTreemap'"
          @click="selectMainView('myTreemap')"
        >
          My treemap
        </button>
      </div>

      <div class="s-foot">
        <button class="btn-new" @click="createNode">+ New Page</button>
        <button class="btn-icon" title="Import JSON" @click="triggerImportData">↑</button>
        <button class="btn-icon" title="Export JSON" @click="exportData">↓</button>
      </div>
    </div>

    <input
      ref="importFileInputEl"
      class="visually-hidden"
      type="file"
      accept="application/json,.json"
      tabindex="-1"
      aria-hidden="true"
      @change="importDataFromFile"
    />

    <!-- ── Main: editor ─────────────────────────── -->
    <div class="main" v-if="current && mainView === 'editor'">
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
              <marker
                id="rel-arrowhead"
                markerWidth="8"
                markerHeight="8"
                refX="7"
                refY="4"
                orient="auto"
                markerUnits="strokeWidth"
              >
                <path d="M 0 0 L 8 4 L 0 8 z" fill="var(--accent)" />
              </marker>
            </defs>
            <g
              v-for="line in connectorLines"
              :key="line.edgeId"
              class="rel-connector"
              :class="{ 'rel-connector--remote': line.isRemote, 'rel-connector--active': isConnectorHighlighted(line) }"
              @mouseenter="activateRelationLine(line)"
              @mouseleave="clearRelationHighlight"
            >
              <path :d="line.path" marker-end="url(#rel-arrowhead)" />
            </g>
          </svg>
          <div class="rel-connector-labels" v-show="connectorLabelLines.length">
            <div
              v-for="line in connectorLabelLines"
              :key="line.edgeId"
              class="rel-connector-hotspot"
              :class="{
                active: relPopover.edgeId === line.edgeId,
                'rel-connector-hotspot--active': isConnectorHighlighted(line),
              }"
              :style="{ left: line.labelX + 'px', top: line.labelY + 'px' }"
              @mouseenter="handleConnectorLabelEnter(line)"
              @mouseleave="handleConnectorLabelLeave"
              @focusin="handleConnectorLabelEnter(line)"
              @focusout="handleConnectorLabelLeave"
            >
              <button type="button" class="rel-connector-label" @click.stop="toggleRelationPopover(line.edgeId)">
                {{ line.label }}
              </button>
              <div v-if="relPopover.edgeId === line.edgeId" class="rel-popover" @click.stop>
                <div class="rel-popover-title">{{ line.relation.relationLabel }}</div>
                <div class="rel-popover-body" v-html="line.relation.relationBodyHtml"></div>
                <div class="rel-popover-actions">
                  <button class="btn btn-ghost" @click="openEditRelationModal(line.relation)">Edit relation</button>
                  <button class="btn btn-danger" @click="dropRelationEdge(line.relation)">Delete relation</button>
                </div>
              </div>
            </div>
          </div>

          <section class="relation-side relation-side--incoming" aria-label="Incoming relationships">
            <div class="relation-side-head">
              <span class="rel-label">Incoming</span>
              <span
                class="rel-count"
                title="Direct / visible total"
                :aria-label="relationCountLabel('incoming', incomingRanked.length, remoteIncoming.length)"
                >{{ incomingRanked.length }} / {{ incomingRanked.length + remoteIncoming.length }}</span
              >
            </div>
            <div class="rel-column" v-if="incomingRanked.length">
              <div
                v-for="r in incomingRanked"
                :key="r.edgeId"
                :ref="(el) => setRelationCardRef(r.edgeId, el)"
                class="rel-card rel-card--side"
                :class="[relationCardSizeClass(r), { 'rel-card--connected-active': isRelationCardHighlighted(r) }]"
                :style="relationCardStyle(r)"
                role="button"
                tabindex="0"
                :aria-label="r.ariaLabel"
                @mouseenter="activateRelationNode(r.targetId)"
                @mouseleave="clearRelationHighlight"
                @focusin="activateRelationNode(r.targetId)"
                @focusout="clearRelationHighlight"
                @click="handleRelationCardClick($event, r)"
                @keydown.enter.self.prevent="navigateToNode(r.targetId)"
                @keydown.space.self.prevent="navigateToNode(r.targetId)"
              >
                <div class="rel-dir">{{ r.dir }}</div>
                <div class="rel-title">{{ r.title }}</div>
                <div
                  v-if="r.pageDetailsHtml"
                  class="rel-page-details rel-page-preview rel-rich"
                  v-html="r.pageDetailsHtml"
                ></div>
                <div v-else class="rel-label-text rel-page-details">{{ r.pageDetails }}</div>
                <div class="rel-foot">
                  <span class="rel-score">P={{ r.score.toFixed(1) }}</span>
                  <span class="rel-page-meta">{{ r.pageMeta }}</span>
                </div>
                <div class="rel-card-actions">
                  <button class="rel-action" @click.stop="loadNode(r.targetId)" @keydown.stop>Edit page</button>
                  <button
                    class="rel-action rel-action--danger"
                    @click.stop="deleteRelatedPage(r.targetId)"
                    @keydown.stop
                  >
                    Delete page
                  </button>
                </div>
              </div>
            </div>
            <div class="rel-empty" v-else>No incoming relations.</div>
            <div v-if="remoteIncoming.length" class="rel-column rel-column--remote">
              <div class="rel-hop-label">Further incoming</div>
              <div
                v-for="r in remoteIncoming"
                :key="r.edgeId"
                :ref="(el) => setRelationCardRef(r.edgeId, el)"
                class="rel-card rel-card--side rel-card--remote"
                :class="[relationCardSizeClass(r), { 'rel-card--connected-active': isRelationCardHighlighted(r) }]"
                :style="relationCardStyle(r)"
                role="button"
                tabindex="0"
                :aria-label="r.ariaLabel"
                @mouseenter="activateRelationNode(r.targetId)"
                @mouseleave="clearRelationHighlight"
                @focusin="activateRelationNode(r.targetId)"
                @focusout="clearRelationHighlight"
                @click="handleRelationCardClick($event, r)"
                @keydown.enter.self.prevent="navigateToNode(r.targetId)"
                @keydown.space.self.prevent="navigateToNode(r.targetId)"
              >
                <div class="rel-dir">{{ r.dir }}</div>
                <div class="rel-title">{{ r.title }}</div>
                <div
                  v-if="r.pageDetailsHtml"
                  class="rel-page-details rel-page-preview rel-rich"
                  v-html="r.pageDetailsHtml"
                ></div>
                <div v-else class="rel-label-text rel-page-details">{{ r.pageDetails }}</div>
                <div class="rel-foot">
                  <span class="rel-score">P={{ r.score.toFixed(1) }}</span>
                  <span class="rel-page-meta">{{ r.pageMeta }}</span>
                </div>
              </div>
            </div>
          </section>

          <section
            class="resource-panel"
            :class="{ 'rel-panel--connected-active': isNodeHighlighted(currentId) }"
            ref="centerPanelEl"
            aria-label="Current page"
            @mouseenter="activateRelationNode(currentId)"
            @mouseleave="clearRelationHighlight"
            @focusin="activateRelationNode(currentId)"
            @focusout="clearRelationHighlight"
          >
            <!-- Title -->
            <div>
              <input class="page-title" v-model="current.title" placeholder="Page title…" @input="queueSave" />
              <div class="page-meta">
                <span>Edited {{ timeAgo(current.updatedAt) }}</span>
                <span>{{ current.visits || 0 }} visit{{ current.visits !== 1 ? "s" : "" }}</span>
              </div>
            </div>

            <!-- Quill editor -->
            <div class="editor-wrap" style="position: relative">
              <div data-quill-host="true">
                <div id="qeditor"></div>
              </div>
              <!-- Image resize toolbar -->
              <div
                v-if="imageResizeBar.visible"
                class="img-resize-bar"
                :style="{ top: imageResizeBar.top + 'px', left: imageResizeBar.left + 'px' }"
                @mousedown.prevent
              >
                <button @click="resizeSelectedImage(25)">25%</button>
                <button @click="resizeSelectedImage(50)">50%</button>
                <button @click="resizeSelectedImage(75)">75%</button>
                <button @click="resizeSelectedImage(100)">Full</button>
              </div>
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
              <span
                class="rel-count"
                title="Direct / visible total"
                :aria-label="relationCountLabel('outgoing', outgoingRanked.length, remoteOutgoing.length)"
                >{{ outgoingRanked.length }} / {{ outgoingRanked.length + remoteOutgoing.length }}</span
              >
            </div>
            <div class="rel-column" v-if="outgoingRanked.length">
              <div
                v-for="r in outgoingRanked"
                :key="r.edgeId"
                :ref="(el) => setRelationCardRef(r.edgeId, el)"
                class="rel-card rel-card--side"
                :class="[relationCardSizeClass(r), { 'rel-card--connected-active': isRelationCardHighlighted(r) }]"
                :style="relationCardStyle(r)"
                role="button"
                tabindex="0"
                :aria-label="r.ariaLabel"
                @mouseenter="activateRelationNode(r.targetId)"
                @mouseleave="clearRelationHighlight"
                @focusin="activateRelationNode(r.targetId)"
                @focusout="clearRelationHighlight"
                @click="handleRelationCardClick($event, r)"
                @keydown.enter.self.prevent="navigateToNode(r.targetId)"
                @keydown.space.self.prevent="navigateToNode(r.targetId)"
              >
                <div class="rel-dir">{{ r.dir }}</div>
                <div class="rel-title">{{ r.title }}</div>
                <div
                  v-if="r.pageDetailsHtml"
                  class="rel-page-details rel-page-preview rel-rich"
                  v-html="r.pageDetailsHtml"
                ></div>
                <div v-else class="rel-label-text rel-page-details">{{ r.pageDetails }}</div>
                <div class="rel-foot">
                  <span class="rel-score">P={{ r.score.toFixed(1) }}</span>
                  <span class="rel-page-meta">{{ r.pageMeta }}</span>
                </div>
                <div class="rel-card-actions">
                  <button class="rel-action" @click.stop="loadNode(r.targetId)" @keydown.stop>Edit page</button>
                  <button
                    class="rel-action rel-action--danger"
                    @click.stop="deleteRelatedPage(r.targetId)"
                    @keydown.stop
                  >
                    Delete page
                  </button>
                </div>
              </div>
            </div>
            <div class="rel-empty" v-else>No outgoing relations.</div>
            <div v-if="remoteOutgoing.length" class="rel-column rel-column--remote">
              <div class="rel-hop-label">Further outgoing</div>
              <div
                v-for="r in remoteOutgoing"
                :key="r.edgeId"
                :ref="(el) => setRelationCardRef(r.edgeId, el)"
                class="rel-card rel-card--side rel-card--remote"
                :class="[relationCardSizeClass(r), { 'rel-card--connected-active': isRelationCardHighlighted(r) }]"
                :style="relationCardStyle(r)"
                role="button"
                tabindex="0"
                :aria-label="r.ariaLabel"
                @mouseenter="activateRelationNode(r.targetId)"
                @mouseleave="clearRelationHighlight"
                @focusin="activateRelationNode(r.targetId)"
                @focusout="clearRelationHighlight"
                @click="handleRelationCardClick($event, r)"
                @keydown.enter.self.prevent="navigateToNode(r.targetId)"
                @keydown.space.self.prevent="navigateToNode(r.targetId)"
              >
                <div class="rel-dir">{{ r.dir }}</div>
                <div class="rel-title">{{ r.title }}</div>
                <div
                  v-if="r.pageDetailsHtml"
                  class="rel-page-details rel-page-preview rel-rich"
                  v-html="r.pageDetailsHtml"
                ></div>
                <div v-else class="rel-label-text rel-page-details">{{ r.pageDetails }}</div>
                <div class="rel-foot">
                  <span class="rel-score">P={{ r.score.toFixed(1) }}</span>
                  <span class="rel-page-meta">{{ r.pageMeta }}</span>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>

    <!-- ── Main: graph library preview ─────────────── -->
    <div class="main" v-else-if="current && mainView === 'graph'">
      <GraphView
        :nodes="nodes"
        :edges="edges"
        :current-id="currentId"
        variant="graph"
        @navigate="navigateToNode"
        @add-relation="openModal"
        @delete-page="deletePageFromGraph"
        @update-page="updatePageFromGraph"
        @edit-relation="editRelationFromGraph"
        @delete-relation="deleteRelationFromGraph"
      />
    </div>

    <!-- ── Main: treemap relationship overlay ─────────────── -->
    <div class="main" v-else-if="current && mainView === 'treemap'">
      <GraphView
        :nodes="nodes"
        :edges="edges"
        :current-id="currentId"
        variant="treemap"
        @navigate="navigateToNode"
        @add-relation="openModal"
        @delete-page="deletePageFromGraph"
        @update-page="updatePageFromGraph"
        @edit-relation="editRelationFromGraph"
        @delete-relation="deleteRelationFromGraph"
      />
    </div>

    <!-- ── Main: myTreemap relationship overlay ─────────────── -->
    <div class="main" v-else-if="current && mainView === 'myTreemap'">
      <MyTreemapView
        :nodes="nodes"
        :edges="edges"
        :current-id="currentId"
        variant="myTreemap"
        @navigate="navigateToNode"
        @add-relation="openModal"
        @delete-page="deletePageFromGraph"
        @update-page="updatePageFromGraph"
        @edit-relation="editRelationFromGraph"
        @delete-relation="deleteRelationFromGraph"
      />
    </div>

    <!-- ── Main: empty state ────────────────────── -->
    <div class="main" v-else>
      <div class="empty">
        <div class="empty-icon">⬡</div>
        <h2>Memograph</h2>
        <p>
          A local knowledge graph. Create pages and connect them with typed, weighted relations. Relations are ranked by
          a priority function.
        </p>
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
            Selected: {{ selectedModalTarget.title || "(untitled)" }}
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
              {{ n.title || "(untitled)" }}
            </button>
          </div>
          <button type="button" class="target-create" @click="createModalTarget">
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
        <button class="btn btn-primary" @click="saveRel" :disabled="!modal.targetId || !!modal.editorError">
          {{ modalSaveLabel }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue"
import Quill from "quill"
import { loadGraph, saveGraph } from "./services/graphRepository.js"
import { imageUploadHandler } from "./utils/imageCompression.js"
import {
  RICH_CONTENT_TOOLBAR,
  sanitizeRichHtml,
  sanitizeRichDelta,
  normalizeEditorHtml,
  sanitizeImageWidth,
} from "./utils/sanitize.js"
import {
  normalizeNewlines,
  firstNormalizedLine,
  splitRelationDescription,
  richTextToPlainText,
  richTextFirstLine,
  decodeHtmlEntities,
  escapeHtml,
  truncateText,
} from "./utils/text.js"
import { DEFAULT_EDGE_WEIGHT, pScore, timeAgo } from "./utils/scoring.js"

const GraphView = defineAsyncComponent(() => import("./components/GraphView.vue"))
const MyTreemapView = defineAsyncComponent(() => import("./components/MyTreemapView.vue"))

// Extend Quill's Image blot to persist a width style attribute.
const BaseImageBlot = Quill.import("formats/image")
class ResizableImageBlot extends BaseImageBlot {
  static formats(node) {
    const formats = super.formats(node)
    const width = sanitizeImageWidth(node.style.width)
    if (width) formats.width = width
    return formats
  }
  format(name, value) {
    if (name === "width") {
      this.domNode.style.width = sanitizeImageWidth(value) || ""
    } else {
      super.format(name, value)
    }
  }
}
ResizableImageBlot.blotName = "image"
Quill.register(ResizableImageBlot, true)

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7)

const SAVE_DELAY_MS = 500
const RELATION_LABEL_TEXT_MAX_LENGTH = 72
const CONNECTOR_LABEL_MAX_LENGTH = 54
const ARIA_LABEL_DETAILS_MAX_LENGTH = 140
const CONNECTOR_VERTICAL_THRESHOLD = 24
const CONNECTOR_MAX_CURVE = 120
const CONNECTOR_MIN_CURVE = 48
const CONNECTOR_VERTICAL_CURVE_RATIO = 0.35
const CONNECTOR_HORIZONTAL_CURVE_RATIO = 0.45
const CONNECTOR_ENDPOINT_GAP = 38
const CONNECTOR_ENDPOINT_EDGE_PADDING = 18
// Each additional hop multiplies the P score by 0.62, favoring close pages while allowing strong distant pages through.
const REMOTE_HOP_MULTIPLIER = 0.62
const REMOTE_MIN_SCORE = 4
const REMOTE_MAX_CARDS_PER_SIDE = 36
// Card sizing treats low P scores as compact and high P scores as prominent.
const CARD_SCORE_LOW = 12
const CARD_SCORE_HIGH = 30
const MAX_HOP_INDENT_LEVEL = 5
const HOP_INDENT_PX = 8
const CENTER_TRANSITION_NAME = "page-center"
const CARD_TRANSITION_NAME = "page-card"
const RELATION_CARD_TRANSITION_PREFIX = "rel-card-"
const ARROW_SEPARATOR = "\u2192"
const REMOTE_CONNECTOR_LABEL_X_OFFSET = 8
const REMOTE_CONNECTOR_MIN_ARC = 46
const REMOTE_CONNECTOR_LANE_GAP = 9
const REMOTE_CONNECTOR_MAX_LANES = 5
const REMOTE_CONNECTOR_LANE_CENTER_OFFSET = 2
const REMOTE_CONNECTOR_LABEL_Y_OFFSET = -8

const stored = loadGraph()
const nodes = ref(stored.nodes)
const edges = ref(stored.edges)

function persist() {
  try {
    saveGraph(nodes.value, edges.value)
  } catch (error) {
    console.warn("Unable to save Memograph data to localStorage.", error)
  }
}

const currentId = ref(null)
const search = ref("")
const listOpen = ref(false)
const sidebarCollapsed = ref(false)
const mainView = ref("editor")
const sidebarEl = ref(null)
const mainScrollEl = ref(null)
const relationshipCanvasEl = ref(null)
const centerPanelEl = ref(null)
const importFileInputEl = ref(null)
const connectorLines = ref([])
const connectorCanvas = reactive({ width: 0, height: 0 })
const relationCardEls = new Map()
let editor = null
let relEditor = null
let saveTimer = null
let connectorFrame = null
let connectorResizeObserver = null
const activeRelationEdgeId = ref("")
const activeRelationNodeId = ref("")
const activeRelationNodeIdSet = ref(new Set())

const imageResizeBar = reactive({
  visible: false,
  top: 0,
  left: 0,
  imageEl: null,
})

const modal = reactive({
  on: false,
  mode: "add",
  edgeId: "",
  targetId: "",
  targetSearch: "",
  editorError: "",
  dir: "out",
  w: DEFAULT_EDGE_WEIGHT,
  desc: "",
  descDelta: "",
  editFromId: "",
  editToId: "",
})
const relPopover = reactive({ edgeId: "", pinned: false })

// ── Derived ───────────────────────────────────────────────────────────
const current = computed(() => findNode(currentId.value))

const filteredNodes = computed(() =>
  nodes.value
    .filter((n) => (n.title || "").toLowerCase().includes(search.value.toLowerCase()))
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)),
)

const otherNodes = computed(() => nodes.value.filter((n) => n.id !== currentId.value))

const selectedModalTarget = computed(() => otherNodes.value.find((n) => n.id === modal.targetId) ?? null)

const modalTargetOptions = computed(() => {
  const query = modal.targetSearch.trim().toLowerCase()
  return otherNodes.value
    .filter((n) => !query || (n.title || "").toLowerCase().includes(query))
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
})

const modalTargetCreateLabel = computed(() => {
  const title = modal.targetSearch.trim()
  return title ? `"${title}"` : "untitled page"
})

const modalTitle = computed(() => (modal.mode === "edit" ? "Edit Relation" : "Add Relation"))

const modalSaveLabel = computed(() => (modal.mode === "edit" ? "Save changes" : "Save"))

const modalDirectionLabel = computed(() => {
  if (modal.mode === "edit" && modal.editFromId && modal.editToId) {
    const from = findNode(modal.editFromId)
    const to = findNode(modal.editToId)
    if (from && to) return `${from.title || "(untitled)"} ${ARROW_SEPARATOR} ${to.title || "(untitled)"}`
  }
  if (modal.dir === "in") return `Target ${ARROW_SEPARATOR} this page (incoming)`
  if (modal.dir === "bi") return "Bidirectional"
  return `This page ${ARROW_SEPARATOR} target (outgoing)`
})

function extractRelationLabel(relationHtml, desc = "") {
  const plainText = relationHtml ? richTextFirstLine(relationHtml) : firstNormalizedLine(desc)
  return truncateText(plainText || "Relationship", RELATION_LABEL_TEXT_MAX_LENGTH)
}

function formatRelationBodyHtml(relationHtml, desc = "") {
  const sanitizedRelationHtml = sanitizeRichHtml(relationHtml || "")
  if (sanitizedRelationHtml) return sanitizedRelationHtml

  const fallback = normalizeNewlines(desc).trim()
  return `<p>${escapeHtml(fallback || "No relationship details yet.")}</p>`
}

function pageDetailsHtml(node) {
  return sanitizeRichHtml(normalizeEditorHtml(node.bodyHtml || ""))
}

function extractPageDetailsFromHtml(bodyHtml) {
  const plainText = bodyHtml ? richTextToPlainText(bodyHtml) : ""
  if (plainText) return plainText

  return /<img\s[^>]*>|<img>/i.test(bodyHtml) ? "Image-only page." : "No page details yet."
}

function latestUpdatedNode() {
  return nodes.value.reduce((latest, node) => ((node.updatedAt || 0) > (latest?.updatedAt || 0) ? node : latest), null)
}

async function loadLatestNode() {
  const latest = latestUpdatedNode()
  if (latest) await loadNode(latest.id)
}

function relationAriaLabel(relation) {
  const details = truncateText(decodeHtmlEntities(relation.pageDetails), ARIA_LABEL_DETAILS_MAX_LENGTH)
  return `${relation.dir} ${relation.title}. ${details}. Press Enter or Space to open related page.`
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function importanceRatio(score) {
  return clamp((score - CARD_SCORE_LOW) / (CARD_SCORE_HIGH - CARD_SCORE_LOW), 0, 1)
}

function relationCardSizeClass(relation) {
  const ratio = importanceRatio(relation.score)
  return {
    "rel-card--small": ratio < 0.25,
    "rel-card--large": ratio > 0.7,
  }
}

function relationCardStyle(relation) {
  const ratio = importanceRatio(relation.score)
  const hop = Number.isFinite(relation.hop) ? relation.hop : 1
  const hopIndentLevel = Math.max(0, Math.min(hop - 1, MAX_HOP_INDENT_LEVEL))
  return {
    "--rel-importance": ratio.toFixed(3),
    "--rel-hop-indent": `${hopIndentLevel * HOP_INDENT_PX}px`,
  }
}

function relationCountLabel(side, directCount, remoteCount) {
  const total = directCount + remoteCount
  return `${directCount} direct ${side} relation${directCount === 1 ? "" : "s"}, ${total} visible total including further related pages`
}

function remoteHopAttenuation(hop) {
  return Math.pow(REMOTE_HOP_MULTIPLIER, hop - 1)
}

function stableTransitionToken(value) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-")
}

function relationTransitionKey(relation) {
  return relation.graphEdgeId || relation.edgeId
}

function relationTransitionName(relation) {
  return `${RELATION_CARD_TRANSITION_PREFIX}${stableTransitionToken(relationTransitionKey(relation))}`
}

function findNode(id) {
  return nodes.value.find((n) => n.id === id) ?? null
}

function findEdge(id) {
  return edges.value.find((e) => e.id === id) ?? null
}

const rankedRelations = computed(() => {
  if (!currentId.value) return []
  const cid = currentId.value
  const out = []
  for (const e of edges.value) {
    let tid = null
    let dir = ""
    let side = ""
    if (e.fromId === cid) {
      tid = e.toId
      dir = "\u2192 outgoing"
      side = "outgoing"
    } else if (e.toId === cid) {
      tid = e.fromId
      dir = "\u2190 incoming"
      side = "incoming"
    }
    if (!tid) continue
    const t = findNode(tid)
    if (!t) continue
    const relationHtml = sanitizeRichHtml(normalizeEditorHtml(e.descHtml || ""))
    let label = ""
    let detail = ""
    if (!relationHtml) {
      ;({ label, detail } = splitRelationDescription(e.desc))
    }
    const pageHtml = pageDetailsHtml(t)
    const relation = {
      edgeId: e.id,
      targetId: tid,
      title: t.title || "(untitled)",
      label,
      detail,
      relationHtml,
      relationBodyHtml: formatRelationBodyHtml(relationHtml, e.desc),
      dir,
      side,
      relationLabel: extractRelationLabel(relationHtml, e.desc),
      pageDetails: extractPageDetailsFromHtml(pageHtml),
      pageDetailsHtml: pageHtml,
      pageMeta: `Edited ${timeAgo(t.updatedAt)} \u00b7 ${t.visits || 0} visit${t.visits !== 1 ? "s" : ""}`,
      score: pScore(e, t),
      hop: 1,
      graphEdgeId: e.id,
      fromId: e.fromId,
      toId: e.toId,
    }
    relation.ariaLabel = relationAriaLabel(relation)
    out.push(relation)
  }
  return out.sort((a, b) => b.score - a.score)
})

const incomingRanked = computed(() => rankedRelations.value.filter((r) => r.side === "incoming"))

const outgoingRanked = computed(() => rankedRelations.value.filter((r) => r.side === "outgoing"))

const connectorLabelLines = computed(() => connectorLines.value.filter((line) => line.label))

function addEdgeToLookup(lookup, nodeId, edge) {
  if (!lookup.has(nodeId)) lookup.set(nodeId, [])
  lookup.get(nodeId).push(edge)
}

const edgeLookups = computed(() => {
  const byFromId = new Map()
  const byToId = new Map()
  for (const edge of edges.value) {
    addEdgeToLookup(byFromId, edge.fromId, edge)
    addEdgeToLookup(byToId, edge.toId, edge)
  }
  return { byFromId, byToId }
})

function remoteRelationCandidate(edge, node, parent, hop, side) {
  const score = pScore(edge, node) * remoteHopAttenuation(hop)
  return {
    edgeId: `${side}-hop${hop}-${edge.id}`,
    graphEdgeId: edge.id,
    targetId: node.id,
    parentEdgeId: parent.edgeId,
    fromId: edge.fromId,
    toId: edge.toId,
    score,
    hop,
    dir: side === "incoming" ? `\u2190 ${hop} steps away` : `\u2192 ${hop} steps away`,
    side,
  }
}

function hydrateRemoteRelation(relation) {
  const edge = findEdge(relation.graphEdgeId)
  const node = findNode(relation.targetId)
  if (!edge || !node) {
    console.warn(
      `Unable to render remote relation ${relation.edgeId} because edge ${relation.graphEdgeId} or target page ${relation.targetId} is missing.`,
      relation,
    )
    return null
  }
  const relationHtml = sanitizeRichHtml(normalizeEditorHtml(edge.descHtml || ""))
  const pageHtml = pageDetailsHtml(node)
  const hydrated = {
    ...relation,
    title: node.title || "(untitled)",
    relationLabel: extractRelationLabel(relationHtml, edge.desc),
    relationBodyHtml: formatRelationBodyHtml(relationHtml, edge.desc),
    pageDetails: extractPageDetailsFromHtml(pageHtml),
    pageDetailsHtml: pageHtml,
    pageMeta: `Edited ${timeAgo(node.updatedAt)} \u00b7 ${node.visits || 0} visit${node.visits !== 1 ? "s" : ""}`,
  }
  hydrated.ariaLabel = relationAriaLabel(hydrated)
  return hydrated
}

function isBetterRemoteCandidate(candidate, currentCandidate) {
  return (
    !currentCandidate ||
    candidate.score > currentCandidate.score ||
    (candidate.score === currentCandidate.score && candidate.hop < currentCandidate.hop)
  )
}

function discoverRemoteRelations(side, directRelations) {
  if (!currentId.value) return []
  const blockedNodeIds = new Set([currentId.value, ...rankedRelations.value.map((r) => r.targetId)])
  const queuedNodeIds = new Set(blockedNodeIds)
  const visibleByNodeId = new Map()
  const candidatesByEdgeId = new Map()
  const directEdgeIds = new Set(directRelations.map((r) => r.edgeId))
  const queue = directRelations.map((relation) => ({ relation, hop: 1 }))

  // First collect candidate remote cards, then add any ancestors needed to keep visible connector chains intact.
  // The traversal queue includes low-scoring candidates so high-scoring descendants can still surface.
  for (let i = 0; i < queue.length; i++) {
    const { relation: parent, hop } = queue[i]
    const nextHop = hop + 1
    const nextEdges =
      side === "incoming"
        ? edgeLookups.value.byToId.get(parent.targetId) || []
        : edgeLookups.value.byFromId.get(parent.targetId) || []

    for (const edge of nextEdges) {
      const targetId = side === "incoming" ? edge.fromId : edge.toId
      if (blockedNodeIds.has(targetId)) continue
      const node = findNode(targetId)
      if (!node) continue

      // Keep low-scoring pages in the traversal queue so stronger descendants can still surface.
      const candidate = remoteRelationCandidate(edge, node, parent, nextHop, side)
      candidatesByEdgeId.set(candidate.edgeId, candidate)
      if (isBetterRemoteCandidate(candidate, visibleByNodeId.get(node.id))) {
        if (candidate.score >= REMOTE_MIN_SCORE) {
          visibleByNodeId.set(node.id, candidate)
        }
      }
      if (queuedNodeIds.has(targetId)) continue
      queuedNodeIds.add(targetId)
      queue.push({ relation: candidate, hop: nextHop })
    }
  }

  const selectedRelations = [...visibleByNodeId.values()]
    // Select the strongest remote cards before adding ancestors needed to maintain visible connector chains.
    .sort((a, b) => b.score - a.score || a.hop - b.hop)
    .slice(0, REMOTE_MAX_CARDS_PER_SIDE)

  const selectedByEdgeId = new Map(selectedRelations.map((relation) => [relation.edgeId, relation]))
  for (const relation of selectedRelations) {
    let parentEdgeId = relation.parentEdgeId
    while (parentEdgeId && !directEdgeIds.has(parentEdgeId)) {
      const ancestor = candidatesByEdgeId.get(parentEdgeId)
      if (!ancestor) break
      selectedByEdgeId.set(ancestor.edgeId, ancestor)
      parentEdgeId = ancestor.parentEdgeId
    }
  }

  return (
    [...selectedByEdgeId.values()]
      // The final ordering includes any low-score ancestors needed to keep visible chains connected.
      .sort((a, b) => b.score - a.score || a.hop - b.hop)
      .map(hydrateRemoteRelation)
      .filter(Boolean)
  )
}

const remoteIncoming = computed(() => discoverRemoteRelations("incoming", incomingRanked.value))

const remoteOutgoing = computed(() => discoverRemoteRelations("outgoing", outgoingRanked.value))

function setRelationCardRef(edgeId, el) {
  if (el) {
    relationCardEls.set(edgeId, el)
    connectorResizeObserver?.observe(el)
  } else {
    const prev = relationCardEls.get(edgeId)
    if (prev) connectorResizeObserver?.unobserve(prev)
    relationCardEls.delete(edgeId)
  }
}

// Both sides flow left-to-right; control points pull inward for a smooth S-curve.
function connectorPath(startX, startY, endX, endY) {
  if (Math.abs(endX - startX) < CONNECTOR_VERTICAL_THRESHOLD) {
    const curveY = Math.min(
      CONNECTOR_MAX_CURVE,
      Math.max(CONNECTOR_MIN_CURVE, Math.abs(endY - startY) * CONNECTOR_VERTICAL_CURVE_RATIO),
    )
    const direction = endY >= startY ? 1 : -1
    return `M ${startX} ${startY} C ${startX} ${startY + curveY * direction}, ${endX} ${endY - curveY * direction}, ${endX} ${endY}`
  }
  const curve = Math.min(
    CONNECTOR_MAX_CURVE,
    Math.max(CONNECTOR_MIN_CURVE, Math.abs(endX - startX) * CONNECTOR_HORIZONTAL_CURVE_RATIO),
  )
  return `M ${startX} ${startY} C ${startX + curve} ${startY}, ${endX - curve} ${endY}, ${endX} ${endY}`
}

function remoteConnectorLaneX(isIncoming, endpointX, centerRect, canvasRect, laneIndex) {
  // Distribute lane units around zero (-2..2), then scale them into pixel offsets.
  const laneOffset =
    ((laneIndex % REMOTE_CONNECTOR_MAX_LANES) - REMOTE_CONNECTOR_LANE_CENTER_OFFSET) * REMOTE_CONNECTOR_LANE_GAP
  if (isIncoming) {
    const whitespaceEdge = centerRect.left - canvasRect.left - REMOTE_CONNECTOR_LABEL_X_OFFSET
    return Math.min(whitespaceEdge, endpointX + REMOTE_CONNECTOR_MIN_ARC + laneOffset)
  }
  const whitespaceEdge = centerRect.right - canvasRect.left + REMOTE_CONNECTOR_LABEL_X_OFFSET
  return Math.max(whitespaceEdge, endpointX - REMOTE_CONNECTOR_MIN_ARC - laneOffset)
}

function remoteConnectorPath(startX, startY, endX, endY, laneX) {
  return `M ${startX} ${startY} C ${laneX} ${startY}, ${laneX} ${endY}, ${endX} ${endY}`
}

function spacedEndpointY(rect, index, count, canvasTop) {
  const middleY = rect.top - canvasTop + rect.height / 2
  if (count < 2) return middleY
  const usableHeight = Math.max(0, rect.height - CONNECTOR_ENDPOINT_EDGE_PADDING * 2)
  const groupHeight = Math.min(usableHeight, (count - 1) * CONNECTOR_ENDPOINT_GAP)
  const step = groupHeight / (count - 1)
  return middleY - groupHeight / 2 + step * index
}

function registerEndpoint(endpointGroups, key, rect, baseY) {
  const endpoint = { rect, baseY, y: baseY }
  let endpoints = endpointGroups.get(key)
  if (!endpoints) {
    endpoints = []
    endpointGroups.set(key, endpoints)
  }
  endpoints.push(endpoint)
  return endpoint
}

function resolveEndpointGroups(endpointGroups, canvasTop) {
  for (const endpoints of endpointGroups.values()) {
    endpoints
      .sort((a, b) => a.baseY - b.baseY)
      .forEach((endpoint, index) => {
        endpoint.y = spacedEndpointY(endpoint.rect, index, endpoints.length, canvasTop)
      })
  }
}

function relationTouchesNode(relation, nodeId) {
  return !!nodeId && !!relation && (relation.fromId === nodeId || relation.toId === nodeId)
}

function lineEndpointNodeIds(line) {
  return [line.relation?.fromId, line.relation?.toId].filter(Boolean)
}

function activateRelationLine(line) {
  activeRelationEdgeId.value = line.edgeId
  activeRelationNodeId.value = ""
  activeRelationNodeIdSet.value = new Set(lineEndpointNodeIds(line))
}

function activateRelationNode(nodeId) {
  if (!nodeId) return
  const highlightedIds = new Set([nodeId])
  // Hover/focus enters are discrete; derive highlighting from the currently rendered connector set.
  for (const line of connectorLines.value) {
    if (!relationTouchesNode(line.relation, nodeId)) continue
    for (const endpointId of lineEndpointNodeIds(line)) highlightedIds.add(endpointId)
  }
  activeRelationEdgeId.value = ""
  activeRelationNodeId.value = nodeId
  activeRelationNodeIdSet.value = highlightedIds
}

function clearRelationHighlight() {
  activeRelationEdgeId.value = ""
  activeRelationNodeId.value = ""
  activeRelationNodeIdSet.value = new Set()
}

function isNodeHighlighted(nodeId) {
  return activeRelationNodeIdSet.value.has(nodeId)
}

function isRelationCardHighlighted(relation) {
  return isNodeHighlighted(relation.targetId)
}

function isConnectorHighlighted(line) {
  return activeRelationEdgeId.value === line.edgeId || relationTouchesNode(line.relation, activeRelationNodeId.value)
}

function handleConnectorLabelEnter(line) {
  activateRelationLine(line)
  showRelationPopover(line.edgeId)
}

function handleConnectorLabelLeave() {
  clearRelationHighlight()
  hideRelationPopover()
}

function updateRelationConnectors() {
  const canvas = relationshipCanvasEl.value
  const center = centerPanelEl.value
  if (!canvas || !center || window.matchMedia("(max-width: 900px)").matches) {
    connectorLines.value = []
    return
  }

  const canvasRect = canvas.getBoundingClientRect()
  const centerRect = center.getBoundingClientRect()
  connectorCanvas.width = Math.round(canvasRect.width)
  connectorCanvas.height = Math.round(canvasRect.height)

  const endpointGroups = new Map()
  const directConnectorDescriptors = []
  const remoteConnectorDescriptors = []

  for (const r of rankedRelations.value) {
    const card = relationCardEls.get(r.edgeId)
    if (!card) continue

    const cardRect = card.getBoundingClientRect()
    const cardMidpointY = cardRect.top - canvasRect.top + cardRect.height / 2
    const isIncoming = r.side === "incoming"
    const cardSide = isIncoming ? "right" : "left"
    const centerSide = isIncoming ? "left" : "right"
    directConnectorDescriptors.push({
      relation: r,
      isIncoming,
      cardX: (isIncoming ? cardRect.right : cardRect.left) - canvasRect.left,
      centerX: (isIncoming ? centerRect.left : centerRect.right) - canvasRect.left,
      cardEndpoint: registerEndpoint(endpointGroups, `card:${r.edgeId}:${cardSide}`, cardRect, cardMidpointY),
      centerEndpoint: registerEndpoint(endpointGroups, `center:${centerSide}`, centerRect, cardMidpointY),
    })
  }

  for (const [remoteIndex, r] of [...remoteIncoming.value, ...remoteOutgoing.value].entries()) {
    const card = relationCardEls.get(r.edgeId)
    const parent = relationCardEls.get(r.parentEdgeId)
    if (!card || !parent) continue

    const cardRect = card.getBoundingClientRect()
    const parentRect = parent.getBoundingClientRect()
    const isIncoming = r.side === "incoming"
    const cardSide = isIncoming ? "right" : "left"
    const parentSide = cardSide
    const cardX = (isIncoming ? cardRect.right : cardRect.left) - canvasRect.left
    const parentX = (isIncoming ? parentRect.right : parentRect.left) - canvasRect.left
    const cardY = cardRect.top - canvasRect.top + cardRect.height / 2
    const parentY = parentRect.top - canvasRect.top + parentRect.height / 2
    remoteConnectorDescriptors.push({
      relation: r,
      remoteIndex,
      isIncoming,
      cardX,
      parentX,
      cardEndpoint: registerEndpoint(endpointGroups, `card:${r.edgeId}:${cardSide}`, cardRect, cardY),
      parentEndpoint: registerEndpoint(endpointGroups, `card:${r.parentEdgeId}:${parentSide}`, parentRect, parentY),
    })
  }

  resolveEndpointGroups(endpointGroups, canvasRect.top)
  const nextLines = []
  for (const descriptor of directConnectorDescriptors) {
    const { relation: r, isIncoming, cardX, centerX, cardEndpoint, centerEndpoint } = descriptor
    const startX = isIncoming ? cardX : centerX
    const startY = isIncoming ? cardEndpoint.y : centerEndpoint.y
    const endX = isIncoming ? centerX : cardX
    const endY = isIncoming ? centerEndpoint.y : cardEndpoint.y

    nextLines.push({
      edgeId: r.edgeId,
      path: connectorPath(startX, startY, endX, endY),
      label: truncateText(r.relationLabel, CONNECTOR_LABEL_MAX_LENGTH),
      relation: r,
      labelX: (startX + endX) / 2,
      labelY: (startY + endY) / 2 - 8,
    })
  }

  for (const descriptor of remoteConnectorDescriptors) {
    const { relation: r, remoteIndex, isIncoming, cardX, parentX, cardEndpoint, parentEndpoint } = descriptor
    const startX = isIncoming ? cardX : parentX
    const startY = isIncoming ? cardEndpoint.y : parentEndpoint.y
    const endX = isIncoming ? parentX : cardX
    const endY = isIncoming ? parentEndpoint.y : cardEndpoint.y
    const endpointX = isIncoming ? Math.max(cardX, parentX) : Math.min(cardX, parentX)
    const laneX = remoteConnectorLaneX(isIncoming, endpointX, centerRect, canvasRect, remoteIndex)

    nextLines.push({
      edgeId: r.edgeId,
      path: remoteConnectorPath(startX, startY, endX, endY, laneX),
      label: truncateText(r.relationLabel, CONNECTOR_LABEL_MAX_LENGTH),
      relation: r,
      labelX: laneX,
      labelY: (startY + endY) / 2 + REMOTE_CONNECTOR_LABEL_Y_OFFSET,
      isRemote: true,
    })
  }

  connectorLines.value = nextLines
}

function scheduleConnectorUpdate() {
  if (connectorFrame) cancelAnimationFrame(connectorFrame)
  connectorFrame = requestAnimationFrame(() => {
    connectorFrame = null
    updateRelationConnectors()
  })
}

async function selectMainView(view) {
  if (mainView.value === view) return
  if (mainView.value === "editor") {
    flush()
    removeConnectorScrollListener()
    unobserveConnectorTargets()
  }
  mainView.value = view
  if (view === "editor") {
    await nextTick()
    initEditor()
    observeConnectorTargets()
    addConnectorScrollListener()
    scheduleConnectorUpdate()
  }
}

function observeConnectorTargets() {
  if (!connectorResizeObserver) return
  if (relationshipCanvasEl.value) connectorResizeObserver.observe(relationshipCanvasEl.value)
  if (centerPanelEl.value) connectorResizeObserver.observe(centerPanelEl.value)
}

function unobserveConnectorTargets() {
  if (!connectorResizeObserver) return
  if (relationshipCanvasEl.value) connectorResizeObserver.unobserve(relationshipCanvasEl.value)
  if (centerPanelEl.value) connectorResizeObserver.unobserve(centerPanelEl.value)
}

function addConnectorScrollListener() {
  mainScrollEl.value?.addEventListener("scroll", scheduleConnectorUpdate, { passive: true })
}

function removeConnectorScrollListener() {
  mainScrollEl.value?.removeEventListener("scroll", scheduleConnectorUpdate)
}

// ── Image resize ──────────────────────────────────────────────────────
function attachImageClickHandlers() {
  if (!editor) return
  editor.root.addEventListener("click", (e) => {
    if (e.target.tagName === "IMG") {
      showImageResizeBar(e.target)
    } else {
      hideImageResizeBar()
    }
  })
}

function showImageResizeBar(imgEl) {
  const editorRect = editor.root.getBoundingClientRect()
  const imgRect = imgEl.getBoundingClientRect()
  imageResizeBar.imageEl = imgEl
  imageResizeBar.top = imgRect.bottom - editorRect.top + editor.root.scrollTop + 4
  imageResizeBar.left = imgRect.left - editorRect.left
  imageResizeBar.visible = true
}

function hideImageResizeBar() {
  imageResizeBar.visible = false
  imageResizeBar.imageEl = null
}

function resizeSelectedImage(widthPct) {
  if (!imageResizeBar.imageEl || !editor) return
  const blot = Quill.find(imageResizeBar.imageEl)
  if (blot) {
    editor.formatText(editor.getIndex(blot), 1, "width", widthPct === 100 ? false : `${widthPct}%`, "user")
  }
  hideImageResizeBar()
  queueSave()
}

// ── Quill ─────────────────────────────────────────────────────────────
function initEditor() {
  hideImageResizeBar()
  const wrap = document.querySelector(".editor-wrap")
  if (!wrap) return
  let quillHost = wrap.querySelector('[data-quill-host="true"]')
  if (!quillHost) {
    quillHost = document.createElement("div")
    quillHost.setAttribute("data-quill-host", "true")
    wrap.insertBefore(quillHost, wrap.firstChild)
  }
  // Only the Quill-owned host is rebuilt; Vue still owns the surrounding
  // wrapper and image resize toolbar.
  quillHost.innerHTML = '<div id="qeditor"></div>'
  editor = new Quill("#qeditor", {
    theme: "snow",
    placeholder: "Write something about this page\u2026",
    modules: {
      toolbar: RICH_CONTENT_TOOLBAR,
      uploader: {
        handler: imageUploadHandler,
      },
    },
  })
  const node = current.value
  if (node?.bodyDelta) {
    if (!restoreEditorContents(editor, node.bodyDelta)) {
      editor.setText(node.bodyDelta)
    }
  }
  editor.on("text-change", queueSave)
  attachImageClickHandlers()
}

function restoreEditorContents(quill, serializedDelta) {
  try {
    const parsed = JSON.parse(serializedDelta)
    quill.setContents(sanitizeRichDelta(parsed))
    return true
  } catch (error) {
    console.warn("Unable to restore saved editor contents; falling back to plain text.", error)
    return false
  }
}

function initRelationEditor() {
  try {
    relEditor = new Quill("#rel-editor", {
      theme: "snow",
      placeholder: "Describe this relationship. Images are supported.",
      modules: {
        toolbar: RICH_CONTENT_TOOLBAR,
        uploader: {
          handler: imageUploadHandler,
        },
      },
    })
    if (modal.descDelta) {
      if (!restoreEditorContents(relEditor, modal.descDelta)) {
        relEditor.setText(modal.desc || "")
      }
    } else if (modal.desc) {
      relEditor.setText(modal.desc)
    }
    modal.editorError = ""
  } catch (error) {
    relEditor = null
    modal.editorError =
      "Unable to initialize the relationship editor. Close this dialog and try again, or refresh the page if the problem continues."
    console.warn(modal.editorError, error)
  }
}

function queueSave() {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(flush, SAVE_DELAY_MS)
}

function flush() {
  const node = current.value
  if (node && editor) {
    node.bodyDelta = JSON.stringify(sanitizeRichDelta(editor.getContents()))
    node.bodyHtml = sanitizeRichHtml(editor.root.innerHTML)
    node.updatedAt = Date.now()
  }
  persist()
}

// ── Hash routing ──────────────────────────────────────────────────────
function parseNodeIdFromHash() {
  return window.location.hash.slice(1) || null
}

function pushNodeToHash(id) {
  const currentHash = parseNodeIdFromHash()
  if (currentHash !== id) {
    history.pushState(null, "", `#${id}`)
  }
}

function onHashChange() {
  const id = parseNodeIdFromHash()
  if (id && id !== currentId.value && findNode(id)) {
    navigateToNode(id)
  }
}

// ── Node CRUD ─────────────────────────────────────────────────────────
async function loadNode(id) {
  flush()
  const node = findNode(id)
  if (node) node.visits = (node.visits || 0) + 1
  currentId.value = id
  pushNodeToHash(id)
  await nextTick()
  initEditor()
  observeConnectorTargets()
  addConnectorScrollListener()
  scheduleConnectorUpdate()
}

function visibleRelations() {
  return [...rankedRelations.value, ...remoteIncoming.value, ...remoteOutgoing.value]
}

function relationCardForTarget(targetId, sourceRelation = null) {
  const sourceKey = sourceRelation ? relationTransitionKey(sourceRelation) : ""
  let fallbackRelation = null
  for (const relation of visibleRelations()) {
    if (relation.targetId !== targetId) continue
    if (sourceKey && relationTransitionKey(relation) === sourceKey) {
      return relationCardEls.get(relation.edgeId)
    }
    fallbackRelation ??= relation
  }
  return fallbackRelation ? relationCardEls.get(fallbackRelation.edgeId) : null
}

function setCardTransitionName(relation, name, restoreFns) {
  const el = relationCardEls.get(relation.edgeId)
  if (!el) return
  const previousName = el.style.viewTransitionName
  el.style.viewTransitionName = name
  restoreFns.push(() => {
    el.style.viewTransitionName = previousName
  })
}

function markSharedCardTransitions(nextId, previousId, restoreFns) {
  const transitionKeys = new Set()
  for (const relation of visibleRelations()) {
    if (relation.targetId === nextId || relation.targetId === previousId) continue
    const key = relationTransitionKey(relation)
    if (transitionKeys.has(key)) continue
    transitionKeys.add(key)
    setCardTransitionName(relation, relationTransitionName(relation), restoreFns)
  }
  return transitionKeys
}

function applySharedCardTransitions(transitionKeys, previousId, restoreFns) {
  const appliedKeys = new Set()
  for (const relation of visibleRelations()) {
    const key = relationTransitionKey(relation)
    const isTargetPrevious = relation.targetId === previousId
    const isKeyInTransitions = transitionKeys.has(key)
    const isAlreadyApplied = appliedKeys.has(key)
    if (isTargetPrevious || !isKeyInTransitions || isAlreadyApplied) continue
    appliedKeys.add(key)
    setCardTransitionName(relation, relationTransitionName(relation), restoreFns)
  }
}

async function navigateToNode(id, sourceEl = null, sourceRelation = null) {
  if (!document.startViewTransition) {
    await loadNode(id)
    return
  }

  const previousId = currentId.value
  const oldCenter = centerPanelEl.value
  const sourceTransitionName = sourceEl?.style.viewTransitionName ?? ""
  const oldCenterTransitionName = oldCenter?.style.viewTransitionName ?? ""
  const cardTransitionRestores = []
  const sharedTransitionKeys = markSharedCardTransitions(id, previousId, cardTransitionRestores)
  let oldPageCardTransitionName = ""
  if (sourceEl) {
    sourceEl.style.viewTransitionName = CENTER_TRANSITION_NAME
    if (oldCenter) oldCenter.style.viewTransitionName = CARD_TRANSITION_NAME
  } else if (oldCenter) {
    oldCenter.style.viewTransitionName = CENTER_TRANSITION_NAME
  }

  let oldPageCard = null
  const transition = document.startViewTransition(async () => {
    if (sourceEl) sourceEl.style.viewTransitionName = "none"
    await loadNode(id)
    await nextTick()
    if (centerPanelEl.value) centerPanelEl.value.style.viewTransitionName = CENTER_TRANSITION_NAME
    applySharedCardTransitions(sharedTransitionKeys, previousId, cardTransitionRestores)
    if (sourceEl && previousId) {
      oldPageCard = relationCardForTarget(previousId, sourceRelation)
      if (oldPageCard) {
        oldPageCardTransitionName = oldPageCard.style.viewTransitionName
        oldPageCard.style.viewTransitionName = CARD_TRANSITION_NAME
      }
    }
  })

  try {
    await transition.finished
  } finally {
    if (sourceEl) sourceEl.style.viewTransitionName = sourceTransitionName
    if (oldCenter) oldCenter.style.viewTransitionName = oldCenterTransitionName
    if (oldPageCard) oldPageCard.style.viewTransitionName = oldPageCardTransitionName
    if (centerPanelEl.value) centerPanelEl.value.style.viewTransitionName = "none"
    for (const restore of cardTransitionRestores) restore()
  }
}

function createGraphNode(title = "") {
  const node = {
    id: uid(),
    title,
    bodyDelta: "",
    bodyHtml: "",
    visits: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
  nodes.value.unshift(node)
  persist()
  return node
}

function createGraphEdge(fromId, toId, desc, descDelta, descHtml, weight) {
  return { id: uid(), fromId, toId, desc, descDelta, descHtml, weight }
}

async function createNode() {
  const node = createGraphNode()
  await loadNode(node.id)
}

function deletePage() {
  const id = currentId.value
  if (!id || !confirm("Delete this page and all its relations?")) return
  nodes.value = nodes.value.filter((n) => n.id !== id)
  edges.value = edges.value.filter((e) => e.fromId !== id && e.toId !== id)
  currentId.value = null
  editor = null
  persist()
}

function deleteRelatedPage(id) {
  const node = findNode(id)
  if (!node || !confirm(`Delete "${node.title || "(untitled)"}" and all its relations?`)) return
  nodes.value = nodes.value.filter((n) => n.id !== id)
  edges.value = edges.value.filter((e) => e.fromId !== id && e.toId !== id)
  persist()
  scheduleConnectorUpdate()
}

// ── Edges ─────────────────────────────────────────────────────────────
function openModal() {
  Object.assign(modal, {
    on: true,
    mode: "add",
    edgeId: "",
    targetId: "",
    targetSearch: "",
    editorError: "",
    dir: "out",
    w: DEFAULT_EDGE_WEIGHT,
    desc: "",
    descDelta: "",
    editFromId: "",
    editToId: "",
  })
  openRelationEditorAfterModalUpdate()
}

function openRelationEditorAfterModalUpdate() {
  nextTick(initRelationEditor)
}

function openEditRelationModal(relation) {
  const edge = findEdge(relation.graphEdgeId)
  if (!edge) return
  const isCurrentRelation = edge.fromId === currentId.value || edge.toId === currentId.value
  // Remote connector labels edit the actual edge direction, so the picker represents the edge's to-node.
  const targetId = isCurrentRelation ? relation.targetId : edge.toId
  const target = findNode(targetId)
  if (!target) return
  Object.assign(modal, {
    on: true,
    mode: "edit",
    edgeId: edge.id,
    targetId,
    targetSearch: target.title || "",
    editorError: "",
    dir: isCurrentRelation && relation.side === "incoming" ? "in" : "out",
    w: edge.weight || DEFAULT_EDGE_WEIGHT,
    desc: edge.desc || "",
    descDelta: edge.descDelta || "",
    // Current-page edits derive endpoints from direction; remote edits pin the source and selected target.
    editFromId: isCurrentRelation ? "" : edge.fromId,
    editToId: isCurrentRelation ? "" : edge.toId,
  })
  relPopover.edgeId = ""
  relPopover.pinned = false
  openRelationEditorAfterModalUpdate()
}

function closeModal() {
  modal.on = false
  relEditor = null
}

function selectModalTarget(node) {
  modal.targetId = node.id
  modal.targetSearch = node.title || ""
  // Remote relation edits keep their original source and update only the selected target.
  if (modal.editFromId) modal.editToId = node.id
}

function createModalTarget() {
  const node = createGraphNode(modal.targetSearch.trim())
  selectModalTarget(node)
}

function relationEndpointsForSave() {
  const cid = currentId.value
  if (modal.editFromId) {
    return { from: modal.editFromId, to: modal.editToId }
  }
  return {
    from: modal.dir === "in" ? modal.targetId : cid,
    to: modal.dir === "in" ? cid : modal.targetId,
  }
}

function saveRel() {
  if (!modal.targetId) return
  if (!relEditor) {
    modal.editorError =
      "Unable to save because the relationship editor is unavailable. Close this dialog and try again, or refresh the page if the problem continues."
    return
  }
  const { from, to } = relationEndpointsForSave()
  const desc = relEditor.getText().trim()
  const descDelta = JSON.stringify(sanitizeRichDelta(relEditor.getContents()))
  const descHtml = sanitizeRichHtml(normalizeEditorHtml(relEditor.root.innerHTML))
  if (modal.mode === "edit") {
    const edge = findEdge(modal.edgeId)
    if (!edge) return
    Object.assign(edge, {
      fromId: from,
      toId: to,
      desc,
      descDelta,
      descHtml,
      weight: modal.w,
    })
    closeModal()
    persist()
    scheduleConnectorUpdate()
    return
  }
  edges.value.push(createGraphEdge(from, to, desc, descDelta, descHtml, modal.w))
  if (modal.dir === "bi") {
    edges.value.push(createGraphEdge(to, from, desc, descDelta, descHtml, modal.w))
  }
  closeModal()
  persist()
}

function dropEdge(eid) {
  edges.value = edges.value.filter((e) => e.id !== eid)
  persist()
  if (relPopover.edgeId === eid) {
    relPopover.edgeId = ""
    relPopover.pinned = false
  }
  scheduleConnectorUpdate()
}

function dropRelationEdge(relation) {
  if (relation.graphEdgeId) dropEdge(relation.graphEdgeId)
}

function deletePageFromGraph(id) {
  if (id === currentId.value) {
    deletePage()
    return
  }
  deleteRelatedPage(id)
}

function updatePageFromGraph({ id, title, bodyDelta, bodyHtml }) {
  const node = findNode(id)
  if (!node) return
  let pageDelta = null
  if (bodyDelta) {
    try {
      pageDelta = sanitizeRichDelta(JSON.parse(bodyDelta))
    } catch (error) {
      console.warn("Unable to parse graph editor Delta; keeping the previous editor Delta.", error)
    }
  }
  node.title = (title ?? "").trim()
  node.bodyHtml = sanitizeRichHtml(normalizeEditorHtml(bodyHtml || ""))
  if (pageDelta) node.bodyDelta = JSON.stringify(pageDelta)
  node.updatedAt = Date.now()
  persist()
}

function graphRelationForEdge(edge) {
  const isCurrentRelation = edge.fromId === currentId.value || edge.toId === currentId.value
  const isIncoming = isCurrentRelation && edge.toId === currentId.value
  const targetId = isIncoming ? edge.fromId : edge.toId
  return {
    graphEdgeId: edge.id,
    targetId,
    side: isIncoming ? "incoming" : "outgoing",
  }
}

function editRelationFromGraph(edge) {
  openEditRelationModal(graphRelationForEdge(edge))
}

function deleteRelationFromGraph(edge) {
  dropEdge(edge.id)
}

function showRelationPopover(edgeId) {
  if (relPopover.pinned && relPopover.edgeId !== edgeId) return
  relPopover.edgeId = edgeId
}

function hideRelationPopover() {
  if (!relPopover.pinned) relPopover.edgeId = ""
}

function toggleRelationPopover(edgeId) {
  if (relPopover.edgeId === edgeId && relPopover.pinned) {
    relPopover.edgeId = ""
    relPopover.pinned = false
    return
  }
  relPopover.edgeId = edgeId
  relPopover.pinned = true
}

function handleRelationCardClick(evt, relation) {
  relPopover.edgeId = ""
  relPopover.pinned = false
  navigateToNode(relation.targetId, evt.currentTarget, relation)
}

// ── Export ────────────────────────────────────────────────────────────
function triggerImportData() {
  importFileInputEl.value?.click()
}

function finiteNumberOr(value, fallback) {
  return Number.isFinite(value) ? value : fallback
}

function stringOr(value, fallback = "") {
  return typeof value === "string" ? value : fallback
}

function parseImportedGraph(raw) {
  const parsed = JSON.parse(raw)
  if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) {
    throw new Error('Import must be a JSON object with "nodes" and "edges" arrays.')
  }

  const nodeIds = new Set()
  let invalidNodeCount = 0
  const importedNodes = []
  const importedAt = Date.now()
  for (const node of parsed.nodes) {
    if (!node || typeof node !== "object" || typeof node.id !== "string" || !node.id || nodeIds.has(node.id)) {
      invalidNodeCount++
      continue
    }

    nodeIds.add(node.id)
    importedNodes.push({
      ...node,
      title: stringOr(node.title),
      bodyDelta: stringOr(node.bodyDelta),
      bodyHtml: stringOr(node.bodyHtml),
      visits: finiteNumberOr(node.visits, 0),
      createdAt: finiteNumberOr(node.createdAt, importedAt),
      updatedAt: finiteNumberOr(node.updatedAt, importedAt),
    })
  }

  const edgeIds = new Set()
  let invalidEdgeCount = 0
  const importedEdges = []
  for (const edge of parsed.edges) {
    const isValidEdge =
      edge &&
      typeof edge === "object" &&
      typeof edge.id === "string" &&
      !!edge.id &&
      !edgeIds.has(edge.id) &&
      typeof edge.fromId === "string" &&
      typeof edge.toId === "string" &&
      nodeIds.has(edge.fromId) &&
      nodeIds.has(edge.toId)

    if (!isValidEdge) {
      invalidEdgeCount++
      continue
    }

    edgeIds.add(edge.id)
    importedEdges.push({
      ...edge,
      desc: stringOr(edge.desc),
      descDelta: stringOr(edge.descDelta),
      descHtml: stringOr(edge.descHtml),
      weight: finiteNumberOr(edge.weight, DEFAULT_EDGE_WEIGHT),
    })
  }

  if (invalidNodeCount || invalidEdgeCount) {
    const problems = []
    if (invalidNodeCount) problems.push(`${invalidNodeCount} invalid node${invalidNodeCount === 1 ? "" : "s"}`)
    if (invalidEdgeCount) problems.push(`${invalidEdgeCount} invalid edge${invalidEdgeCount === 1 ? "" : "s"}`)
    throw new Error(
      `Import rejected: ${problems.join(" and ")} found. Node IDs must be non-empty and unique, and edge IDs must be non-empty and unique with valid node references.`,
    )
  }

  return { nodes: importedNodes, edges: importedEdges }
}

async function importDataFromFile(event) {
  const fileInput = event.target
  const file = fileInput.files?.[0]
  fileInput.value = ""
  if (!file) return

  try {
    const imported = parseImportedGraph(await file.text())
    if (!confirm("Import this graph and replace the current local Memograph data?")) return

    clearTimeout(saveTimer)
    modal.on = false
    editor = null
    relEditor = null
    relPopover.edgeId = ""
    relPopover.pinned = false
    currentId.value = null
    nodes.value = imported.nodes
    edges.value = imported.edges
    persist()

    await nextTick()
    if (nodes.value.length) {
      await loadLatestNode()
    } else {
      scheduleConnectorUpdate()
    }
  } catch (error) {
    console.warn("Unable to import Memograph data.", error)
    alert(
      `Unable to import that file. ${error.message || "The file must be a valid Memograph JSON export with nodes and edges arrays."}`,
    )
  }
}

function exportData() {
  const blob = new Blob([JSON.stringify({ nodes: nodes.value, edges: edges.value }, null, 2)], {
    type: "application/json",
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = "memograph.json"
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

// ── Click-outside: close the pages overlay when tapping away ──────────
watch(listOpen, (open, _oldValue, onCleanup) => {
  if (!open) return
  function onPointerDown(e) {
    if (sidebarEl.value && !sidebarEl.value.contains(e.target)) {
      listOpen.value = false
    }
  }
  document.addEventListener("pointerdown", onPointerDown)
  onCleanup(() => document.removeEventListener("pointerdown", onPointerDown))
})

watch(
  [rankedRelations, remoteIncoming, remoteOutgoing],
  async () => {
    await nextTick()
    scheduleConnectorUpdate()
  },
  { flush: "post" },
)

// ── Mount ─────────────────────────────────────────────────────────────
onMounted(async () => {
  window.addEventListener("resize", scheduleConnectorUpdate)
  connectorResizeObserver = new ResizeObserver(scheduleConnectorUpdate)
  observeConnectorTargets()
  addConnectorScrollListener()
  window.addEventListener("hashchange", onHashChange)

  const idFromHash = parseNodeIdFromHash()
  if (idFromHash && findNode(idFromHash)) {
    await loadNode(idFromHash)
  } else if (nodes.value.length) {
    await loadLatestNode()
  }
  scheduleConnectorUpdate()
})

onBeforeUnmount(() => {
  window.removeEventListener("resize", scheduleConnectorUpdate)
  window.removeEventListener("hashchange", onHashChange)
  removeConnectorScrollListener()
  connectorResizeObserver?.disconnect()
  if (connectorFrame) cancelAnimationFrame(connectorFrame)
})
</script>
