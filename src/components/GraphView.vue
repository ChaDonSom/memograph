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
          @mouseenter="activateRoute(route)"
          @mouseleave="clearHighlight"
        />
        <polygon
          v-for="arrowhead in routeArrowheads"
          :key="`${arrowhead.id}-arrowhead`"
          class="memo-map-route-arrowhead"
          :class="{
            'memo-map-route-arrowhead--focused': arrowhead.route.touchesFocus,
            'memo-map-route-arrowhead--active': isRouteActive(arrowhead.route),
          }"
          :points="arrowhead.points"
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
          <div class="memo-map-tile-rich-editor" @keydown.stop>
            <div :ref="setTileEditorHost"></div>
            <div
              v-if="tileImageResizeBar.visible"
              class="img-resize-bar memo-map-tile-image-resize-bar"
              :style="{ top: `${tileImageResizeBar.top}px`, left: `${tileImageResizeBar.left}px` }"
              @mousedown.prevent
            >
              <button type="button" @click="resizeSelectedTileImage(25)">25%</button>
              <button type="button" @click="resizeSelectedTileImage(50)">50%</button>
              <button type="button" @click="resizeSelectedTileImage(75)">75%</button>
              <button type="button" @click="resizeSelectedTileImage(100)">Full</button>
            </div>
          </div>
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
          <div class="memo-map-route-popover-title">
            <button
              type="button"
              class="memo-map-route-popover-link"
              @click.stop="navigateToRouteNode(label.route.fromId)"
              @mouseenter.stop="activateNode(label.route.fromId)"
              @mouseleave.stop="activateRoute(label.route)"
            >
              {{ label.fromTitle }}
            </button>
            <span>{{ label.label }}</span>
            <button
              type="button"
              class="memo-map-route-popover-link"
              @click.stop="navigateToRouteNode(label.route.toId)"
              @mouseenter.stop="activateNode(label.route.toId)"
              @mouseleave.stop="activateRoute(label.route)"
            >
              {{ label.toTitle }}
            </button>
          </div>
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
import { hierarchy, treemap, treemapSquarify } from 'd3-hierarchy';
import Quill from 'quill';
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { DEFAULT_EDGE_WEIGHT, pScore, timeAgo } from '../utils/scoring.js';
import { imageUploadHandler } from '../utils/imageCompression.js';
import { normalizeEditorHtml, RICH_CONTENT_TOOLBAR, sanitizeRichDelta, sanitizeRichHtml } from '../utils/sanitize.js';
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
const tileDraft = reactive({ title: '', bodyDelta: '', bodyHtml: '', fallbackText: '' });
const tileImageResizeBar = reactive({ visible: false, top: 0, left: 0, imageEl: null });
let resizeObserver = null;
let tileEditor = null;
let tileEditorHost = null;
let tileImageClickHandler = null;

/**
 * Corridor sizing starts with a small base whitespace and grows linearly per shared route.
 */
const BASE_CORRIDOR_GAP = 12;
const CORRIDOR_WIDTH_PER_ROUTE = 7;
const OUTER_PADDING = 18;
const PERIMETER_ROUTE_LANE = 12;
const MIN_SIDE_WIDTH = 150;
const MIN_FOCUS_WIDTH = 210;
const MAX_VISIBLE_TILES = 28;
const FOCUS_MIN_SCORE = 36;
const HOP_DECAY = 0.58;
const CONTENT_SCORE_CAP = 12;
const HTML_RICHNESS_SCORE_CAP = 10;
const UNTITLED_PAGE_LABEL = '(untitled)';
const ENDPOINT_STEP = 12;
const FOCUS_SCORE_BOOST_RATIO = 1.08;
// When the map has only a few blocks, lower the focus floor to 72% so two adjacent blocks can grow toward one third of the screen.
const MIN_FOCUS_FALLBACK_RATIO = 0.72;
const MIN_TILES_FOR_BALANCED_FOCUS = 3;
// Empirically favors slightly wide, readable text blocks while leaving enough gutters for conduits.
const TREEMAP_ASPECT_RATIO = 1.18;
const MIN_TILE_FONT_SIZE = 10;
const TILE_FONT_SCALE = 24;
const FOCUS_MAX_FONT_SIZE = 18;
const TILE_MAX_FONT_SIZE = 16;
const MIN_VERTICAL_LABEL_LENGTH = 60;
const ROUTE_EDGE_PADDING = 18;
const ROUTE_CARD_CLEARANCE = 14;
const ROUTE_MASK_CARD_BLEED = 0;
const ROUTE_MASK_CARD_BORDER_RADIUS = 13;
const ROUTE_CORNER_RADIUS = 9;
const SAME_GROUP_ROUTE_PADDING = 24;
/** Scales down lane offsets for same-group routes because tile-to-tile gaps are already narrow. */
const SAME_GROUP_LANE_FACTOR = 0.8;
const LANE_STEP = 12;
const LABEL_DEFAULT_OFFSET = 12;
const LABEL_STACK_STEP = 18;
const LABEL_COLLISION_GAP = 8;
const LABEL_MIN_WIDTH = 46;
const LABEL_MAX_WIDTH = 170;
const LABEL_HEIGHT = 24;
const LABEL_CHARACTER_WIDTH_ESTIMATE = 6.5;
const LABEL_HORIZONTAL_PADDING_ESTIMATE = 22;
const LABEL_PLACEMENT_MAX_ATTEMPTS = 8;
const ROUTE_HIT_PADDING = 10;
const ARROWHEAD_LENGTH = 12;
const ARROWHEAD_WIDTH = 10;
const ROUTE_OBSTACLE_EPSILON = 0.01;
const ROUTE_TURN_PENALTY = 14;
const ROUTE_COORDINATE_PRECISION = 100;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
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

function treemapGroup(models, bounds) {
  if (!models.length || bounds.width <= 0 || bounds.height <= 0) return [];
  const root = hierarchy({
    children: models.map(model => ({
      ...model,
      value: Math.max(1, model.score),
    })),
  }).sum(item => item.value || 0);

  treemap()
    .tile(treemapSquarify.ratio(TREEMAP_ASPECT_RATIO))
    .size([bounds.width, bounds.height])
    .paddingInner(bounds.padding)
    .round(true)(root);

  return root.leaves().map(leaf => ({
    ...leaf.data,
    groupKey: bounds.groupKey,
    groupIndex: bounds.groupIndex,
    x: bounds.x + leaf.x0,
    y: bounds.y + leaf.y0,
    width: Math.max(1, leaf.x1 - leaf.x0),
    height: Math.max(1, leaf.y1 - leaf.y0),
  }));
}

function corridorWidth(routeCount) {
  return BASE_CORRIDOR_GAP + routeCount * CORRIDOR_WIDTH_PER_ROUTE;
}

function createCorridorLoadsArray(groupCount) {
  return Array.from({ length: Math.max(0, groupCount - 1) }, () => 0);
}

function groupForNode(groupsByNodeId, nodeId) {
  return groupsByNodeId.get(nodeId);
}

function corridorLoadsForGroups(groups, groupsByNodeId) {
  const loads = createCorridorLoadsArray(groups.length);
  for (const edge of props.edges) {
    const from = groupForNode(groupsByNodeId, edge.fromId);
    const to = groupForNode(groupsByNodeId, edge.toId);
    if (!from || !to || from.index === to.index) continue;
    const start = Math.min(from.index, to.index);
    const end = Math.max(from.index, to.index);
    for (let i = start; i < end; i++) loads[i]++;
  }
  return loads;
}

function internalGroupLoads(groupsByNodeId) {
  const loads = new Map();
  for (const edge of props.edges) {
    const from = groupForNode(groupsByNodeId, edge.fromId);
    const to = groupForNode(groupsByNodeId, edge.toId);
    if (!from || !to || from.index !== to.index) continue;
    loads.set(from.key, (loads.get(from.key) || 0) + 1);
  }
  return loads;
}

function groupWeight(group) {
  return Math.max(1, group.value);
}

function groupMinWidth(group, availableWidth) {
  return group.key === 'focus'
    ? Math.min(MIN_FOCUS_WIDTH, availableWidth)
    : Math.min(MIN_SIDE_WIDTH, availableWidth);
}

function allocateGroupWidths(groups, availableWidth) {
  const totalValue = groups.reduce((sum, group) => sum + groupWeight(group), 0);
  let remainingWidth = availableWidth;
  let remainingValue = totalValue;
  const widths = new Map();

  for (const group of groups) {
    const minWidth = groupMinWidth(group, availableWidth);
    const idealWidth = availableWidth * (groupWeight(group) / totalValue);
    if (idealWidth < minWidth && groups.length > 1) {
      widths.set(group.key, minWidth);
      remainingWidth -= minWidth;
      remainingValue -= groupWeight(group);
    }
  }

  for (const group of groups) {
    if (widths.has(group.key)) continue;
    const widthShare = remainingValue > 0
      ? remainingWidth * (groupWeight(group) / remainingValue)
      : remainingWidth / groups.length;
    widths.set(group.key, Math.max(1, widthShare));
  }

  return widths;
}

const layoutState = computed(() => {
  const width = stageSize.width - OUTER_PADDING * 2;
  const height = stageSize.height - OUTER_PADDING * 2;
  if (width <= 0 || height <= 0) return { models: [], corridors: [] };

  const models = visibleNodeModels.value;
  const focus = models.find(model => model.node.id === props.currentId);
  if (!focus) return { models: [], corridors: [] };

  const incoming = models.filter(model => model.node.id !== props.currentId && model.side === 'incoming');
  const outgoing = models.filter(model => model.node.id !== props.currentId && model.side !== 'incoming');
  const groups = [
    { key: 'incoming', models: incoming, value: incoming.reduce((sum, model) => sum + model.score, 0) },
    { key: 'focus', models: [focus], value: focus.score },
    { key: 'outgoing', models: outgoing, value: outgoing.reduce((sum, model) => sum + model.score, 0) },
  ].filter(group => group.models.length)
    .map((group, index) => ({ ...group, index }));

  const groupsByNodeId = new Map();
  for (const group of groups) {
    for (const model of group.models) {
      groupsByNodeId.set(model.node.id, { key: group.key, index: group.index });
    }
  }

  const corridorLoads = corridorLoadsForGroups(groups, groupsByNodeId);
  const corridorWidths = corridorLoads.map(corridorWidth);
  const internalLoads = internalGroupLoads(groupsByNodeId);
  const gapTotal = corridorWidths.reduce((sum, gap) => sum + gap, 0);
  const availableWidth = Math.max(1, width - gapTotal);
  // For multiple groups, enforce minimum widths to preserve readable columns; single-group layouts fill the stage naturally.
  const widths = allocateGroupWidths(groups, availableWidth);

  let x = OUTER_PADDING;
  const laidOut = [];
  const corridors = [];
  for (const group of groups) {
    const groupWidth = widths.get(group.key);
    if (group.key === 'focus') {
      laidOut.push({
        ...focus,
        groupKey: group.key,
        groupIndex: group.index,
        x,
        y: OUTER_PADDING,
        width: groupWidth,
        height,
      });
    } else {
      laidOut.push(...treemapGroup(group.models, {
        x,
        y: OUTER_PADDING,
        width: groupWidth,
        height,
        padding: corridorWidth(internalLoads.get(group.key) || 0),
        groupKey: group.key,
        groupIndex: group.index,
      }));
    }
    const gapWidth = corridorWidths[group.index] || 0;
    if (gapWidth) {
      corridors[group.index] = {
        index: group.index,
        x: x + groupWidth,
        width: gapWidth,
        load: corridorLoads[group.index] || 0,
      };
    }
    x += groupWidth + gapWidth;
  }

  return { models: laidOut, corridors };
});

const layoutModels = computed(() => layoutState.value.models);
const routeCorridors = computed(() => layoutState.value.corridors);

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
      bodyDelta: model.node.bodyDelta || '',
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

function oppositeSide(side) {
  return { left: 'right', right: 'left', top: 'bottom', bottom: 'top' }[side];
}

function horizontalRouteSides(from, to) {
  return rectCenter(from).x <= rectCenter(to).x
    ? { startSide: 'right', endSide: 'left' }
    : { startSide: 'left', endSide: 'right' };
}

function sameGroupRouteSides(from, to) {
  if (from.x + from.width <= to.x) return { startSide: 'right', endSide: 'left', axis: 'x' };
  else if (to.x + to.width <= from.x) return { startSide: 'left', endSide: 'right', axis: 'x' };
  else if (from.y + from.height <= to.y) return { startSide: 'bottom', endSide: 'top', axis: 'y' };
  else if (to.y + to.height <= from.y) return { startSide: 'top', endSide: 'bottom', axis: 'y' };
  return { ...horizontalRouteSides(from, to), axis: 'overflow' };
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

function pointOnRectSide(rect, side, offset) {
  if (side === 'left' || side === 'right') {
    return {
      x: side === 'left' ? rect.x : rect.x + rect.width,
      y: clamp(rectCenter(rect).y + offset, rect.y + ROUTE_EDGE_PADDING, rect.y + rect.height - ROUTE_EDGE_PADDING),
    };
  }
  return {
    x: clamp(rectCenter(rect).x + offset, rect.x + ROUTE_EDGE_PADDING, rect.x + rect.width - ROUTE_EDGE_PADDING),
    y: side === 'top' ? rect.y : rect.y + rect.height,
  };
}

function adjacentCorridorBetween(from, to) {
  const lowerGroupIndex = Math.min(from.groupIndex, to.groupIndex);
  return routeCorridors.value[lowerGroupIndex] || null;
}

function laneXInCorridor(corridor, laneOffset) {
  if (!corridor) return null;
  const center = corridor.x + corridor.width / 2;
  return clamp(
    center + laneOffset,
    corridor.x + ROUTE_EDGE_PADDING / 2,
    corridor.x + corridor.width - ROUTE_EDGE_PADDING / 2
  );
}

function corridorIndexesBetween(from, to) {
  const start = Math.min(from.groupIndex, to.groupIndex);
  const end = Math.max(from.groupIndex, to.groupIndex);
  const indexes = [];
  for (let index = start; index < end; index++) indexes.push(index);
  return indexes;
}

/**
 * Returns a symmetric pixel offset around zero for evenly spacing endpoints or lanes.
 * Pass a smaller step for route lanes and the default step for card-edge endpoints.
 */
function distributeOffset(index, count, step = ENDPOINT_STEP) {
  return (index - (count - 1) / 2) * step;
}

/**
 * Builds an SVG path from axis-aligned points and rounds each turn with a quadratic curve.
 */
function roundedOrthogonalPath(points) {
  points = compactOrthogonalPoints(points);
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

function createVerticalBendPoints(start, end, midX) {
  return [start, { x: midX, y: start.y }, { x: midX, y: end.y }, end];
}

function inflateRect(rect, amount) {
  return {
    x: rect.x - amount,
    y: rect.y - amount,
    width: rect.width + amount * 2,
    height: rect.height + amount * 2,
  };
}

function pointInRectInterior(point, rect) {
  return point.x > rect.x + ROUTE_OBSTACLE_EPSILON
    && point.x < rect.x + rect.width - ROUTE_OBSTACLE_EPSILON
    && point.y > rect.y + ROUTE_OBSTACLE_EPSILON
    && point.y < rect.y + rect.height - ROUTE_OBSTACLE_EPSILON;
}

function rangesOverlap(startA, endA, startB, endB) {
  const overlapStart = Math.max(Math.min(startA, endA), Math.min(startB, endB));
  const overlapEnd = Math.min(Math.max(startA, endA), Math.max(startB, endB));
  return overlapStart + ROUTE_OBSTACLE_EPSILON < overlapEnd;
}

function segmentIntersectsRect(start, end, rect) {
  if (start.x === end.x) {
    return start.x > rect.x + ROUTE_OBSTACLE_EPSILON
      && start.x < rect.x + rect.width - ROUTE_OBSTACLE_EPSILON
      && rangesOverlap(start.y, end.y, rect.y, rect.y + rect.height);
  }
  if (start.y === end.y) {
    return start.y > rect.y + ROUTE_OBSTACLE_EPSILON
      && start.y < rect.y + rect.height - ROUTE_OBSTACLE_EPSILON
      && rangesOverlap(start.x, end.x, rect.x, rect.x + rect.width);
  }
  return false;
}

function routeObstacleRects() {
  return visibleTiles.value.map(tile => inflateRect(tile.rect, ROUTE_MASK_CARD_BLEED));
}

function segmentBlocked(start, end, obstacles) {
  return obstacles.some(rect => segmentIntersectsRect(start, end, rect));
}

function routeIsClear(points, obstacles) {
  for (let index = 1; index < points.length; index++) {
    if (segmentBlocked(points[index - 1], points[index], obstacles)) return false;
  }
  return true;
}

function uniqueSortedLines(values, min, max) {
  return [...new Set(values
    .map(value => roundToRoutePrecision(clamp(value, min, max))))]
    .sort((a, b) => a - b);
}

function roundToRoutePrecision(value) {
  return Math.round(value * ROUTE_COORDINATE_PRECISION) / ROUTE_COORDINATE_PRECISION;
}

function routePoint(point) {
  return {
    x: roundToRoutePrecision(point.x),
    y: roundToRoutePrecision(point.y),
  };
}

function routeGridLines(start, end, preferredPoints, obstacles) {
  const validPreferredPoints = preferredPoints.filter(point => point && Number.isFinite(point.x) && Number.isFinite(point.y));
  const xLines = [
    ROUTE_EDGE_PADDING,
    stageSize.width - ROUTE_EDGE_PADDING,
    start.x,
    end.x,
    ...validPreferredPoints.map(point => point.x),
  ];
  const yLines = [
    PERIMETER_ROUTE_LANE,
    stageSize.height - PERIMETER_ROUTE_LANE,
    start.y,
    end.y,
    ...validPreferredPoints.map(point => point.y),
  ];
  for (const rect of obstacles) {
    xLines.push(rect.x - ROUTE_CARD_CLEARANCE, rect.x + rect.width + ROUTE_CARD_CLEARANCE);
    yLines.push(rect.y - ROUTE_CARD_CLEARANCE, rect.y + rect.height + ROUTE_CARD_CLEARANCE);
  }
  for (const corridor of routeCorridors.value.filter(Boolean)) {
    xLines.push(
      corridor.x + ROUTE_EDGE_PADDING / 2,
      corridor.x + corridor.width / 2,
      corridor.x + corridor.width - ROUTE_EDGE_PADDING / 2
    );
  }
  return {
    xLines: uniqueSortedLines(xLines, ROUTE_EDGE_PADDING, stageSize.width - ROUTE_EDGE_PADDING),
    yLines: uniqueSortedLines(yLines, PERIMETER_ROUTE_LANE, stageSize.height - PERIMETER_ROUTE_LANE),
  };
}

function compactOrthogonalPoints(points) {
  if (points.length <= 2) return points;
  const compacted = [points[0]];
  for (let index = 1; index < points.length - 1; index++) {
    const previous = compacted[compacted.length - 1];
    const current = points[index];
    const next = points[index + 1];
    if ((previous.x === current.x && current.x === next.x)
      || (previous.y === current.y && current.y === next.y)) continue;
    compacted.push(current);
  }
  compacted.push(points[points.length - 1]);
  return compacted;
}

function enqueueRouteState(queue, entry) {
  queue.push(entry);
  let index = queue.length - 1;
  while (index > 0) {
    const parentIndex = Math.floor((index - 1) / 2);
    if (queue[parentIndex].cost <= queue[index].cost) break;
    [queue[parentIndex], queue[index]] = [queue[index], queue[parentIndex]];
    index = parentIndex;
  }
}

function dequeueRouteState(queue) {
  if (queue.length <= 1) return queue.pop();
  const next = queue[0];
  queue[0] = queue.pop();
  let index = 0;
  while (true) {
    const leftIndex = index * 2 + 1;
    const rightIndex = leftIndex + 1;
    let smallestIndex = index;
    if (leftIndex < queue.length && queue[leftIndex].cost < queue[smallestIndex].cost) {
      smallestIndex = leftIndex;
    }
    if (rightIndex < queue.length && queue[rightIndex].cost < queue[smallestIndex].cost) {
      smallestIndex = rightIndex;
    }
    if (smallestIndex === index) break;
    [queue[index], queue[smallestIndex]] = [queue[smallestIndex], queue[index]];
    index = smallestIndex;
  }
  return next;
}

function findClearOrthogonalRoute(points) {
  points = points.map(routePoint);
  const obstacles = routeObstacleRects();
  if (routeIsClear(points, obstacles)) return compactOrthogonalPoints(points);

  const start = points[0];
  const end = points[points.length - 1];
  const { xLines, yLines } = routeGridLines(start, end, points, obstacles);
  const nodeKey = (x, y) => `${x},${y}`;
  const parseKey = key => {
    const [x, y] = key.split(',').map(Number);
    return { x, y };
  };
  const nodeAllowed = (x, y) => {
    const point = { x, y };
    if ((x === start.x && y === start.y) || (x === end.x && y === end.y)) return true;
    return !obstacles.some(rect => pointInRectInterior(point, rect));
  };
  const distances = new Map();
  const previous = new Map();
  const queue = [];
  // Search states are encoded as "x,y|previousAxis" where previousAxis is "none", "x", or "y".
  // Keeping the axis in the state lets turn penalties distinguish approaches to the same point.
  const startState = `${nodeKey(start.x, start.y)}|none`;
  distances.set(startState, 0);
  enqueueRouteState(queue, { state: startState, cost: 0 });

  while (queue.length) {
    const { state, cost } = dequeueRouteState(queue);
    if (cost !== distances.get(state)) continue;
    const [key, previousAxis] = state.split('|');
    const current = parseKey(key);
    if (current.x === end.x && current.y === end.y) {
      const route = [];
      let cursor = state;
      while (cursor) {
        route.push(parseKey(cursor.split('|')[0]));
        cursor = previous.get(cursor);
      }
      return compactOrthogonalPoints(route.reverse());
    }

    const xIndex = xLines.indexOf(current.x);
    const yIndex = yLines.indexOf(current.y);
    const neighbors = [
      xIndex > 0 ? { x: xLines[xIndex - 1], y: current.y, axis: 'x' } : null,
      xIndex < xLines.length - 1 ? { x: xLines[xIndex + 1], y: current.y, axis: 'x' } : null,
      yIndex > 0 ? { x: current.x, y: yLines[yIndex - 1], axis: 'y' } : null,
      yIndex < yLines.length - 1 ? { x: current.x, y: yLines[yIndex + 1], axis: 'y' } : null,
    ].filter(Boolean);

    for (const neighbor of neighbors) {
      if (!nodeAllowed(neighbor.x, neighbor.y)) continue;
      const next = { x: neighbor.x, y: neighbor.y };
      if (segmentBlocked(current, next, obstacles)) continue;
      const turnCost = previousAxis !== 'none' && previousAxis !== neighbor.axis ? ROUTE_TURN_PENALTY : 0;
      const nextCost = cost + Math.abs(next.x - current.x) + Math.abs(next.y - current.y) + turnCost;
      const nextState = `${nodeKey(next.x, next.y)}|${neighbor.axis}`;
      const existingCost = distances.get(nextState);
      if (existingCost !== undefined && nextCost >= existingCost) continue;
      distances.set(nextState, nextCost);
      previous.set(nextState, state);
      enqueueRouteState(queue, { state: nextState, cost: nextCost });
    }
  }

  return compactOrthogonalPoints(points);
}

function perimeterLaneY(start, end) {
  const topCost = start.y + end.y;
  const bottomCost = (stageSize.height - start.y) + (stageSize.height - end.y);
  return topCost <= bottomCost ? PERIMETER_ROUTE_LANE : stageSize.height - PERIMETER_ROUTE_LANE;
}

function labelRotation(vertical, startY, endY) {
  if (!vertical) return 0;
  return endY < startY ? -90 : 90;
}

/**
 * Returns the perpendicular unit vector used to nudge labels away from a route segment.
 */
function routeSegmentNormal(segment) {
  if (segment.vertical) return { x: 1, y: 0 };
  return { x: 0, y: -1 };
}

const routedEdges = computed(() => {
  const plans = visibleEdges.value.map(edge => {
    const from = tileRects.value.get(edge.fromId);
    const to = tileRects.value.get(edge.toId);
    const groupDistance = Math.abs(from.groupIndex - to.groupIndex);
    const sides = groupDistance === 0 ? sameGroupRouteSides(from, to) : horizontalRouteSides(from, to);
    return { edge, from, to, groupDistance, ...sides };
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
      .sort((a, b) => a.sort - b.sort || a.id.localeCompare(b.id))
      .forEach((endpoint, index) => {
        endpointOffsets.set(`${endpoint.id}:${endpoint.endpoint}`, distributeOffset(index, endpoints.length));
      });
  }

  const corridorLaneOffsets = new Map();
  const corridorLaneGroups = new Map();
  for (const plan of plans) {
    for (const corridorIndex of corridorIndexesBetween(plan.from, plan.to)) {
      if (!corridorLaneGroups.has(corridorIndex)) corridorLaneGroups.set(corridorIndex, []);
      corridorLaneGroups.get(corridorIndex).push({
        id: plan.edge.id,
        sortKey: (rectCenter(plan.from).y + rectCenter(plan.to).y) / 2,
      });
    }
  }
  for (const [corridorIndex, routes] of corridorLaneGroups) {
    routes
      .sort((a, b) => a.sortKey - b.sortKey || a.id.localeCompare(b.id))
      .forEach((route, index) => {
        corridorLaneOffsets.set(`${route.id}:${corridorIndex}`, distributeOffset(index, routes.length, LANE_STEP));
      });
  }

  return plans.map(plan => {
    const { edge, from, to, groupDistance } = plan;
    const startOffset = endpointOffsets.get(`${edge.id}:start`) || 0;
    const endOffset = endpointOffsets.get(`${edge.id}:end`) || 0;
    const startPort = pointOnRectSide(from, plan.startSide, startOffset);
    const endPort = pointOnRectSide(to, plan.endSide, endOffset);
    const start = pointOutsideRect(from, plan.startSide, startOffset);
    const end = pointOutsideRect(to, plan.endSide, endOffset);
    let points = [];
    if (groupDistance === 1) {
      const corridor = adjacentCorridorBetween(from, to);
      const laneOffset = corridorLaneOffsets.get(`${edge.id}:${Math.min(from.groupIndex, to.groupIndex)}`) || 0;
      const midX = laneXInCorridor(corridor, laneOffset) ?? (start.x + end.x) / 2;
      points = createVerticalBendPoints(start, end, midX);
    } else if (groupDistance > 1) {
      const corridorIndexes = corridorIndexesBetween(from, to);
      const firstCorridorIndex = corridorIndexes[0];
      const lastCorridorIndex = corridorIndexes[corridorIndexes.length - 1];
      const firstCorridor = routeCorridors.value[firstCorridorIndex] || null;
      const lastCorridor = routeCorridors.value[lastCorridorIndex] || null;
      const firstLane = corridorLaneOffsets.get(`${edge.id}:${firstCorridorIndex}`) || 0;
      const lastLane = corridorLaneOffsets.get(`${edge.id}:${lastCorridorIndex}`) || firstLane;
      const startMidX = laneXInCorridor(firstCorridor, firstLane) ?? start.x;
      const endMidX = laneXInCorridor(lastCorridor, lastLane) ?? end.x;
      const perimeterY = perimeterLaneY(start, end);
      points = [
        start,
        { x: startMidX, y: start.y },
        { x: startMidX, y: perimeterY },
        { x: endMidX, y: perimeterY },
        { x: endMidX, y: end.y },
        end,
      ];
    } else if (plan.axis === 'y') {
      const top = plan.startSide === 'bottom' ? from.y + from.height : to.y + to.height;
      const bottom = plan.startSide === 'bottom' ? to.y : from.y;
      const laneOffset = (endpointOffsets.get(`${edge.id}:start`) || 0) * SAME_GROUP_LANE_FACTOR;
      const midY = (top + bottom) / 2 + laneOffset;
      points = [start, { x: start.x, y: midY }, { x: end.x, y: midY }, end];
    } else if (plan.axis === 'x') {
      const left = plan.startSide === 'right' ? from.x + from.width : to.x + to.width;
      const right = plan.startSide === 'right' ? to.x : from.x;
      const laneOffset = (endpointOffsets.get(`${edge.id}:start`) || 0) * SAME_GROUP_LANE_FACTOR;
      const midX = (left + right) / 2 + laneOffset;
      points = createVerticalBendPoints(start, end, midX);
    } else {
      const routeOnRight = plan.startSide === 'right';
      const rawMidX = routeOnRight
        ? Math.max(from.x + from.width, to.x + to.width) + SAME_GROUP_ROUTE_PADDING
        : Math.min(from.x, to.x) - SAME_GROUP_ROUTE_PADDING;
      const laneOffset = endpointOffsets.get(`${edge.id}:start`) || 0;
      const midX = clamp(rawMidX + (routeOnRight ? laneOffset : -laneOffset), ROUTE_EDGE_PADDING, stageSize.width - ROUTE_EDGE_PADDING);
      points = createVerticalBendPoints(start, end, midX);
    }

    const strokeWidth = 1.1 + Math.min(1.8, (edge.weight || DEFAULT_EDGE_WEIGHT) / 8);
    points = findClearOrthogonalRoute(points);
    points = [
      routePoint(startPort),
      ...points,
      routePoint(endPort),
    ];
    return {
      id: edge.id,
      edge,
      fromId: edge.fromId,
      toId: edge.toId,
      endSide: plan.endSide,
      points,
      startX: startPort.x,
      startY: startPort.y,
      endX: endPort.x,
      endY: endPort.y,
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
      normal: { x: 0, y: -1 },
    };
  }
  const vertical = !horizontal && segment.vertical && segment.length >= MIN_VERTICAL_LABEL_LENGTH;
  return {
    x: (segment.start.x + segment.end.x) / 2,
    y: (segment.start.y + segment.end.y) / 2,
    vertical,
    rotation: labelRotation(vertical, segment.start.y, segment.end.y),
    normal: routeSegmentNormal(segment),
  };
}

/**
 * Estimates the screen-space bounds of a route label, accounting for vertical labels.
 */
function labelBounds(label) {
  const width = Math.min(
    LABEL_MAX_WIDTH,
    Math.max(LABEL_MIN_WIDTH, label.label.length * LABEL_CHARACTER_WIDTH_ESTIMATE + LABEL_HORIZONTAL_PADDING_ESTIMATE)
  );
  const halfWidth = label.vertical ? LABEL_HEIGHT / 2 : width / 2;
  const halfHeight = label.vertical ? width / 2 : LABEL_HEIGHT / 2;
  return {
    left: label.x - halfWidth,
    right: label.x + halfWidth,
    top: label.y - halfHeight,
    bottom: label.y + halfHeight,
  };
}

/**
 * Detects whether two label bounds overlap after applying the collision gap.
 */
function boundsOverlap(a, b) {
  return a.left < b.right + LABEL_COLLISION_GAP
    && a.right + LABEL_COLLISION_GAP > b.left
    && a.top < b.bottom + LABEL_COLLISION_GAP
    && a.bottom + LABEL_COLLISION_GAP > b.top;
}

/**
 * Keeps a label position inside the visible graph stage.
 */
function nudgeLabelIntoStage(label) {
  label.x = clamp(label.x, ROUTE_EDGE_PADDING, stageSize.width - ROUTE_EDGE_PADDING);
  label.y = clamp(label.y, PERIMETER_ROUTE_LANE, stageSize.height - PERIMETER_ROUTE_LANE);
}

const routeLabels = computed(() => {
  const placed = [];
  return routedEdges.value.map(route => {
    const placement = routeLabelPlacement(route);
    const label = {
      id: route.id,
      label: route.label,
      bodyHtml: route.bodyHtml,
      route,
      edge: route.edge,
      fromTitle: nodesById.value.get(route.fromId)?.title || UNTITLED_PAGE_LABEL,
      toTitle: nodesById.value.get(route.toId)?.title || UNTITLED_PAGE_LABEL,
      vertical: placement.vertical,
      rotation: placement.rotation,
      x: placement.x,
      y: placement.y,
      normal: placement.normal,
    };

    let attempt = 0;
    let currentBounds = labelBounds(label);
    while (placed.some(existing => boundsOverlap(currentBounds, labelBounds(existing))) && attempt < LABEL_PLACEMENT_MAX_ATTEMPTS) {
      const direction = attempt % 2 === 0 ? 1 : -1;
      const distance = Math.ceil((attempt + 1) / 2) * LABEL_STACK_STEP;
      label.x = placement.x + label.normal.x * direction * distance;
      label.y = placement.y + label.normal.y * direction * distance;
      nudgeLabelIntoStage(label);
      currentBounds = labelBounds(label);
      attempt++;
    }

    placed.push(label);
    return {
      ...label,
      style: {
        left: `${label.x}px`,
        top: `${label.y}px`,
        '--memo-label-rotation': `${label.rotation}deg`,
      },
    };
  });
});

/**
 * Builds SVG polygon points for an arrowhead tip at point, facing along unit.
 */
function arrowheadPolygon(point, unit) {
  const base = {
    x: point.x - unit.x * ARROWHEAD_LENGTH,
    y: point.y - unit.y * ARROWHEAD_LENGTH,
  };
  const perpendicular = { x: -unit.y, y: unit.x };
  const left = {
    x: base.x + perpendicular.x * ARROWHEAD_WIDTH / 2,
    y: base.y + perpendicular.y * ARROWHEAD_WIDTH / 2,
  };
  const right = {
    x: base.x - perpendicular.x * ARROWHEAD_WIDTH / 2,
    y: base.y - perpendicular.y * ARROWHEAD_WIDTH / 2,
  };
  return `${point.x},${point.y} ${left.x},${left.y} ${right.x},${right.y}`;
}

function arrowUnitForEndSide(side) {
  return {
    left: { x: 1, y: 0 },
    right: { x: -1, y: 0 },
    top: { x: 0, y: 1 },
    bottom: { x: 0, y: -1 },
  }[side] || { x: 1, y: 0 };
}

const routeArrowheads = computed(() =>
  routedEdges.value.map(route => {
    const tip = route.points[route.points.length - 1];
    return {
      id: route.id,
      route,
      points: arrowheadPolygon(tip, arrowUnitForEndSide(route.endSide)),
    };
  })
);

function handleTileClick(tile) {
  if (tile.id !== props.currentId) emit('navigate', tile.id);
}

function navigateToRouteNode(nodeId) {
  if (nodeId && nodeId !== props.currentId) emit('navigate', nodeId);
}

function handleTileKeydown(event, tile) {
  if (event.target !== event.currentTarget) return;
  handleTileClick(tile);
}

function setTileEditorHost(el) {
  tileEditorHost = el;
}

function hideTileImageResizeBar() {
  tileImageResizeBar.visible = false;
  tileImageResizeBar.imageEl = null;
}

function showTileImageResizeBar(imgEl) {
  const editorRect = tileEditor.root.getBoundingClientRect();
  const imgRect = imgEl.getBoundingClientRect();
  tileImageResizeBar.imageEl = imgEl;
  tileImageResizeBar.top = imgRect.bottom - editorRect.top + tileEditor.root.scrollTop + 4;
  tileImageResizeBar.left = imgRect.left - editorRect.left;
  tileImageResizeBar.visible = true;
}

function attachTileImageClickHandlers() {
  if (!tileEditor) return;
  if (tileImageClickHandler) {
    tileEditor.root.removeEventListener('click', tileImageClickHandler);
  }
  tileImageClickHandler = (event) => {
    if (event.target.tagName === 'IMG') {
      showTileImageResizeBar(event.target);
    } else {
      hideTileImageResizeBar();
    }
  };
  tileEditor.root.addEventListener('click', tileImageClickHandler);
}

function removeTileImageClickHandlers() {
  if (tileEditor && tileImageClickHandler) {
    tileEditor.root.removeEventListener('click', tileImageClickHandler);
  }
  tileImageClickHandler = null;
}

function resizeSelectedTileImage(widthPct) {
  if (!tileImageResizeBar.imageEl || !tileEditor) return;
  const blot = Quill.find(tileImageResizeBar.imageEl);
  if (blot) {
    tileEditor.formatText(tileEditor.getIndex(blot), 1, 'width', widthPct === 100 ? false : `${widthPct}%`, 'user');
  }
  hideTileImageResizeBar();
}

/**
 * Restores Quill contents from a serialized Delta and reports whether it succeeded.
 * @param {Quill} quill
 * @param {string} serializedDelta
 * @returns {boolean}
 */
function restoreEditorContents(quill, serializedDelta) {
  try {
    const parsed = JSON.parse(serializedDelta);
    quill.setContents(sanitizeRichDelta(parsed));
    return true;
  } catch (error) {
    console.warn('Unable to restore graph tile editor contents from Delta; will attempt to load from HTML or plain text fallback.', error);
    return false;
  }
}

function initTileEditor() {
  if (!tileEditorHost || !editingTileId.value) return;
  tileEditorHost.replaceChildren();
  const editorEl = document.createElement('div');
  tileEditorHost.appendChild(editorEl);
  try {
    tileEditor = new Quill(editorEl, {
      theme: 'snow',
      placeholder: 'Write something about this page…',
      modules: {
        toolbar: RICH_CONTENT_TOOLBAR,
        uploader: {
          handler: imageUploadHandler,
        },
      },
    });
  } catch (error) {
    tileEditor = null;
    tileEditorHost.textContent = 'Unable to initialize the rich editor. Cancel and try again.';
    console.warn('Unable to initialize graph tile rich editor.', error);
    return;
  }
  const deltaRestored = tileDraft.bodyDelta && restoreEditorContents(tileEditor, tileDraft.bodyDelta);
  if (!deltaRestored && tileDraft.bodyHtml) {
    tileEditor.clipboard.dangerouslyPasteHTML(sanitizeRichHtml(normalizeEditorHtml(tileDraft.bodyHtml)));
  } else if (!deltaRestored && tileDraft.fallbackText) {
    tileEditor.setText(tileDraft.fallbackText);
  }
  attachTileImageClickHandlers();
}

async function startTileEdit(tile) {
  editingTileId.value = tile.id;
  tileDraft.title = tile.title;
  tileDraft.bodyDelta = tile.bodyDelta || '';
  tileDraft.bodyHtml = tile.bodyHtml || '';
  tileDraft.fallbackText = tile.bodyText || '';
  await nextTick();
  initTileEditor();
}

function cancelTileEdit() {
  removeTileImageClickHandlers();
  hideTileImageResizeBar();
  tileEditor = null;
  editingTileId.value = '';
  tileDraft.title = '';
  tileDraft.bodyDelta = '';
  tileDraft.bodyHtml = '';
  tileDraft.fallbackText = '';
}

function saveTileEdit() {
  if (!editingTileId.value) return;
  const bodyDelta = tileEditor ? JSON.stringify(sanitizeRichDelta(tileEditor.getContents())) : tileDraft.bodyDelta;
  const bodyHtml = tileEditor ? sanitizeRichHtml(normalizeEditorHtml(tileEditor.root.innerHTML)) : tileDraft.bodyHtml;
  emit('update-page', {
    id: editingTileId.value,
    title: tileDraft.title,
    bodyDelta,
    bodyHtml,
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
