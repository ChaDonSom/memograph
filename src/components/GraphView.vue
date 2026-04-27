<template>
  <div class="memo-graph-view">
    <div class="memo-graph-toolbar">
      <div>
        <div class="memo-graph-kicker">Graph preview</div>
        <h2>Ilograph-style relationship map</h2>
      </div>
      <div class="memo-graph-toolbar-actions">
        <button class="btn btn-ghost" @click="$emit('add-relation')">+ Add relation</button>
        <button class="btn btn-ghost" @click="fitGraph">Fit</button>
      </div>
    </div>

    <VueFlow
      v-model:nodes="flowNodes"
      v-model:edges="flowEdges"
      class="memo-graph-flow"
      :default-viewport="{ zoom: 0.82, x: 80, y: 60 }"
      :min-zoom="0.18"
      :max-zoom="1.35"
      :fit-view-on-init="true"
      :nodes-draggable="true"
      :nodes-connectable="false"
      :elements-selectable="true"
      @node-click="handleNodeClick"
    >
      <template #node-memoPage="{ data }">
        <div
          class="memo-graph-node"
          :class="{
            'memo-graph-node--current': data.isCurrent,
            'memo-graph-node--remote': data.isRemote,
          }"
          :style="{ '--memo-importance': data.importanceRatio }"
        >
          <Handle
            v-for="handle in data.handles"
            :key="`target-${handle.id}`"
            type="target"
            :id="`target-${handle.id}`"
            :position="Position.Left"
            class="memo-graph-handle memo-graph-handle--left"
            :style="{ top: handle.top }"
          />
          <Handle
            v-for="handle in data.handles"
            :key="`source-${handle.id}`"
            type="source"
            :id="`source-${handle.id}`"
            :position="Position.Right"
            class="memo-graph-handle memo-graph-handle--right"
            :style="{ top: handle.top }"
          />
          <div class="memo-graph-node-topline">
            <span>{{ data.roleLabel }}</span>
            <span class="memo-graph-node-score">P={{ data.scoreLabel }}</span>
          </div>
          <div class="memo-graph-node-title">{{ data.title }}</div>
          <div
            v-if="data.bodyHtml"
            class="memo-graph-node-body rel-rich"
            v-html="data.bodyHtml"
          ></div>
          <div v-else class="memo-graph-node-body memo-graph-node-body--empty">
            No page details yet.
          </div>
          <div class="memo-graph-node-meta">{{ data.meta }}</div>
        </div>
      </template>

      <template #edge-memoRelation="edgeProps">
        <GraphRelationEdge v-bind="edgeProps" />
      </template>
    </VueFlow>
  </div>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue';
import ELK from 'elkjs/lib/elk.bundled.js';
import { Handle, MarkerType, Position, VueFlow, useVueFlow } from '@vue-flow/core';
import GraphRelationEdge from './GraphRelationEdge.vue';
import { DEFAULT_EDGE_WEIGHT, pScore, timeAgo } from '../utils/scoring.js';
import { normalizeEditorHtml, sanitizeRichHtml } from '../utils/sanitize.js';
import { richTextFirstLine, richTextToPlainText, truncateText } from '../utils/text.js';

const props = defineProps({
  nodes: { type: Array, required: true },
  edges: { type: Array, required: true },
  currentId: { type: String, default: '' },
});

const emit = defineEmits(['navigate', 'add-relation']);

const elk = new ELK();
const flowNodes = ref([]);
const flowEdges = ref([]);
const { fitView } = useVueFlow();

const PAGE_WIDTH_MIN = 190;
const PAGE_WIDTH_RANGE = 120;
const PAGE_HEIGHT_MIN = 118;
const PAGE_HEIGHT_RANGE = 98;
const HANDLE_COUNT = 7;
const LAYOUT_PADDING = 56;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function nodeBodyHtml(node) {
  return sanitizeRichHtml(normalizeEditorHtml(node.bodyHtml || ''));
}

function pagePlainText(node) {
  const html = nodeBodyHtml(node);
  return richTextToPlainText(html) || (/<img\s[^>]*>|<img>/i.test(html) ? 'Image-only page.' : '');
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

function escapeText(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const nodeScores = computed(() => {
  const scores = new Map(props.nodes.map(node => [node.id, 0]));
  const byId = new Map(props.nodes.map(node => [node.id, node]));
  for (const edge of props.edges) {
    const from = byId.get(edge.fromId);
    const to = byId.get(edge.toId);
    if (to) scores.set(to.id, Math.max(scores.get(to.id) || 0, pScore(edge, to)));
    if (from) scores.set(from.id, Math.max(scores.get(from.id) || 0, pScore(edge, from) * 0.82));
  }
  for (const node of props.nodes) {
    const visitBoost = Math.log2((node.visits || 0) + 1) * 2;
    scores.set(node.id, Math.max(scores.get(node.id) || 0, visitBoost + DEFAULT_EDGE_WEIGHT));
  }
  if (props.currentId) scores.set(props.currentId, Math.max(scores.get(props.currentId) || 0, 34));
  return scores;
});

const scoreRange = computed(() => {
  const values = [...nodeScores.value.values()];
  return {
    min: Math.min(...values, DEFAULT_EDGE_WEIGHT),
    max: Math.max(...values, DEFAULT_EDGE_WEIGHT + 1),
  };
});

function importanceRatio(nodeId) {
  const { min, max } = scoreRange.value;
  return clamp(((nodeScores.value.get(nodeId) || min) - min) / Math.max(1, max - min), 0, 1);
}

function graphNodeDimensions(nodeId) {
  const ratio = importanceRatio(nodeId);
  return {
    width: Math.round(PAGE_WIDTH_MIN + ratio * PAGE_WIDTH_RANGE),
    height: Math.round(PAGE_HEIGHT_MIN + ratio * PAGE_HEIGHT_RANGE),
  };
}

function nodeRoleLabel(nodeId) {
  if (nodeId === props.currentId) return 'Focused page';
  const incoming = props.edges.some(edge => edge.toId === nodeId && edge.fromId === props.currentId);
  const outgoing = props.edges.some(edge => edge.fromId === nodeId && edge.toId === props.currentId);
  if (incoming && outgoing) return 'Bidirectional';
  if (incoming) return 'Incoming';
  if (outgoing) return 'Outgoing';
  return 'Related page';
}

function handleLane(index) {
  return index % HANDLE_COUNT;
}

function handleOffset(lane) {
  return `${18 + lane * (64 / (HANDLE_COUNT - 1))}%`;
}

function parallelIndex(edge, allEdges) {
  const siblings = allEdges.filter(item =>
    item.fromId === edge.fromId
    && item.toId === edge.toId
  );
  return Math.max(0, siblings.findIndex(item => item.id === edge.id));
}

function nodeData(node) {
  const ratio = importanceRatio(node.id);
  const bodyHtml = nodeBodyHtml(node);
  return {
    title: node.title || '(untitled)',
    roleLabel: nodeRoleLabel(node.id),
    isCurrent: node.id === props.currentId,
    isRemote: node.id !== props.currentId && !props.edges.some(edge =>
      (edge.fromId === props.currentId && edge.toId === node.id)
      || (edge.toId === props.currentId && edge.fromId === node.id)
    ),
    importanceRatio: ratio.toFixed(3),
    scoreLabel: (nodeScores.value.get(node.id) || 0).toFixed(1),
    bodyHtml,
    excerpt: truncateText(pagePlainText(node), 170),
    meta: `Edited ${timeAgo(node.updatedAt)} · ${node.visits || 0} visit${node.visits === 1 ? '' : 's'}`,
    handles: Array.from({ length: HANDLE_COUNT }, (_, id) => ({ id, top: handleOffset(id) })),
  };
}

function buildElkGraph() {
  return {
    id: 'memograph',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'RIGHT',
      'elk.spacing.nodeNode': '34',
      'elk.layered.spacing.nodeNodeBetweenLayers': '96',
      'elk.layered.spacing.edgeNodeBetweenLayers': '42',
      'elk.layered.spacing.edgeEdgeBetweenLayers': '20',
      'elk.edgeRouting': 'ORTHOGONAL',
      'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
      'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
      'elk.padding': `[top=${LAYOUT_PADDING},left=${LAYOUT_PADDING},bottom=${LAYOUT_PADDING},right=${LAYOUT_PADDING}]`,
    },
    children: props.nodes.map(node => ({
      id: node.id,
      ...graphNodeDimensions(node.id),
    })),
    edges: props.edges.map(edge => {
      const lane = handleLane(parallelIndex(edge, props.edges));
      return {
        id: edge.id,
        sources: [edge.fromId],
        targets: [edge.toId],
        labels: [{ text: relationLabel(edge), width: 122, height: 28 }],
        layoutOptions: {
          'elk.sourcePort': `source-${lane}`,
          'elk.targetPort': `target-${lane}`,
        },
      };
    }),
  };
}

async function layoutGraph() {
  if (!props.nodes.length) {
    flowNodes.value = [];
    flowEdges.value = [];
    return;
  }

  const laidOut = await elk.layout(buildElkGraph());
  const positions = new Map((laidOut.children || []).map(node => [node.id, node]));

  flowNodes.value = props.nodes.map(node => {
    const layoutNode = positions.get(node.id);
    const dimensions = graphNodeDimensions(node.id);
    return {
      id: node.id,
      type: 'memoPage',
      position: {
        x: layoutNode?.x ?? 0,
        y: layoutNode?.y ?? 0,
      },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      width: dimensions.width,
      height: dimensions.height,
      data: nodeData(node),
      class: node.id === props.currentId ? 'memo-graph-flow-node-current' : '',
      draggable: true,
    };
  });

  flowEdges.value = props.edges.map(edge => {
    const lane = handleLane(parallelIndex(edge, props.edges));
    const laneSign = lane - Math.floor(HANDLE_COUNT / 2);
    return {
      id: edge.id,
      type: 'memoRelation',
      source: edge.fromId,
      target: edge.toId,
      sourceHandle: `source-${lane}`,
      targetHandle: `target-${lane}`,
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 18,
        height: 18,
        color: '#a5b4fc',
      },
      data: {
        label: relationLabel(edge),
        bodyHtml: relationBodyHtml(edge),
        laneOffset: 24 + Math.abs(laneSign) * 9,
        labelYOffset: laneSign * 8,
        strokeWidth: 1.55 + Math.min(2.2, (edge.weight || DEFAULT_EDGE_WEIGHT) / 6),
      },
      style: {
        stroke: edge.fromId === props.currentId || edge.toId === props.currentId
          ? 'rgba(165, 180, 252, .86)'
          : 'rgba(129, 140, 248, .48)',
      },
    };
  });

  await nextTick();
  fitGraph();
}

function handleNodeClick({ node }) {
  if (node.id !== props.currentId) emit('navigate', node.id);
}

function fitGraph() {
  nextTick(() => {
    fitView({ padding: 0.18, duration: 280, includeHiddenNodes: false });
  });
}

watch(
  () => [props.nodes, props.edges, props.currentId],
  layoutGraph,
  { deep: true, immediate: true }
);
</script>
