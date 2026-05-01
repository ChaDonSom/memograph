<script lang="ts">
export default {}
</script>
<script setup lang="ts">
import { useElementSize } from "@vueuse/core"
import { hierarchy, treemap, treemapSquarify } from "d3-hierarchy"
import { computed, ref } from "vue"

const props = defineProps<{
  nodes: any[]
  edges: any[]
  currentId: string
}>()

const mainRef = ref<HTMLDivElement>()
const mainRefSize = useElementSize(mainRef)

// Space between sibling tiles so adjacent rectangles do not visually merge together.
const GUTTER = 4
// `treemapSquarify` takes a desired width:height ratio hint.
// `1` would mean perfect squares; `1.18` gently nudges the layout toward squarer tiles
// than D3's default golden-ratio setting without forcing every tile to be square.
const TREEMAP_ASPECT_RATIO = 1.18

const nodesWithPositions = computed(() => {
  // `useElementSize` can report fractional values; D3 layout is easier to reason about
  // when the container bounds are whole pixels.
  const width = Math.max(0, Math.floor(Number(mainRefSize.width.value)))
  const height = Math.max(0, Math.floor(Number(mainRefSize.height.value)))
  if (!props.nodes.length || width <= 0 || height <= 0) return []

  // D3 treemap expects one hierarchy root, even if our data is really just a flat list.
  // We create a synthetic parent with each note as a child leaf.
  const root = hierarchy({
    children: props.nodes.map((node) => ({
      ...node,
      // Treemap area is proportional to `value`.
      // We clamp to at least `1` so a node with `0` visits does not collapse into a 0x0 tile.
      value: Math.max(1, Number(node.visits) || 0),
    })),
    // `sum(...)` is required before running the layout: D3 walks the tree bottom-up and
    // stores the aggregate value each rectangle should represent.
  }).sum((item: any) => item.value || 0)

  treemap<any>()
    // `treemapSquarify` is the strip-based treemap algorithm.
    // Instead of alternating raw horizontal/vertical cuts, it groups siblings into strips
    // that try to keep rectangles readable and not too skinny.
    .tile(treemapSquarify.ratio(TREEMAP_ASPECT_RATIO))
    .size([width, height])
    // Inner padding adds spacing only between sibling tiles, not around the outer edge.
    .paddingInner(GUTTER)
    // `round(true)` snaps computed edges to whole pixels so adjacent tiles line up cleanly.
    // The trailing `(root)` is the actual execution step: after configuring the layout,
    // we immediately run it and D3 mutates each node with `x0`, `y0`, `x1`, and `y1` bounds.
    .round(true)(root)

  // `leaves()` skips the synthetic root and returns only the real note nodes we want to render.
  return root.leaves().map((leaf: any) => ({
    id: leaf.data.id,
    // D3 stores rectangle geometry as edges:
    // `x0`/`y0` = top-left corner, `x1`/`y1` = bottom-right corner.
    x: leaf.x0,
    y: leaf.y0,
    // Width is right edge minus left edge.
    // We clamp to at least `1` so rounding does not leave a visually invisible 0px tile.
    width: Math.max(1, leaf.x1 - leaf.x0),
    // Height is bottom edge minus top edge, with the same 1px minimum for visibility.
    height: Math.max(1, leaf.y1 - leaf.y0),
  }))
})

// Lookup table for View
const nodesById = computed(() => {
  const lookup: Record<string, any> = {}
  props.nodes.forEach((n) => (lookup[n.id] = n))
  return lookup
})
</script>

<template>
  <div class="p-4 w-full h-full overflow-y-scroll" ref="mainRef">
    <div class="fixed right-3 top-3 p-2">
      <h2>By visit...</h2>
    </div>
    <div class="relative w-full h-full min-h-full">
      <div
        v-for="node in nodesWithPositions"
        :key="node.id"
        :style="{
          position: 'absolute',
          left: node.x + 'px',
          top: node.y + 'px',
          width: node.width + 'px',
          height: node.height + 'px',
          zIndex: props.currentId === node.id ? 10 : 1,
        }"
        class="bg-blue-500 text-white flex items-center justify-center rounded overflow-hidden px-2 text-center"
      >
        {{ nodesById[node.id].title }} ({{ nodesById[node.id].visits }})
      </div>
    </div>
  </div>
</template>
