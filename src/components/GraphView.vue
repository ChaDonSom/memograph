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
const COLUMN_GAP = 28;
const ROUTE_GUTTER_BASE = 34;
const ROUTE_GUTTER_MAX = 96;
const STACK_GAP = 12;
const MIN_STACK_TILE_HEIGHT = 92;
const MIN_FOCUS_HEIGHT = 210;
const FOCUS_HEIGHT_RATIO = 0.58;
const MIN_SIDE_WIDTH = 170;
const MIN_FOCUS_WIDTH = 230;
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
const LOCAL_LOOP_GAP = 18;

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

function groupWeight(group) {
  if (!Number.isFinite(group.value)) return 1;
  return Math.max(1, Math.sqrt(group.value));
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

function routeGutterWidth(routeCount) {
  if (routeCount <= 0) return COLUMN_GAP;
  return clamp(ROUTE_GUTTER_BASE + Math.max(0, routeCount - 1) * LANE_STEP, COLUMN_GAP, ROUTE_GUTTER_MAX);
}

function createCorridorLoadsArray(groupCount) {
  return Array.from({ length: Math.max(0, groupCount - 1) }, () => 0);
}

function groupForNode(groupsByNodeId, nodeId) {
  return groupsByNodeId.get(nodeId);
}

function visibleCorridorLoads(groups, groupsByNodeId) {
  const loads = createCorridorLoadsArray(groups.length);
  for (const edge of props.edges) {
    const from = groupForNode(groupsByNodeId, edge.fromId);
    const to = groupForNode(groupsByNodeId, edge.toId);
    if (!from || !to || from.index === to.index) continue;
    const start = Math.min(from.index, to.index);
    const end = Math.max(from.index, to.index);
    for (let index = start; index < end; index++) loads[index]++;
  }
  return loads;
}

function allocateStackHeights(models, availableHeight) {
  if (!models.length) return [];
  const gapTotal = STACK_GAP * Math.max(0, models.length - 1);
  const height = Math.max(1, availableHeight - gapTotal);
  const weights = models.map(model => model.score > 1 ? Math.sqrt(model.score) : 1);
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  const minHeight = Math.min(MIN_STACK_TILE_HEIGHT, height / models.length);
  let heights = weights.map(weight => Math.max(minHeight, height * (weight / totalWeight)));
  const totalHeight = heights.reduce((sum, item) => sum + item, 0);

  if (totalHeight > height) {
    const scale = height / totalHeight;
    heights = heights.map(item => Math.max(1, item * scale));
  } else if (totalHeight < height) {
    const extra = height - totalHeight;
    heights = heights.map((item, index) => item + extra * (weights[index] / totalWeight));
  }

  return heights;
}

function compareModelsForStackLayout(a, b) {
  return a.hop - b.hop || b.score - a.score || a.node.id.localeCompare(b.node.id);
}

function stackGroup(group, bounds) {
  if (!group.models.length || bounds.width <= 0 || bounds.height <= 0) return [];
  const models = [...group.models].sort(compareModelsForStackLayout);

  if (group.key === 'focus') {
    const focus = models[0];
    const height = Math.min(bounds.height, Math.max(MIN_FOCUS_HEIGHT, bounds.height * FOCUS_HEIGHT_RATIO));
    return [{
      ...focus,
      groupKey: group.key,
      groupIndex: group.index,
      // Preserve the column bounds separately from the card bounds for local loop routing.
      groupX: bounds.x,
      groupWidth: bounds.width,
      x: bounds.x,
      y: bounds.y + (bounds.height - height) / 2,
      width: bounds.width,
      height,
    }];
  }

  const heights = allocateStackHeights(models, bounds.height);
  let y = bounds.y;
  return models.map((model, index) => {
    const height = heights[index];
    const laidOut = {
      ...model,
      groupKey: group.key,
      groupIndex: group.index,
      // Preserve the column bounds separately from the card bounds for local loop routing.
      groupX: bounds.x,
      groupWidth: bounds.width,
      x: bounds.x,
      y,
      width: bounds.width,
      height,
    };
    y += height + STACK_GAP;
    return laidOut;
  });
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

  const corridorLoads = visibleCorridorLoads(groups, groupsByNodeId);
  const corridorWidths = corridorLoads.map(routeGutterWidth);
  const gapTotal = corridorWidths.reduce((sum, gap) => sum + gap, 0);
  const availableWidth = Math.max(1, width - gapTotal);
  const widths = allocateGroupWidths(groups, availableWidth);

  let x = OUTER_PADDING;
  const laidOut = [];
  const corridors = [];
  for (const group of groups) {
    const groupWidth = widths.get(group.key);
    laidOut.push(...stackGroup(group, {
      x,
      y: OUTER_PADDING,
      width: groupWidth,
      height,
    }));

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

function routeSideForGroups(from, to) {
  if (from.groupIndex < to.groupIndex) return { startSide: 'right', endSide: 'left', direction: 'forward' };
  if (from.groupIndex > to.groupIndex) return { startSide: 'left', endSide: 'right', direction: 'backward' };
  const side = from.groupKey === 'incoming' ? 'left' : 'right';
  return { startSide: side, endSide: side, direction: rectCenter(from).y <= rectCenter(to).y ? 'down' : 'up' };
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

function corridorIndexesBetween(from, to) {
  const start = Math.min(from.groupIndex, to.groupIndex);
  const end = Math.max(from.groupIndex, to.groupIndex);
  const indexes = [];
  for (let index = start; index < end; index++) indexes.push(index);
  return indexes;
}

function distributeOffset(index, count, step = ENDPOINT_STEP) {
  return (index - (count - 1) / 2) * step;
}

function laneCoordinate(corridor, index, count) {
  const usableLeft = corridor.x + ROUTE_EDGE_PADDING / 2;
  const usableRight = corridor.x + corridor.width - ROUTE_EDGE_PADDING / 2;
  if (count <= 1) return (usableLeft + usableRight) / 2;
  const usableWidth = Math.max(1, usableRight - usableLeft);
  const step = Math.min(LANE_STEP, usableWidth / (count - 1));
  return clamp((usableLeft + usableRight) / 2 + distributeOffset(index, count, step), usableLeft, usableRight);
}

function localLoopX(rect, laneIndex, side) {
  const groupX = Number.isFinite(rect.groupX) ? rect.groupX : rect.x;
  const groupWidth = Number.isFinite(rect.groupWidth) ? rect.groupWidth : rect.width;
  const offset = LOCAL_LOOP_GAP + laneIndex * LANE_STEP;
  if (side === 'left') return clamp(groupX - offset, ROUTE_EDGE_PADDING, stageSize.width - ROUTE_EDGE_PADDING);
  return clamp(groupX + groupWidth + offset, ROUTE_EDGE_PADDING, stageSize.width - ROUTE_EDGE_PADDING);
}

function perimeterLaneY(index, start, end) {
  const useTop = start.y + end.y <= (stageSize.height - start.y) + (stageSize.height - end.y);
  const base = useTop ? ROUTE_EDGE_PADDING : stageSize.height - ROUTE_EDGE_PADDING;
  const offset = index * LANE_STEP;
  return clamp(useTop ? base + offset : base - offset, ROUTE_EDGE_PADDING, stageSize.height - ROUTE_EDGE_PADDING);
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

function compareRoutePlansByYMidpoint(a, b) {
  return (rectCenter(a.from).y + rectCenter(a.to).y)
    - (rectCenter(b.from).y + rectCenter(b.to).y)
    || a.edge.id.localeCompare(b.edge.id);
}

const routedEdges = computed(() => {
  const plans = visibleEdges.value.map(edge => {
    const from = tileRects.value.get(edge.fromId);
    const to = tileRects.value.get(edge.toId);
    const groupDistance = Math.abs(from.groupIndex - to.groupIndex);
    return { edge, from, to, groupDistance, ...routeSideForGroups(from, to) };
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

  const corridorLaneIndexes = new Map();
  const corridorLaneGroups = new Map();
  const localLaneIndexes = new Map();
  const localLaneGroups = new Map();
  const perimeterLaneIndexes = new Map();
  const perimeterPlans = [];

  for (const plan of plans) {
    if (plan.groupDistance === 0) {
      const key = `${plan.from.groupIndex}:${plan.startSide}:${plan.direction}`;
      if (!localLaneGroups.has(key)) localLaneGroups.set(key, []);
      localLaneGroups.get(key).push(plan);
      continue;
    }

    for (const corridorIndex of corridorIndexesBetween(plan.from, plan.to)) {
      const key = `${corridorIndex}`;
      if (!corridorLaneGroups.has(key)) corridorLaneGroups.set(key, []);
      corridorLaneGroups.get(key).push(plan);
    }
    if (plan.groupDistance > 1) perimeterPlans.push(plan);
  }

  for (const [key, group] of corridorLaneGroups) {
    group
      .sort(compareRoutePlansByYMidpoint)
      .forEach((plan, index) => corridorLaneIndexes.set(`${plan.edge.id}:${key}`, { index, count: group.length }));
  }

  for (const group of localLaneGroups.values()) {
    group
      .sort(compareRoutePlansByYMidpoint)
      .forEach((plan, index) => localLaneIndexes.set(plan.edge.id, index));
  }

  perimeterPlans
    .sort(compareRoutePlansByYMidpoint)
    .forEach((plan, index) => perimeterLaneIndexes.set(plan.edge.id, index));

  return plans.map(plan => {
    const { edge, from, to, groupDistance } = plan;
    const start = pointOutsideRect(from, plan.startSide, endpointOffsets.get(`${edge.id}:start`) || 0);
    const end = pointOutsideRect(to, plan.endSide, endpointOffsets.get(`${edge.id}:end`) || 0);
    let points = [];

    if (groupDistance === 0) {
      const laneX = localLoopX(from, localLaneIndexes.get(edge.id) || 0, plan.startSide);
      points = [start, { x: laneX, y: start.y }, { x: laneX, y: end.y }, end];
    } else if (groupDistance === 1) {
      const corridorIndex = Math.min(from.groupIndex, to.groupIndex);
      const corridor = routeCorridors.value[corridorIndex];
      const lane = corridorLaneIndexes.get(`${edge.id}:${corridorIndex}`) || { index: 0, count: 1 };
      const laneX = corridor ? laneCoordinate(corridor, lane.index, lane.count) : (start.x + end.x) / 2;
      points = [start, { x: laneX, y: start.y }, { x: laneX, y: end.y }, end];
    } else {
      const corridorIndexes = corridorIndexesBetween(from, to);
      const firstCorridorIndex = corridorIndexes[0];
      const lastCorridorIndex = corridorIndexes[corridorIndexes.length - 1];
      const firstCorridor = routeCorridors.value[firstCorridorIndex];
      const lastCorridor = routeCorridors.value[lastCorridorIndex];
      const firstLane = corridorLaneIndexes.get(`${edge.id}:${firstCorridorIndex}`) || { index: 0, count: 1 };
      const lastLane = corridorLaneIndexes.get(`${edge.id}:${lastCorridorIndex}`) || firstLane;
      const startLaneX = firstCorridor ? laneCoordinate(firstCorridor, firstLane.index, firstLane.count) : start.x;
      const endLaneX = lastCorridor ? laneCoordinate(lastCorridor, lastLane.index, lastLane.count) : end.x;
      const y = perimeterLaneY(perimeterLaneIndexes.get(edge.id) || 0, start, end);
      points = [start, { x: startLaneX, y: start.y }, { x: startLaneX, y }, { x: endLaneX, y }, { x: endLaneX, y: end.y }, end];
    }

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
