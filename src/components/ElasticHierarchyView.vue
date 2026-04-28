<template>
  <div class="memo-graph-view elastic-hierarchy-view">
    <div class="memo-graph-toolbar">
      <div>
        <div class="memo-graph-kicker">Elastic hierarchy</div>
        <h2>P-value treemap with relationship connectors</h2>
      </div>
      <div class="memo-graph-toolbar-summary">
        {{ visibleTiles.length }} pages · {{ connectorRoutes.length }} relationships
      </div>
      <div class="memo-graph-toolbar-actions">
        <button class="btn btn-ghost" @click="$emit('add-relation')">+ Add relation</button>
      </div>
    </div>

    <div ref="stageEl" class="elastic-stage">
      <svg
        class="elastic-routes"
        :width="stageSize.width"
        :height="stageSize.height"
        :viewBox="`0 0 ${stageSize.width} ${stageSize.height}`"
        aria-hidden="true"
      >
        <defs>
          <marker id="elastic-route-arrow" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto" markerUnits="strokeWidth">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
          </marker>
        </defs>
        <path
          v-for="route in connectorRoutes"
          :key="route.id"
          class="elastic-route"
          :class="{ 'elastic-route--focused': route.touchesFocus, 'elastic-route--active': isRouteActive(route) }"
          :d="route.path"
          :style="{ strokeWidth: route.strokeWidth }"
          marker-end="url(#elastic-route-arrow)"
          @mouseenter="activateRoute(route)"
          @mouseleave="clearHighlight"
        />
      </svg>

      <button
        v-for="tile in visibleTiles"
        :key="tile.id"
        type="button"
        class="elastic-tile"
        :class="{
          'elastic-tile--focus': tile.isFocus,
          'elastic-tile--active': isTileActive(tile.id),
        }"
        :style="tile.style"
        :aria-label="`${tile.title}. ${tile.groupLabel}. P value ${tile.scoreLabel}. Open page.`"
        @click="$emit('navigate', tile.id)"
        @mouseenter="activateNode(tile.id)"
        @mouseleave="clearHighlight"
        @focusin="activateNode(tile.id)"
        @focusout="clearHighlight"
      >
        <span class="elastic-tile-kicker">{{ tile.groupLabel }}</span>
        <span class="elastic-tile-title">{{ tile.title }}</span>
        <span class="elastic-tile-body">{{ tile.preview }}</span>
        <span class="elastic-tile-meta">P={{ tile.scoreLabel }} · {{ tile.degree }} link{{ tile.degree === 1 ? '' : 's' }}</span>
      </button>

      <div
        v-for="route in connectorRoutes"
        :key="`${route.id}-label`"
        class="elastic-route-label"
        :class="{ 'elastic-route-label--active': isRouteActive(route) }"
        :style="route.labelStyle"
        @mouseenter="activateRoute(route)"
        @mouseleave="clearHighlight"
      >
        <button type="button" class="elastic-route-label-button">
          {{ route.label }}
        </button>
        <div class="elastic-route-popover">
          <div class="elastic-route-popover-title">{{ route.fromTitle }} → {{ route.toTitle }}</div>
          <div class="elastic-route-popover-body">{{ route.description }}</div>
          <div class="elastic-route-popover-actions">
            <button class="btn btn-ghost" @click.stop="$emit('edit-relation', route.edge)">Edit relation</button>
            <button class="btn btn-danger" @click.stop="$emit('delete-relation', route.edge)">Delete relation</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { hierarchy, treemap, treemapSquarify } from 'd3-hierarchy';
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { DEFAULT_EDGE_WEIGHT, pScore, timeAgo } from '../utils/scoring.js';
import { normalizeEditorHtml, sanitizeRichHtml } from '../utils/sanitize.js';
import { richTextFirstLine, richTextToPlainText, truncateText } from '../utils/text.js';

const props = defineProps({
  nodes: { type: Array, required: true },
  edges: { type: Array, required: true },
  currentId: { type: String, default: '' },
});

defineEmits(['navigate', 'add-relation', 'edit-relation', 'delete-relation']);

const stageEl = ref(null);
const stageSize = reactive({ width: 0, height: 0 });
const activeNodeId = ref('');
const activeEdgeId = ref('');
let resizeObserver = null;

const OUTER_PADDING = 18;
const GROUP_PADDING = 14;
const TILE_PADDING = 8;
const MIN_STAGE_HEIGHT = 520;
const MAX_TILES = 42;
const TREEMAP_RATIO = 1.35;
const FOCUS_SCORE_FLOOR = 48;
const HOP_DECAY = 0.64;
const CONTENT_SCORE_CAP = 12;
const MIN_ROUTE_CURVE = 40;
const MAX_ROUTE_CURVE = 180;
const ROUTE_LABEL_OFFSET = 12;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function nodeTitle(node) {
  return node?.title || '(untitled)';
}

function nodeText(node) {
  const html = sanitizeRichHtml(normalizeEditorHtml(node.bodyHtml || ''));
  return richTextToPlainText(html) || (/<img\s[^>]*>|<img>/i.test(html) ? 'Image-only page.' : 'No page details yet.');
}

function relationLabel(edge) {
  const html = sanitizeRichHtml(normalizeEditorHtml(edge.descHtml || ''));
  return truncateText(richTextFirstLine(html) || edge.desc || 'Relationship', 48);
}

function relationDescription(edge) {
  const html = sanitizeRichHtml(normalizeEditorHtml(edge.descHtml || ''));
  return truncateText(richTextToPlainText(html) || edge.desc || 'No relationship details yet.', 180);
}

const nodesById = computed(() => new Map(props.nodes.map(node => [node.id, node])));

const graphDistances = computed(() => {
  if (!props.currentId) return new Map();
  const distances = new Map([[props.currentId, 0]]);
  const queue = [props.currentId];
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i];
    const nextHop = distances.get(id) + 1;
    for (const edge of props.edges) {
      const nextId = edge.fromId === id ? edge.toId : edge.toId === id ? edge.fromId : '';
      if (!nextId || distances.has(nextId)) continue;
      distances.set(nextId, nextHop);
      queue.push(nextId);
    }
  }
  return distances;
});

const nodeScores = computed(() => {
  const scores = new Map();
  const degree = new Map(props.nodes.map(node => [node.id, 0]));
  for (const node of props.nodes) {
    const contentScore = clamp(Math.log2(nodeText(node).length + 1) * 1.25, 0, CONTENT_SCORE_CAP);
    const visitScore = Math.log2((node.visits || 0) + 1) * 1.8;
    scores.set(node.id, Math.max(1, contentScore + visitScore));
  }

  for (const edge of props.edges) {
    const from = nodesById.value.get(edge.fromId);
    const to = nodesById.value.get(edge.toId);
    if (from) {
      scores.set(from.id, scores.get(from.id) + pScore(edge, from) * 0.4);
      degree.set(from.id, (degree.get(from.id) || 0) + 1);
    }
    if (to) {
      scores.set(to.id, scores.get(to.id) + pScore(edge, to));
      degree.set(to.id, (degree.get(to.id) || 0) + 1);
    }
  }

  if (props.currentId) scores.set(props.currentId, Math.max(scores.get(props.currentId) || 0, FOCUS_SCORE_FLOOR));
  return { scores, degree };
});

function groupForNode(node, hop) {
  if (node.id === props.currentId) return { key: 'focus', label: 'Focused page', order: 0 };
  if (hop === 1) {
    const incoming = props.edges.some(edge => edge.fromId === node.id && edge.toId === props.currentId);
    const outgoing = props.edges.some(edge => edge.fromId === props.currentId && edge.toId === node.id);
    if (incoming && outgoing) return { key: 'direct', label: 'Reciprocal', order: 1 };
    if (incoming) return { key: 'incoming', label: 'Incoming', order: 2 };
    if (outgoing) return { key: 'outgoing', label: 'Outgoing', order: 3 };
  }
  if (Number.isFinite(hop)) return { key: 'related', label: `${hop} hops away`, order: 4 };
  return { key: 'archive', label: 'Other pages', order: 5 };
}

const rankedNodeModels = computed(() => {
  const { scores, degree } = nodeScores.value;
  return props.nodes
    .map(node => {
      const hop = graphDistances.value.get(node.id) ?? Number.POSITIVE_INFINITY;
      const group = groupForNode(node, hop);
      const score = (scores.get(node.id) || 1) * (Number.isFinite(hop) ? Math.pow(HOP_DECAY, Math.max(0, hop - 1)) : 0.28);
      return {
        id: node.id,
        node,
        hop,
        group,
        score,
        degree: degree.get(node.id) || 0,
      };
    })
    .sort((a, b) => a.group.order - b.group.order || b.score - a.score)
    .slice(0, MAX_TILES);
});

const layoutModels = computed(() => {
  const width = stageSize.width || 1;
  const height = Math.max(stageSize.height || 1, MIN_STAGE_HEIGHT);
  const groups = new Map();
  for (const model of rankedNodeModels.value) {
    if (!groups.has(model.group.key)) {
      groups.set(model.group.key, {
        name: model.group.key,
        label: model.group.label,
        order: model.group.order,
        children: [],
      });
    }
    groups.get(model.group.key).children.push({
      ...model,
      name: model.id,
      value: Math.max(1, model.score),
    });
  }

  const root = hierarchy({
    name: 'elastic-root',
    children: [...groups.values()].sort((a, b) => a.order - b.order),
  }).sum(item => item.value || 0);

  treemap()
    .tile(treemapSquarify.ratio(TREEMAP_RATIO))
    .size([Math.max(1, width - OUTER_PADDING * 2), Math.max(1, height - OUTER_PADDING * 2)])
    .paddingOuter(GROUP_PADDING)
    .paddingInner(TILE_PADDING)
    .round(true)(root);

  return root.leaves().map(leaf => ({
    ...leaf.data,
    x: leaf.x0 + OUTER_PADDING,
    y: leaf.y0 + OUTER_PADDING,
    width: Math.max(1, leaf.x1 - leaf.x0),
    height: Math.max(1, leaf.y1 - leaf.y0),
  }));
});

const visibleTiles = computed(() =>
  layoutModels.value.map(model => {
    const areaRatio = clamp((model.width * model.height) / Math.max(1, stageSize.width * stageSize.height), 0, 1);
    return {
      id: model.id,
      title: nodeTitle(model.node),
      preview: truncateText(nodeText(model.node), areaRatio > 0.08 ? 220 : 96),
      groupLabel: model.group.label,
      scoreLabel: model.score.toFixed(1),
      score: model.score,
      degree: model.degree,
      isFocus: model.id === props.currentId,
      rect: model,
      style: {
        left: `${model.x}px`,
        top: `${model.y}px`,
        width: `${model.width}px`,
        height: `${model.height}px`,
        fontSize: `${clamp(10 + Math.sqrt(areaRatio) * 24, 10, model.id === props.currentId ? 19 : 16)}px`,
      },
    };
  })
);

const tileRects = computed(() => new Map(visibleTiles.value.map(tile => [tile.id, tile.rect])));

function rectCenter(rect) {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

function portFor(rect, other) {
  const center = rectCenter(rect);
  const otherCenter = rectCenter(other);
  const dx = otherCenter.x - center.x;
  const dy = otherCenter.y - center.y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return { x: dx >= 0 ? rect.x + rect.width : rect.x, y: clamp(otherCenter.y, rect.y + 14, rect.y + rect.height - 14) };
  }
  return { x: clamp(otherCenter.x, rect.x + 14, rect.x + rect.width - 14), y: dy >= 0 ? rect.y + rect.height : rect.y };
}

function connectorPath(start, end, score, index) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const distance = Math.hypot(dx, dy);
  const curve = clamp(distance * 0.28 + score * 0.9, MIN_ROUTE_CURVE, MAX_ROUTE_CURVE);
  const normal = distance ? { x: -dy / distance, y: dx / distance } : { x: 0, y: 1 };
  const laneOffset = ((index % 7) - 3) * 8;
  const c1 = { x: start.x + dx * 0.34 + normal.x * (curve + laneOffset), y: start.y + dy * 0.34 + normal.y * (curve + laneOffset) };
  const c2 = { x: start.x + dx * 0.66 + normal.x * (curve + laneOffset), y: start.y + dy * 0.66 + normal.y * (curve + laneOffset) };
  return `M ${start.x} ${start.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${end.x} ${end.y}`;
}

const connectorRoutes = computed(() =>
  props.edges
    .map((edge, index) => {
      const from = tileRects.value.get(edge.fromId);
      const to = tileRects.value.get(edge.toId);
      if (!from || !to) return null;
      const source = portFor(from, to);
      const target = portFor(to, from);
      const targetNode = nodesById.value.get(edge.toId);
      const score = targetNode ? pScore(edge, targetNode) : edge.weight || DEFAULT_EDGE_WEIGHT;
      const labelX = (source.x + target.x) / 2;
      const labelY = (source.y + target.y) / 2 - ROUTE_LABEL_OFFSET;
      return {
        id: edge.id,
        edge,
        fromId: edge.fromId,
        toId: edge.toId,
        fromTitle: nodeTitle(nodesById.value.get(edge.fromId)),
        toTitle: nodeTitle(targetNode),
        label: relationLabel(edge),
        description: relationDescription(edge),
        score,
        path: connectorPath(source, target, score, index),
        strokeWidth: 1 + clamp(score / 18, 0.4, 2.8),
        touchesFocus: edge.fromId === props.currentId || edge.toId === props.currentId,
        labelStyle: {
          left: `${labelX}px`,
          top: `${labelY}px`,
        },
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.score - b.score)
);

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

function isRouteActive(route) {
  return activeEdgeId.value === route.id
    || (!!activeNodeId.value && (route.fromId === activeNodeId.value || route.toId === activeNodeId.value));
}

function isTileActive(tileId) {
  return activeNodeId.value === tileId
    || connectorRoutes.value.some(route => isRouteActive(route) && (route.fromId === tileId || route.toId === tileId));
}

function updateStageSize() {
  const rect = stageEl.value?.getBoundingClientRect();
  if (!rect) return;
  stageSize.width = Math.round(rect.width);
  stageSize.height = Math.max(MIN_STAGE_HEIGHT, Math.round(rect.height));
}

onMounted(() => {
  updateStageSize();
  resizeObserver = new ResizeObserver(updateStageSize);
  if (stageEl.value) resizeObserver.observe(stageEl.value);
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
});
</script>
