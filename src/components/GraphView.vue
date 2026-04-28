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
            markerWidth="9"
            markerHeight="9"
            refX="8"
            refY="4.5"
            orient="auto"
            markerUnits="strokeWidth"
          >
            <path d="M 0 0 L 9 4.5 L 0 9 z" fill="var(--accent)" />
          </marker>
        </defs>
        <path
          v-for="route in routedEdges"
          :key="route.id"
          class="memo-map-route"
          :class="{ 'memo-map-route--focused': route.touchesFocus }"
          :d="route.path"
          :style="{ strokeWidth: route.strokeWidth }"
          marker-end="url(#memo-map-arrowhead)"
        />
      </svg>

      <button
        v-for="tile in visibleTiles"
        :key="tile.id"
        type="button"
        class="memo-map-tile"
        :class="{
          'memo-map-tile--focus': tile.isFocus,
          'memo-map-tile--remote': tile.hop > 1,
        }"
        :style="tile.style"
        @click="handleTileClick(tile)"
      >
        <span class="memo-map-tile-topline">
          <span>{{ tile.roleLabel }}</span>
          <span>P={{ tile.scoreLabel }}</span>
        </span>
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
      </button>

      <div
        v-for="label in routeLabels"
        :key="label.id"
        class="memo-map-route-label"
        :class="{ 'memo-map-route-label--vertical': label.vertical }"
        :style="label.style"
      >
        <button type="button" class="memo-map-route-label-button">
          {{ label.label }}
        </button>
        <div class="memo-map-route-popover">
          <div class="memo-map-route-popover-title">{{ label.label }}</div>
          <div class="memo-map-route-popover-body" v-html="label.bodyHtml"></div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { hierarchy, treemap, treemapSquarify } from 'd3-hierarchy';
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { DEFAULT_EDGE_WEIGHT, pScore, timeAgo } from '../utils/scoring.js';
import { normalizeEditorHtml, sanitizeRichHtml } from '../utils/sanitize.js';
import { richTextFirstLine, richTextToPlainText, truncateText } from '../utils/text.js';

const props = defineProps({
  nodes: { type: Array, required: true },
  edges: { type: Array, required: true },
  currentId: { type: String, default: '' },
});

const emit = defineEmits(['navigate', 'add-relation']);

const stageEl = ref(null);
const stageSize = reactive({ width: 0, height: 0 });
let resizeObserver = null;

const CONDUIT_GAP = 18;
const OUTER_PADDING = 10;
const MIN_SIDE_WIDTH = 150;
const MIN_FOCUS_WIDTH = 210;
const MAX_VISIBLE_TILES = 28;
const FOCUS_MIN_SCORE = 36;
const HOP_DECAY = 0.58;
const CONTENT_SCORE_CAP = 12;
const RICHNESS_SCORE_CAP = 10;
const ENDPOINT_STEP = 12;
const FOCUS_SCORE_BOOST_RATIO = 1.08;
// With only a few visible blocks, cap the focus near 72% of its normal floor so two neighbors can approach one-third-screen tiles.
const MIN_FOCUS_FALLBACK_RATIO = 0.72;
const MIN_TILES_FOR_BALANCED_FOCUS = 3;
// Empirically favors slightly wide, readable text blocks while leaving enough gutters for conduits.
const TREEMAP_ASPECT_RATIO = 1.18;
const MIN_TILE_FONT_SIZE = 10;
const TILE_FONT_SCALE = 24;
const FOCUS_MAX_FONT_SIZE = 18;
const TILE_MAX_FONT_SIZE = 16;
const MIN_VERTICAL_LABEL_LENGTH = 60;
const VERTICAL_LABEL_MIN_ASPECT_RATIO = 0.35;
const ROUTE_EDGE_PADDING = 18;

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

function plainTextFromHtml(html) {
  return richTextToPlainText(html) || (/<img\s[^>]*>|<img>/i.test(html) ? 'Image-only page.' : '');
}

function richnessFromHtml(html) {
  const imageScore = (html.match(/<img\b/gi)?.length || 0) * 4;
  const headingScore = (html.match(/<h[1-6]\b/gi)?.length || 0) * 1.6;
  const listScore = (html.match(/<(ul|ol|li)\b/gi)?.length || 0) * 0.7;
  const emphasisScore = (html.match(/<(strong|em|blockquote|pre|a)\b/gi)?.length || 0) * 0.8;
  return clamp(imageScore + headingScore + listScore + emphasisScore, 0, RICHNESS_SCORE_CAP);
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
    stats.get(edge.fromId).outgoing++;
    stats.get(edge.fromId).weight += edge.weight || DEFAULT_EDGE_WEIGHT;
    stats.get(edge.toId).incoming++;
    stats.get(edge.toId).weight += edge.weight || DEFAULT_EDGE_WEIGHT;
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
    .paddingInner(CONDUIT_GAP)
    .round(true)(root);

  return root.leaves().map(leaf => ({
    ...leaf.data,
    x: bounds.x + leaf.x0,
    y: bounds.y + leaf.y0,
    width: Math.max(1, leaf.x1 - leaf.x0),
    height: Math.max(1, leaf.y1 - leaf.y0),
  }));
}

const layoutModels = computed(() => {
  const width = stageSize.width - OUTER_PADDING * 2;
  const height = stageSize.height - OUTER_PADDING * 2;
  if (width <= 0 || height <= 0) return [];

  const models = visibleNodeModels.value;
  const focus = models.find(model => model.node.id === props.currentId);
  if (!focus) return [];

  const incoming = models.filter(model => model.node.id !== props.currentId && model.side === 'incoming');
  const outgoing = models.filter(model => model.node.id !== props.currentId && model.side !== 'incoming');
  const groups = [
    { key: 'incoming', models: incoming, value: incoming.reduce((sum, model) => sum + model.score, 0) },
    { key: 'focus', models: [focus], value: focus.score },
    { key: 'outgoing', models: outgoing, value: outgoing.reduce((sum, model) => sum + model.score, 0) },
  ].filter(group => group.models.length);

  const gapTotal = CONDUIT_GAP * Math.max(0, groups.length - 1);
  const availableWidth = width - gapTotal;
  const totalValue = groups.reduce((sum, group) => sum + Math.max(1, group.value), 0);
  const minWidths = new Map(groups.map(group => [
    group.key,
    group.key === 'focus' ? Math.min(MIN_FOCUS_WIDTH, availableWidth) : Math.min(MIN_SIDE_WIDTH, availableWidth),
  ]));
  let remainingWidth = availableWidth;
  let remainingValue = totalValue;
  const widths = new Map();

  for (const group of groups) {
    const minWidth = minWidths.get(group.key);
    const idealWidth = availableWidth * (Math.max(1, group.value) / totalValue);
    // For multiple groups, enforce minimum widths to preserve readable columns; single-group layouts fill the stage naturally.
    if (idealWidth < minWidth && groups.length > 1) {
      widths.set(group.key, minWidth);
      remainingWidth -= minWidth;
      remainingValue -= Math.max(1, group.value);
    }
  }

  for (const group of groups) {
    if (widths.has(group.key)) continue;
    const widthShare = remainingValue > 0
      ? remainingWidth * (Math.max(1, group.value) / remainingValue)
      : remainingWidth / groups.length;
    widths.set(group.key, Math.max(1, widthShare));
  }

  let x = OUTER_PADDING;
  const laidOut = [];
  for (const group of groups) {
    const groupWidth = widths.get(group.key);
    if (group.key === 'focus') {
      laidOut.push({
        ...focus,
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
      }));
    }
    x += groupWidth + CONDUIT_GAP;
  }

  return laidOut;
});

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
    const bodyHtml = nodeContentStats.value.get(model.node.id)?.html || '';
    return {
      id: model.node.id,
      isFocus: model.node.id === props.currentId,
      hop: model.hop,
      title: model.node.title || '(untitled)',
      roleLabel: roleLabel(model),
      scoreLabel: model.score.toFixed(1),
      bodyHtml,
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

function distributeOffset(index, count) {
  return (index - (count - 1) / 2) * ENDPOINT_STEP;
}

function sideEndpoints(edge, index, count) {
  const from = tileRects.value.get(edge.fromId);
  const to = tileRects.value.get(edge.toId);
  const fromCenterX = from.x + from.width / 2;
  const toCenterX = to.x + to.width / 2;
  const laneOffset = distributeOffset(index, count);
  const sourceOnLeft = fromCenterX <= toCenterX;
  const sourceX = sourceOnLeft ? from.x + from.width : from.x;
  const targetX = sourceOnLeft ? to.x : to.x + to.width;
  return {
    startX: sourceX,
    startY: clamp(
      from.y + from.height / 2 + laneOffset,
      from.y + ROUTE_EDGE_PADDING,
      from.y + from.height - ROUTE_EDGE_PADDING
    ),
    endX: targetX,
    endY: clamp(
      to.y + to.height / 2 - laneOffset,
      to.y + ROUTE_EDGE_PADDING,
      to.y + to.height - ROUTE_EDGE_PADDING
    ),
    laneOffset,
  };
}

function routePath(points) {
  // Orthogonal route: move to source, cross the conduit horizontally, run vertically, then enter the target horizontally.
  return `M ${points.startX} ${points.startY} H ${points.midX} V ${points.endY} H ${points.endX}`;
}

const routedEdges = computed(() => {
  const counts = new Map();
  const indexes = new Map();
  for (const edge of visibleEdges.value) {
    const key = `${edge.fromId}->${edge.toId}`;
    counts.set(key, (counts.get(key) || 0) + 1);
    indexes.set(edge.id, counts.get(key) - 1);
  }

  return visibleEdges.value.map(edge => {
    const key = `${edge.fromId}->${edge.toId}`;
    const endpoints = sideEndpoints(edge, indexes.get(edge.id), counts.get(key));
    const rawMidX = (endpoints.startX + endpoints.endX) / 2 + endpoints.laneOffset;
    const minX = Math.min(endpoints.startX, endpoints.endX) + CONDUIT_GAP / 2;
    const maxX = Math.max(endpoints.startX, endpoints.endX) - CONDUIT_GAP / 2;
    const midX = clamp(rawMidX, minX, maxX);
    const points = { ...endpoints, midX };
    return {
      id: edge.id,
      edge,
      ...points,
      path: routePath(points),
      label: relationLabel(edge),
      bodyHtml: relationBodyHtml(edge),
      touchesFocus: edge.fromId === props.currentId || edge.toId === props.currentId,
      strokeWidth: 1.1 + Math.min(1.8, (edge.weight || DEFAULT_EDGE_WEIGHT) / 8),
    };
  });
});

const routeLabels = computed(() =>
  routedEdges.value.map(route => {
    const verticalLength = Math.abs(route.endY - route.startY);
    const horizontalLength = Math.abs(route.endX - route.startX);
    const vertical = verticalLength > MIN_VERTICAL_LABEL_LENGTH
      && verticalLength > horizontalLength * VERTICAL_LABEL_MIN_ASPECT_RATIO;
    const rotation = vertical ? (route.endY < route.startY ? -90 : 90) : 0;
    const x = vertical ? route.midX : (route.startX + route.endX) / 2;
    const y = vertical ? (route.startY + route.endY) / 2 : route.endY - 12;
    return {
      id: route.id,
      label: route.label,
      bodyHtml: route.bodyHtml,
      vertical,
      style: {
        left: `${x}px`,
        top: `${y}px`,
        transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
      },
    };
  })
);

function handleTileClick(tile) {
  if (tile.id !== props.currentId) emit('navigate', tile.id);
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
