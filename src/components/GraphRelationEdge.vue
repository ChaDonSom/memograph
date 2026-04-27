<template>
  <BaseEdge
    :id="id"
    :path="path"
    :marker-end="markerEnd"
    :style="edgeStyle"
    :class="['memo-graph-edge-path', { 'memo-graph-edge-path--active': selected }]"
  />
  <EdgeLabelRenderer>
    <div
      class="memo-graph-edge-label"
      :class="{ 'memo-graph-edge-label--active': selected }"
      :style="{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }"
    >
      <button
        type="button"
        class="memo-graph-edge-label-button"
        @click.stop
      >
        {{ data.label }}
      </button>
      <div class="memo-graph-edge-popover" @click.stop>
        <div class="memo-graph-edge-popover-title">{{ data.label }}</div>
        <div class="memo-graph-edge-popover-body" v-html="data.bodyHtml"></div>
      </div>
    </div>
  </EdgeLabelRenderer>
</template>

<script setup>
import { computed } from 'vue';
import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath } from '@vue-flow/core';

const props = defineProps({
  id: { type: String, required: true },
  sourceX: { type: Number, required: true },
  sourceY: { type: Number, required: true },
  targetX: { type: Number, required: true },
  targetY: { type: Number, required: true },
  sourcePosition: { type: String, required: true },
  targetPosition: { type: String, required: true },
  markerEnd: { type: [String, Object], default: undefined },
  style: { type: Object, default: () => ({}) },
  data: { type: Object, required: true },
  selected: { type: Boolean, default: false },
});

const pathResult = computed(() => getSmoothStepPath({
  sourceX: props.sourceX,
  sourceY: props.sourceY,
  sourcePosition: props.sourcePosition,
  targetX: props.targetX,
  targetY: props.targetY,
  targetPosition: props.targetPosition,
  borderRadius: 20,
  offset: props.data.laneOffset || 18,
}));

const path = computed(() => pathResult.value[0]);
const labelX = computed(() => pathResult.value[1]);
const labelY = computed(() => pathResult.value[2] + (props.data.labelYOffset || 0));
const edgeStyle = computed(() => ({
  ...props.style,
  strokeWidth: props.data.strokeWidth || 1.7,
}));
</script>
