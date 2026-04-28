<template>
  <div class="memo-graph-view">
    <div class="memo-graph-toolbar">
      <div>
        <div class="memo-graph-kicker">Bounded block map</div>
        <h2>Focused relationship masonry</h2>
      </div>
      <div class="memo-graph-toolbar-summary">
        {{ visibleTiles.length }} blocks · {{ routedEdges.length }} conduits
      </div>
      <div class="memo-graph-toolbar-actions">
        <button class="btn btn-ghost" @click="$emit('add-relation')">+ Add relation</button>
      </div>
    </div>

    <div ref="stageEl" class="memo-map-stage">
      <svg
        class="memo-map-routes"
        :width="stageSize.width"
        :height="stageSize.height"
        :viewBox="`0 0 ${stageSize.width} ${stageSize.height}`"
        aria-hidden="true"
      >
        <defs>
          <marker
            id="memo-map-arrowhead"
            markerWidth="10"
            markerHeight="10"
            refX="9"
            refY="5"
            orient="auto"
            markerUnits="userSpaceOnUse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--accent)" />
          </marker>
          <mask
            id="memo-map-route-card-mask"
            maskUnits="userSpaceOnUse"
            x="0"
            y="0"
            :width="stageSize.width"
            :height="stageSize.height"
          >
            <rect :width="stageSize.width" :height="stageSize.height" fill="white" />
            <rect
              v-for="tile in visibleTiles"
              :key="`route-mask-${tile.id}`"
              :x="tile.rect.x - ROUTE_MASK_CARD_BLEED"
              :y="tile.rect.y - ROUTE_MASK_CARD_BLEED"
              :width="tile.rect.width + ROUTE_MASK_CARD_BLEED * 2"
              :height="tile.rect.height + ROUTE_MASK_CARD_BLEED * 2"
              :rx="ROUTE_MASK_CARD_BORDER_RADIUS"
              fill="black"
            />
          </mask>
        </defs>
        <path
          v-for="route in routedEdges"
          :key="`${route.id}-hit`"
          class="memo-map-route-hit"
          :d="route.path"
          :style="{ strokeWidth: route.hitStrokeWidth }"
          mask="url(#memo-map-route-card-mask)"
          @mouseenter="activateRoute(route)"
          @mouseleave="clearHighlight"
        />
        <path
          v-for="route in routedEdges"
          :key="route.id"
          class="memo-map-route"
          :class="{
            'memo-map-route--focused': route.touchesFocus,
            'memo-map-route--active': isRouteActive(route),
          }"
          :d="route.path"
          :style="{ strokeWidth: route.strokeWidth }"
          mask="url(#memo-map-route-card-mask)"
          marker-end="url(#memo-map-arrowhead)"
          @mouseenter="activateRoute(route)"
          @mouseleave="clearHighlight"
        />
      </svg>

      <div
        v-for="tile in visibleTiles"
        :key="tile.id"
        role="button"
        tabindex="0"
        :aria-pressed="tile.isFocus ? 'true' : 'false'"
        :aria-label="`${tile.title}. ${tile.roleLabel}. Select page.`"
        class="memo-map-tile"
        :class="{
          'memo-map-tile--focus': tile.isFocus,
          'memo-map-tile--remote': tile.hop > 1,
          'memo-map-tile--connected-active': isTileActive(tile.id),
        }"
        :style="tile.style"
        @click="handleTileClick(tile)"
        @keydown.enter.prevent="handleTileKeydown($event, tile)"
        @keydown.space.prevent="handleTileKeydown($event, tile)"
        @mouseenter="activateNode(tile.id)"
        @mouseleave="clearHighlight"
        @focusin="activateNode(tile.id)"
        @focusout="clearHighlightIfFocusLeaves"
      >
        <span class="memo-map-tile-topline">
          <span>{{ tile.roleLabel }}</span>
          <span>P={{ tile.scoreLabel }}</span>
        </span>
        <form
          v-if="editingTileId === tile.id"
          class="memo-map-tile-editor"
          @click.stop
          @submit.prevent="saveTileEdit"
        >
          <input
            v-model="tileDraft.title"
            class="memo-map-tile-title-input"
            placeholder="Page title…"
            @keydown.stop
          />
          <textarea
            v-model="tileDraft.bodyText"
            class="memo-map-tile-body-input"
            placeholder="Page details…"
            @keydown.stop
          ></textarea>
          <span class="memo-map-tile-editor-actions">
            <button type="submit" class="memo-map-action">Save</button>
            <button type="button" class="memo-map-action" @click="cancelTileEdit">Cancel</button>
          </span>
        </form>
        <template v-else>
          <span class="memo-map-tile-title">{{ tile.title }}</span>
          <span
            v-if="tile.bodyHtml"
            class="memo-map-tile-body rel-rich"
            v-html="tile.bodyHtml"
          ></span>
          <span v-else class="memo-map-tile-body memo-map-tile-body--empty">
            No page details yet.
          </span>
          <span class="memo-map-tile-meta">{{ tile.meta }}</span>
          <span class="memo-map-tile-actions" @click.stop>
            <button type="button" class="memo-map-action" :aria-label="`Edit ${tile.title}`" @click="startTileEdit(tile)" @keydown.stop>Edit page</button>
            <button type="button" class="memo-map-action memo-map-action--danger" :aria-label="`Delete ${tile.title}`" @click="$emit('delete-page', tile.id)" @keydown.stop>Delete page</button>
          </span>
        </template>
      </div>

      <div
        v-for="label in routeLabels"
        :key="label.id"
        class="memo-map-route-label"
        :class="{
          'memo-map-route-label--vertical': label.vertical,
          'memo-map-route-label--active': isRouteActive(label.route),
        }"
        :style="label.style"
        @mouseenter="activateRoute(label.route)"
        @mouseleave="clearHighlight"
        @focusin="activateRoute(label.route)"
        @focusout="clearHighlightIfFocusLeaves"
      >
        <button type="button" class="memo-map-route-label-button">
          {{ label.label }}
        </button>
        <div class="memo-map-route-popover">
          <div class="memo-map-route-popover-title">{{ label.label }}</div>
          <div class="memo-map-route-popover-body" v-html="label.bodyHtml"></div>
          <div class="memo-map-route-popover-actions">
            <button class="btn btn-ghost" @click.stop="$emit('edit-relation', label.edge)">Edit relation</button>
            <button class="btn btn-danger" @click.stop="$emit('delete-relation', label.edge)">Delete relation</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { DEFAULT_EDGE_WEIGHT, pScore, timeAgo } from '../utils/scoring.js';
import { normalizeEditorHtml, sanitizeRichHtml } from '../utils/sanitize.js';
import { richTextFirstLine, truncateText } from '../utils/text.js';

const props = defineProps({
  nodes: { type: Array, required: true },
  edges: { type: Array, required: true },
  currentId: { type: String, default: '' },
});

const emit = defineEmits(['navigate', 'add-relation', 'delete-page', 'update-page', 'edit-relation', 'delete-relation']);

const stageEl = ref(null);
const stageSize = reactive({ width: 0, height: 0 });
const activeNodeId = ref('');
const activeEdgeId = ref('');
const editingTileId = ref('');
const tileDraft = reactive({ title: '', bodyText: '' });
let resizeObserver = null;

const OUTER_PADDING = 18;
const MAP_CELL_GAP = 18;
const MAP_MIN_COLUMNS = 5;
const MAP_MAX_COLUMNS = 7;
const MAP_MIN_ROWS = 5;
const MAP_MAX_ROWS = 7;
const FOCUS_ZONE_RADIUS = 1;
const FOCUS_RESERVED_CELL_COUNT = Math.pow(FOCUS_ZONE_RADIUS * 2 + 1, 2) - 1;
const MAP_MAX_HOP_RING = Math.floor(Math.max(MAP_MAX_ROWS, MAP_MAX_COLUMNS) / 2);
const ANGLE_SPREAD_BINS = 5;
const ANGLE_SPREAD_CENTER = 2;
const ANGLE_SPREAD_STEP = Math.PI / 10;
const MAX_HOP_ANGLE_OFFSET = 2;
const HOP_ANGLE_STEP = Math.PI / 14;
const MIN_MAP_TILE_WIDTH = 150;
const MIN_MAP_TILE_HEIGHT = 92;
const MAX_MAP_TILE_HEIGHT = 180;
const MIN_FOCUS_HEIGHT = 190;
const FOCUS_WIDTH_RATIO = 0.3;
const FOCUS_HEIGHT_RATIO = 0.34;
const MIN_FOCUS_WIDTH = 230;
const MAP_CARD_MIN_WIDTH_RATIO = 0.74;
const MAP_CARD_MAX_WIDTH_RATIO = 0.96;
const MAP_CARD_BASE_WIDTH_RATIO = 0.72;
const MAP_CARD_WIDTH_WEIGHT_SCALE = 0.06;
const MAP_CARD_MIN_HEIGHT_RATIO = 0.62;
const MAP_CARD_MAX_HEIGHT_RATIO = 0.94;
const MAP_CARD_HEIGHT_WEIGHT_SCALE = 0.08;
const MAX_VISIBLE_TILES = 28;
const FOCUS_MIN_SCORE = 36;
const HOP_DECAY = 0.58;
const CONTENT_SCORE_CAP = 12;
const HTML_RICHNESS_SCORE_CAP = 10;
const ENDPOINT_STEP = 12;
const FOCUS_SCORE_BOOST_RATIO = 1.08;
// When the map has only a few blocks, lower the focus floor to 72% so two adjacent blocks can grow toward one third of the screen.
const MIN_FOCUS_FALLBACK_RATIO = 0.72;
const MIN_TILES_FOR_BALANCED_FOCUS = 3;
const MIN_TILE_FONT_SIZE = 10;
const TILE_FONT_SCALE = 24;
const FOCUS_MAX_FONT_SIZE = 18;
const TILE_MAX_FONT_SIZE = 16;
const MIN_VERTICAL_LABEL_LENGTH = 60;
const ROUTE_EDGE_PADDING = 18;
const ROUTE_CARD_CLEARANCE = 6;
const ROUTE_MASK_CARD_BLEED = 3;
const ROUTE_MASK_CARD_BORDER_RADIUS = 13;
const ROUTE_CORNER_RADIUS = 9;
const LANE_STEP = 12;
const LABEL_DEFAULT_OFFSET = 12;
const ROUTE_HIT_PADDING = 10;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function compareNumberAsc(a, b) {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function escapeText(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function nodeBodyHtml(node) {
  return sanitizeRichHtml(normalizeEditorHtml(node.bodyHtml || ''));
}

function preservePlainTextFromHtml(html) {
  if (!html) return '';

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const blockTags = new Set([
    'address', 'article', 'aside', 'blockquote', 'div', 'dl', 'dt', 'dd', 'fieldset', 'figcaption',
    'figure', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hr', 'li', 'main',
    'nav', 'ol', 'p', 'pre', 'section', 'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'tr', 'ul',
  ]);

  function walk(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent?.replace(/[^\S\n]+/g, ' ') || '';
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return '';

    const tag = node.tagName.toLowerCase();
    if (tag === 'br') return '\n';

    const content = Array.from(node.childNodes).map(walk).join('');
    if (blockTags.has(tag)) {
      const trimmedContent = content.replace(/^\n+|\n+$/g, '');
      return trimmedContent ? `\n\n${trimmedContent}\n\n` : '\n\n';
    }

    return content;
  }

  return walk(doc.body)
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function plainTextFromHtml(html) {
  return preservePlainTextFromHtml(html) || (/<img\s[^>]*>|<img>/i.test(html) ? 'Image-only page.' : '');
}

function richnessFromHtml(html) {
  const imageScore = (html.match(/<img\b/gi)?.length || 0) * 4;
  const headingScore = (html.match(/<h[1-6]\b/gi)?.length || 0) * 1.6;
  const listScore = (html.match(/<(ul|ol|li)\b/gi)?.length || 0) * 0.7;
  const emphasisScore = (html.match(/<(strong|em|blockquote|pre|a)\b/gi)?.length || 0) * 0.8;
  return clamp(imageScore + headingScore + listScore + emphasisScore, 0, HTML_RICHNESS_SCORE_CAP);
}

function relationLabel(edge) {
  const html = sanitizeRichHtml(normalizeEditorHtml(edge.descHtml || ''));
  return truncateText(richTextFirstLine(html) || edge.desc || 'Relationship', 64);
}

function relationBodyHtml(edge) {
  const html = sanitizeRichHtml(normalizeEditorHtml(edge.descHtml || ''));
  if (html) return html;
  return `<p>${edge.desc ? escapeText(edge.desc) : 'No relationship details yet.'}</p>`;
}

const nodesById = computed(() =>
  new Map(props.nodes.map(node => [node.id, node]))
);

const nodeContentStats = computed(() =>
  new Map(props.nodes.map(node => {
    const html = nodeBodyHtml(node);
    const plainText = plainTextFromHtml(html);
    return [node.id, {
      html,
      plainText,
      richness: richnessFromHtml(html),
    }];
  }))
);

const degreeStats = computed(() => {
  const stats = new Map(props.nodes.map(node => [node.id, { incoming: 0, outgoing: 0, weight: 0 }]));
  for (const edge of props.edges) {
    const fromStats = stats.get(edge.fromId);
    const toStats = stats.get(edge.toId);
    const weight = edge.weight || DEFAULT_EDGE_WEIGHT;

    if (fromStats) {
      fromStats.outgoing++;
      fromStats.weight += weight;
    }

    if (toStats) {
      toStats.incoming++;
      toStats.weight += weight;
    }
  }
  return stats;
});

const bestExistingPScores = computed(() => {
  const scores = new Map(props.nodes.map(node => [node.id, 0]));
  for (const edge of props.edges) {
    const from = nodesById.value.get(edge.fromId);
    const to = nodesById.value.get(edge.toId);
    if (from) scores.set(from.id, Math.max(scores.get(from.id) || 0, pScore(edge, from) * 0.35));
    if (to) scores.set(to.id, Math.max(scores.get(to.id) || 0, pScore(edge, to) * 0.35));
  }
  return scores;
});

const focusedDistances = computed(() => {
  const currentId = props.currentId;
  if (!currentId) return new Map();
  const distances = new Map([[currentId, { hop: 0, side: 'focus', relationWeight: DEFAULT_EDGE_WEIGHT }]]);
  const queue = [currentId];
  for (let i = 0; i < queue.length; i++) {
    const nodeId = queue[i];
    const current = distances.get(nodeId);
    for (const edge of props.edges) {
      let nextId = '';
      let side = current.side;
      if (edge.fromId === nodeId) {
        nextId = edge.toId;
        if (current.hop === 0) side = 'outgoing';
      } else if (edge.toId === nodeId) {
        nextId = edge.fromId;
        if (current.hop === 0) side = 'incoming';
      }
      if (!nextId || distances.has(nextId)) continue;
      distances.set(nextId, {
        hop: current.hop + 1,
        side,
        relationWeight: edge.weight || DEFAULT_EDGE_WEIGHT,
      });
      queue.push(nextId);
    }
  }
  return distances;
});

function focusedPScore(node) {
  const distance = focusedDistances.value.get(node.id);
  if (!distance) return 0;
  if (node.id === props.currentId) return FOCUS_MIN_SCORE;

  const stats = degreeStats.value.get(node.id) || { incoming: 0, outgoing: 0, weight: 0 };
  const content = nodeContentStats.value.get(node.id) || { plainText: '', richness: 0 };
  const contentLength = content.plainText.length;
  const contentScore = clamp(Math.log2(contentLength + 1) * 1.45, 0, CONTENT_SCORE_CAP);
  const richnessScore = content.richness;
  const visitScore = Math.log2((node.visits || 0) + 1) * 1.8;
  const degreeScore = Math.log2(stats.incoming + stats.outgoing + 1) * 3;
  const directEdgeScore = distance.relationWeight * 2.6;
  const existingPScore = bestExistingPScores.value.get(node.id) || 0;

  return (directEdgeScore + contentScore + richnessScore + visitScore + degreeScore + existingPScore)
    * Math.pow(HOP_DECAY, Math.max(0, distance.hop - 1));
}

const visibleNodeModels = computed(() => {
  const models = props.nodes
    .map(node => {
      const distance = focusedDistances.value.get(node.id);
      return {
        node,
        hop: distance?.hop ?? Number.POSITIVE_INFINITY,
        side: distance?.side ?? 'remote',
        score: focusedPScore(node),
      };
    })
    .filter(model => model.node.id === props.currentId || model.score > 0)
    .sort((a, b) => {
      if (a.node.id === props.currentId) return -1;
      if (b.node.id === props.currentId) return 1;
      return a.hop - b.hop || b.score - a.score;
    })
    .slice(0, MAX_VISIBLE_TILES);

  if (models.length <= MIN_TILES_FOR_BALANCED_FOCUS && models.length > 1) {
    const relatedModels = models.filter(model => model.node.id !== props.currentId);
    if (!relatedModels.length) return models;
    const averageRelatedScore = relatedModels.reduce((sum, model) => sum + model.score, 0) / relatedModels.length;
    const focus = models.find(model => model.node.id === props.currentId);
    if (focus) {
      focus.score = Math.max(
        averageRelatedScore * FOCUS_SCORE_BOOST_RATIO,
        FOCUS_MIN_SCORE * MIN_FOCUS_FALLBACK_RATIO
      );
    }
  }

  return models;
});

function tileWeight(model) {
  return model.score > 1 ? Math.sqrt(model.score) : 1;
}

/**
 * Map grids must be odd-sized so the focused block can occupy a true center cell.
 * If adding one would exceed the maximum, the max is already odd and remains valid.
 */
function ensureOddInRange(value, min, max) {
  const clamped = clamp(value, min, max);
  return clamped % 2 === 0 ? Math.min(max, clamped + 1) : clamped;
}

function mapColumnCount(width, visibleTileCount) {
  const preferred = width >= 980 || visibleTileCount > 20 ? MAP_MAX_COLUMNS : MAP_MIN_COLUMNS;
  return ensureOddInRange(preferred, MAP_MIN_COLUMNS, MAP_MAX_COLUMNS);
}

function mapRowCount(visibleTileCount, columns) {
  return ensureOddInRange(Math.ceil((visibleTileCount + FOCUS_RESERVED_CELL_COUNT) / columns), MAP_MIN_ROWS, MAP_MAX_ROWS);
}

function relationAngle(model) {
  if (model.node.id === props.currentId) return 0;
  const base = model.side === 'incoming' ? Math.PI : 0;
  const spread = ((hashValue(model.node.id) % ANGLE_SPREAD_BINS) - ANGLE_SPREAD_CENTER) * ANGLE_SPREAD_STEP;
  const hopOffset = Math.min(MAX_HOP_ANGLE_OFFSET, Math.max(0, model.hop - 1)) * HOP_ANGLE_STEP;
  return base + spread + hopOffset;
}

function angleDistance(angleA, angleB) {
  // Minimum distance between two directions on a circle, including wraparound across 0/2π.
  const fullCircle = Math.PI * 2;
  const delta = Math.abs(((angleA - angleB + Math.PI) % fullCircle + fullCircle) % fullCircle - Math.PI);
  return delta;
}

/**
 * Simple non-cryptographic string hash used only to fan equal-priority cards
 * into deterministic map positions.
 */
function hashValue(value) {
  let hash = 0;
  for (const char of String(value)) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash;
}

function compareStackModels(a, b) {
  return compareNumberAsc(a.hop, b.hop)
    || compareNumberAsc(b.score, a.score)
    || a.node.id.localeCompare(b.node.id);
}

function mapCells(columns, rows, bounds) {
  const cellWidth = (bounds.width - MAP_CELL_GAP * (columns - 1)) / columns;
  const cellHeight = (bounds.height - MAP_CELL_GAP * (rows - 1)) / rows;
  const centerCol = Math.floor(columns / 2);
  const centerRow = Math.floor(rows / 2);
  const cells = [];

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < columns; col++) {
      const dx = col - centerCol;
      const dy = row - centerRow;
      const isFocusZone = Math.abs(dx) <= FOCUS_ZONE_RADIUS && Math.abs(dy) <= FOCUS_ZONE_RADIUS;
      cells.push({
        col,
        row,
        dx,
        dy,
        isFocusZone,
        ring: Math.max(Math.abs(dx), Math.abs(dy)),
        angle: Math.atan2(dy, dx),
        x: bounds.x + col * (cellWidth + MAP_CELL_GAP),
        y: bounds.y + row * (cellHeight + MAP_CELL_GAP),
        width: cellWidth,
        height: cellHeight,
      });
    }
  }

  return cells;
}

function mergedCellBounds(cells) {
  const left = Math.min(...cells.map(cell => cell.x));
  const top = Math.min(...cells.map(cell => cell.y));
  const right = Math.max(...cells.map(cell => cell.x + cell.width));
  const bottom = Math.max(...cells.map(cell => cell.y + cell.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function cardRectForCell(model, cell, isFocus = false) {
  const weight = tileWeight(model);
  const widthRatio = isFocus
    ? FOCUS_WIDTH_RATIO
    : clamp(
      MAP_CARD_BASE_WIDTH_RATIO + weight * MAP_CARD_WIDTH_WEIGHT_SCALE,
      MAP_CARD_MIN_WIDTH_RATIO,
      MAP_CARD_MAX_WIDTH_RATIO
    );
  const heightRatio = isFocus
    ? FOCUS_HEIGHT_RATIO
    : clamp(
      MAP_CARD_MIN_HEIGHT_RATIO + weight * MAP_CARD_HEIGHT_WEIGHT_SCALE,
      MAP_CARD_MIN_HEIGHT_RATIO,
      MAP_CARD_MAX_HEIGHT_RATIO
    );
  const width = isFocus
    ? clamp(stageSize.width * FOCUS_WIDTH_RATIO, Math.min(MIN_FOCUS_WIDTH, cell.width), cell.width)
    : clamp(cell.width * widthRatio, Math.min(MIN_MAP_TILE_WIDTH, cell.width), cell.width);
  const height = isFocus
    ? clamp(stageSize.height * FOCUS_HEIGHT_RATIO, Math.min(MIN_FOCUS_HEIGHT, cell.height), cell.height)
    : clamp(cell.height * heightRatio, Math.min(MIN_MAP_TILE_HEIGHT, cell.height), Math.min(MAX_MAP_TILE_HEIGHT, cell.height));

  return {
    x: cell.x + (cell.width - width) / 2,
    y: cell.y + (cell.height - height) / 2,
    width,
    height,
  };
}

function assignMapCell(model, availableCells, usedCells) {
  const preferredAngle = relationAngle(model);
  const targetRing = clamp(model.hop || 1, 1, MAP_MAX_HOP_RING);
  let cell = null;
  for (const candidate of availableCells) {
    if (usedCells.has(`${candidate.col}:${candidate.row}`)) continue;
    // Prefer the requested hop ring, then relation angle, then stable map order.
    const order = cell
      ? compareNumberAsc(Math.abs(candidate.ring - targetRing), Math.abs(cell.ring - targetRing))
        || compareNumberAsc(angleDistance(candidate.angle, preferredAngle), angleDistance(cell.angle, preferredAngle))
        || compareNumberAsc(candidate.ring, cell.ring)
        || compareNumberAsc(candidate.row, cell.row)
        || compareNumberAsc(candidate.col, cell.col)
      : -1;
    if (order < 0) cell = candidate;
  }
  if (cell) usedCells.add(`${cell.col}:${cell.row}`);
  return cell;
}

const layoutState = computed(() => {
  const width = stageSize.width - OUTER_PADDING * 2;
  const height = stageSize.height - OUTER_PADDING * 2;
  if (width <= 0 || height <= 0) return { models: [] };

  const models = visibleNodeModels.value;
  const focus = models.find(model => model.node.id === props.currentId);
  if (!focus) return { models: [] };

  const columns = mapColumnCount(width, models.length);
  const rows = mapRowCount(models.length, columns);
  const cells = mapCells(columns, rows, { x: OUTER_PADDING, y: OUTER_PADDING, width, height });
  const focusCells = cells.filter(cell => cell.isFocusZone);
  const centerCell = cells.find(cell => cell.dx === 0 && cell.dy === 0);
  const usedCells = new Set(focusCells.map(cell => `${cell.col}:${cell.row}`));
  const availableCells = cells.filter(cell => !cell.isFocusZone);
  const laidOut = [];

  laidOut.push({
    ...focus,
    mapCol: centerCell.col,
    mapRow: centerCell.row,
    ...cardRectForCell(focus, mergedCellBounds(focusCells), true),
  });

  const relatedModels = models
    .filter(model => model.node.id !== props.currentId)
    .sort(compareStackModels)
    .slice(0, availableCells.length);

  for (const model of relatedModels) {
    const cell = assignMapCell(model, availableCells, usedCells);
    if (!cell) continue;
    laidOut.push({
      ...model,
      mapCol: cell.col,
      mapRow: cell.row,
      ...cardRectForCell(model, cell),
    });
  }

  return { models: laidOut };
});

const layoutModels = computed(() => layoutState.value.models);

function roleLabel(model) {
  if (model.node.id === props.currentId) return 'Focused page';
  if (model.hop > 1) return `${model.hop} hops ${model.side === 'incoming' ? 'in' : 'out'}`;
  return model.side === 'incoming' ? 'Incoming' : 'Outgoing';
}

const visibleTiles = computed(() =>
  layoutModels.value.map(model => {
    const areaRatio = clamp((model.width * model.height) / Math.max(1, stageSize.width * stageSize.height), 0, 1);
    const fontSize = clamp(
      MIN_TILE_FONT_SIZE + Math.sqrt(areaRatio) * TILE_FONT_SCALE,
      MIN_TILE_FONT_SIZE,
      model.node.id === props.currentId ? FOCUS_MAX_FONT_SIZE : TILE_MAX_FONT_SIZE
    );
    const contentStats = nodeContentStats.value.get(model.node.id);
    const bodyHtml = contentStats?.html || '';
    return {
      id: model.node.id,
      isFocus: model.node.id === props.currentId,
      hop: model.hop,
      title: model.node.title || '(untitled)',
      roleLabel: roleLabel(model),
      scoreLabel: model.score.toFixed(1),
      bodyHtml,
      bodyText: contentStats?.plainText || '',
      meta: `Edited ${timeAgo(model.node.updatedAt)} · ${model.node.visits || 0} visit${model.node.visits === 1 ? '' : 's'}`,
      rect: model,
      style: {
        left: `${model.x}px`,
        top: `${model.y}px`,
        width: `${model.width}px`,
        height: `${model.height}px`,
        fontSize: `${fontSize}px`,
      },
    };
  })
);

const tileRects = computed(() =>
  new Map(visibleTiles.value.map(tile => [tile.id, tile.rect]))
);

const visibleEdges = computed(() =>
  props.edges
    .filter(edge => tileRects.value.has(edge.fromId) && tileRects.value.has(edge.toId))
);

function rectCenter(rect) {
  return {
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2,
  };
}

function routeSidesForRects(from, to) {
  const fromCenter = rectCenter(from);
  const toCenter = rectCenter(to);
  const dx = toCenter.x - fromCenter.x;
  const dy = toCenter.y - fromCenter.y;

  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0
      ? { startSide: 'right', endSide: 'left', axis: 'x', direction: 'right' }
      : { startSide: 'left', endSide: 'right', axis: 'x', direction: 'left' };
  }

  return dy >= 0
    ? { startSide: 'bottom', endSide: 'top', axis: 'y', direction: 'down' }
    : { startSide: 'top', endSide: 'bottom', axis: 'y', direction: 'up' };
}

function pointOutsideRect(rect, side, offset) {
  if (side === 'left' || side === 'right') {
    return {
      x: side === 'left' ? rect.x - ROUTE_CARD_CLEARANCE : rect.x + rect.width + ROUTE_CARD_CLEARANCE,
      y: clamp(rectCenter(rect).y + offset, rect.y + ROUTE_EDGE_PADDING, rect.y + rect.height - ROUTE_EDGE_PADDING),
    };
  }
  return {
    x: clamp(rectCenter(rect).x + offset, rect.x + ROUTE_EDGE_PADDING, rect.x + rect.width - ROUTE_EDGE_PADDING),
    y: side === 'top' ? rect.y - ROUTE_CARD_CLEARANCE : rect.y + rect.height + ROUTE_CARD_CLEARANCE,
  };
}

function distributeOffset(index, count, step = ENDPOINT_STEP) {
  return (index - (count - 1) / 2) * step;
}

function mapLaneCoordinate(start, end, axis, index, count) {
  const min = ROUTE_EDGE_PADDING;
  const max = axis === 'x' ? stageSize.width - ROUTE_EDGE_PADDING : stageSize.height - ROUTE_EDGE_PADDING;
  const base = axis === 'x' ? (start.x + end.x) / 2 : (start.y + end.y) / 2;
  if (count <= 1) return clamp(base, min, max);
  const available = Math.max(1, max - min);
  const step = Math.min(LANE_STEP, available / (count - 1));
  return clamp(base + distributeOffset(index, count, step), min, max);
}

function roundedOrthogonalPath(points) {
  if (points.length < 2) return '';
  const commands = [`M ${points[0].x} ${points[0].y}`];
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1];
    const current = points[i];
    const next = points[i + 1];
    const incomingDistance = Math.abs(current.x - prev.x) + Math.abs(current.y - prev.y);
    const outgoingDistance = Math.abs(next.x - current.x) + Math.abs(next.y - current.y);
    const radius = Math.min(ROUTE_CORNER_RADIUS, incomingDistance / 2, outgoingDistance / 2);
    if (radius <= 0) {
      commands.push(`L ${current.x} ${current.y}`);
      continue;
    }
    const before = {
      x: current.x + Math.sign(prev.x - current.x) * radius,
      y: current.y + Math.sign(prev.y - current.y) * radius,
    };
    const after = {
      x: current.x + Math.sign(next.x - current.x) * radius,
      y: current.y + Math.sign(next.y - current.y) * radius,
    };
    commands.push(`L ${before.x} ${before.y}`);
    commands.push(`Q ${current.x} ${current.y} ${after.x} ${after.y}`);
  }
  const last = points[points.length - 1];
  commands.push(`L ${last.x} ${last.y}`);
  return commands.join(' ');
}

function labelRotation(vertical, startY, endY) {
  if (!vertical) return 0;
  return endY < startY ? -90 : 90;
}

function compareRoutePlansByMapLane(a, b) {
  return compareNumberAsc(a.sortLane, b.sortLane) || a.edge.id.localeCompare(b.edge.id);
}

const routedEdges = computed(() => {
  const plans = visibleEdges.value.map(edge => {
    const from = tileRects.value.get(edge.fromId);
    const to = tileRects.value.get(edge.toId);
    const sides = routeSidesForRects(from, to);
    const fromCenter = rectCenter(from);
    const toCenter = rectCenter(to);
    return {
      edge,
      from,
      to,
      ...sides,
      sortLane: sides.axis === 'x' ? (fromCenter.y + toCenter.y) / 2 : (fromCenter.x + toCenter.x) / 2,
    };
  });

  const endpointOffsets = new Map();
  const endpointGroups = new Map();
  for (const plan of plans) {
    const fromCenter = rectCenter(plan.from);
    const toCenter = rectCenter(plan.to);
    const endpoints = [
      { id: plan.edge.id, key: `${plan.edge.fromId}:${plan.startSide}`, endpoint: 'start', sort: plan.startSide === 'top' || plan.startSide === 'bottom' ? toCenter.x : toCenter.y },
      { id: plan.edge.id, key: `${plan.edge.toId}:${plan.endSide}`, endpoint: 'end', sort: plan.endSide === 'top' || plan.endSide === 'bottom' ? fromCenter.x : fromCenter.y },
    ];
    for (const endpoint of endpoints) {
      if (!endpointGroups.has(endpoint.key)) endpointGroups.set(endpoint.key, []);
      endpointGroups.get(endpoint.key).push(endpoint);
    }
  }
  for (const endpoints of endpointGroups.values()) {
    endpoints
      .sort((a, b) => compareNumberAsc(a.sort, b.sort) || a.id.localeCompare(b.id))
      .forEach((endpoint, index) => {
        endpointOffsets.set(`${endpoint.id}:${endpoint.endpoint}`, distributeOffset(index, endpoints.length));
      });
  }

  const laneGroups = new Map();
  const laneIndexes = new Map();
  for (const plan of plans) {
    const key = `${plan.axis}:${plan.direction}`;
    if (!laneGroups.has(key)) laneGroups.set(key, []);
    laneGroups.get(key).push(plan);
  }
  for (const group of laneGroups.values()) {
    group
      .sort(compareRoutePlansByMapLane)
      .forEach((plan, index) => laneIndexes.set(plan.edge.id, { index, count: group.length }));
  }

  return plans.map(plan => {
    const { edge } = plan;
    const start = pointOutsideRect(plan.from, plan.startSide, endpointOffsets.get(`${edge.id}:start`) || 0);
    const end = pointOutsideRect(plan.to, plan.endSide, endpointOffsets.get(`${edge.id}:end`) || 0);
    const lane = laneIndexes.get(edge.id) || { index: 0, count: 1 };
    const lanePosition = mapLaneCoordinate(start, end, plan.axis, lane.index, lane.count);
    const points = plan.axis === 'x'
      ? [start, { x: lanePosition, y: start.y }, { x: lanePosition, y: end.y }, end]
      : [start, { x: start.x, y: lanePosition }, { x: end.x, y: lanePosition }, end];

    const strokeWidth = 1.1 + Math.min(1.8, (edge.weight || DEFAULT_EDGE_WEIGHT) / 8);
    return {
      id: edge.id,
      edge,
      fromId: edge.fromId,
      toId: edge.toId,
      points,
      startX: start.x,
      startY: start.y,
      endX: end.x,
      endY: end.y,
      path: roundedOrthogonalPath(points),
      label: relationLabel(edge),
      bodyHtml: relationBodyHtml(edge),
      touchesFocus: edge.fromId === props.currentId || edge.toId === props.currentId,
      strokeWidth,
      hitStrokeWidth: strokeWidth + ROUTE_HIT_PADDING,
    };
  });
});

/**
 * Chooses the clearest label position, preferring long horizontal route segments before vertical fallbacks.
 */
function routeLabelPlacement(route) {
  const segments = [];
  for (let index = 1; index < route.points.length; index++) {
    const start = route.points[index - 1];
    const end = route.points[index];
    const horizontal = start.y === end.y;
    const vertical = start.x === end.x;
    if (!horizontal && !vertical) continue;
    segments.push({
      start,
      end,
      vertical,
      length: horizontal ? Math.abs(end.x - start.x) : Math.abs(end.y - start.y),
    });
  }
  const horizontal = segments
    .filter(segment => !segment.vertical && segment.length >= 42)
    .sort((a, b) => b.length - a.length)[0];
  const segment = horizontal || segments.sort((a, b) => b.length - a.length)[0];
  if (!segment) {
    return {
      x: (route.startX + route.endX) / 2,
      y: (route.startY + route.endY) / 2 - LABEL_DEFAULT_OFFSET,
      vertical: false,
      rotation: 0,
    };
  }
  const vertical = !horizontal && segment.vertical && segment.length >= MIN_VERTICAL_LABEL_LENGTH;
  return {
    x: (segment.start.x + segment.end.x) / 2,
    y: (segment.start.y + segment.end.y) / 2,
    vertical,
    rotation: labelRotation(vertical, segment.start.y, segment.end.y),
  };
}

const routeLabels = computed(() =>
  routedEdges.value.map(route => {
    const placement = routeLabelPlacement(route);
    return {
      id: route.id,
      label: route.label,
      bodyHtml: route.bodyHtml,
      route,
      edge: route.edge,
      vertical: placement.vertical,
      style: {
        left: `${placement.x}px`,
        top: `${placement.y}px`,
        '--memo-label-rotation': `${placement.rotation}deg`,
      },
    };
  })
);

function handleTileClick(tile) {
  if (tile.id !== props.currentId) emit('navigate', tile.id);
}

function handleTileKeydown(event, tile) {
  if (event.target !== event.currentTarget) return;
  handleTileClick(tile);
}

function startTileEdit(tile) {
  editingTileId.value = tile.id;
  tileDraft.title = tile.title;
  tileDraft.bodyText = tile.bodyText || '';
}

function cancelTileEdit() {
  editingTileId.value = '';
  tileDraft.title = '';
  tileDraft.bodyText = '';
}

function saveTileEdit() {
  if (!editingTileId.value) return;
  emit('update-page', {
    id: editingTileId.value,
    title: tileDraft.title,
    bodyText: tileDraft.bodyText,
  });
  cancelTileEdit();
}

function activateNode(nodeId) {
  activeNodeId.value = nodeId;
  activeEdgeId.value = '';
}

function activateRoute(route) {
  activeEdgeId.value = route.id;
  activeNodeId.value = '';
}

function clearHighlight() {
  activeNodeId.value = '';
  activeEdgeId.value = '';
}

function clearHighlightIfFocusLeaves(event) {
  const nextTarget = event.relatedTarget;
  if (!nextTarget || !event.currentTarget.contains(nextTarget)) clearHighlight();
}

function routeTouchesActiveNode(route) {
  return !!activeNodeId.value && (route.fromId === activeNodeId.value || route.toId === activeNodeId.value);
}

function isRouteActive(route) {
  return activeEdgeId.value === route.id || routeTouchesActiveNode(route);
}

function isTileActive(tileId) {
  if (!tileId) return false;
  if (activeNodeId.value === tileId) return true;
  if (activeEdgeId.value) {
    const activeRoute = routedEdges.value.find(route => route.id === activeEdgeId.value);
    return !!activeRoute && (activeRoute.fromId === tileId || activeRoute.toId === tileId);
  }
  if (!activeNodeId.value) return false;
  return routedEdges.value.some(route => routeTouchesActiveNode(route) && (route.fromId === tileId || route.toId === tileId));
}

function updateStageSize() {
  const rect = stageEl.value?.getBoundingClientRect();
  stageSize.width = Math.round(rect?.width || 0);
  stageSize.height = Math.round(rect?.height || 0);
}

onMounted(() => {
  updateStageSize();
  resizeObserver = new ResizeObserver(updateStageSize);
  if (stageEl.value) resizeObserver.observe(stageEl.value);
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
});

watch(
  () => [props.nodes, props.edges, props.currentId],
  updateStageSize,
  { deep: true }
);
</script>
