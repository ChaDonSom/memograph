<script lang="ts">
export default {}
</script>
<script setup lang="ts">
import { useElementSize } from "@vueuse/core"
import { hierarchy, treemap, treemapDice, treemapSlice, treemapSquarify } from "d3-hierarchy"
import { computed, ref } from "vue"
import { buildNeighborSummary, findStrongestNeighborOverlaps } from "./communityDiscovering"
import MyTreemapViewNode from "./MyTreemapViewNode.vue"

const props = defineProps<{
  nodes: any[]
  // Graph edges use the same shape as the rest of the app: fromId -> toId.
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
const FEATURED_COUNT = 3

// Keep the component-side names simple. The heavier graph-reading logic lives next door.
const neighborSummary = computed(() => buildNeighborSummary(props.nodes, props.edges))

const strongestNeighborOverlaps = computed(() => findStrongestNeighborOverlaps(props.nodes, props.edges))

const squarifyTile = treemapSquarify.ratio(TREEMAP_ASPECT_RATIO)

function reorderFeaturedNodes(nodes: any[]) {
  if (nodes.length !== 3) return nodes
  return [nodes[1], nodes[0], nodes[2]]
}

function featuredTreemapTile(node: any, x0: number, y0: number, x1: number, y1: number) {
  if (!node.children?.length) return

  // Depth 0 is our synthetic root with exactly two children: `featured` and `rest`.
  // `treemapSlice` stacks those groups top-to-bottom, which guarantees the featured band stays high.
  if (node.depth === 0) {
    treemapSlice(node, x0, y0, x1, y1)
    return
  }

  // Inside the featured band we lay the three highlighted tiles left-to-right.
  // Because we reorder them as [2nd, 1st, 3rd], the biggest tile lands in the middle.
  if (node.data.groupKey === "featured") {
    treemapDice(node, x0, y0, x1, y1)
    return
  }

  // Everything else can use the normal squarified layout.
  squarifyTile(node, x0, y0, x1, y1)
}

const nodesWithPositions = computed(() => {
  // `useElementSize` can report fractional values; D3 layout is easier to reason about
  // when the container bounds are whole pixels.
  const width = Math.max(0, Math.floor(Number(mainRefSize.width.value)))
  const height = Math.max(0, Math.floor(Number(mainRefSize.height.value)))
  if (!props.nodes.length || width <= 0 || height <= 0) return []

  const sortedNodes = [...props.nodes].sort((a, b) => (Number(b.visits) || 0) - (Number(a.visits) || 0))
  const featuredNodes = reorderFeaturedNodes(sortedNodes.slice(0, FEATURED_COUNT))
  const remainingNodes = sortedNodes.slice(FEATURED_COUNT)
  const groups = [
    {
      groupKey: "featured",
      children: featuredNodes,
    },
    {
      groupKey: "rest",
      children: remainingNodes,
    },
  ].filter((group) => group.children.length)

  // D3 treemap expects one hierarchy root, even if our data is really just a flat list.
  // We create a synthetic parent and split the notes into two groups:
  // a featured strip for the biggest few nodes, and a remainder group below it.
  const root = hierarchy({
    children: groups.map((group) => ({
      groupKey: group.groupKey,
      children: group.children.map((node) => ({
        ...node,
        // Treemap area is proportional to `value`.
        // We clamp to at least `1` so a node with `0` visits does not collapse into a 0x0 tile.
        value: Math.max(1, Number(node.visits) || 0),
      })),
    })),
    // `sum(...)` is required before running the layout: D3 walks the tree bottom-up and
    // stores the aggregate value each rectangle should represent.
  }).sum((item: any) => item.value || 0)

  treemap<any>()
    // The root uses a custom tiler so the biggest few nodes occupy a dedicated top strip.
    // The remainder still uses squarified packing inside its own region.
    .tile(featuredTreemapTile)
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
    <div
      class="fixed right-3 top-3 max-h-[calc(100vh-1.5rem)] max-w-lg overflow-auto rounded bg-white/95 p-3 text-xs text-slate-900 shadow-lg z-30"
    >
      <h2 class="mb-2 text-sm font-semibold">Community discovery debug</h2>
      <details>
        <summary class="cursor-pointer font-medium">Neighbor summary</summary>
        <pre>{{ JSON.stringify(neighborSummary.slice(0, 20), null, 2) }}</pre>
      </details>
      <details open>
        <summary class="cursor-pointer font-medium">Shared-neighbor pairs</summary>
        <pre>{{ JSON.stringify(strongestNeighborOverlaps, null, 2) }}</pre>
      </details>
    </div>
    <div class="relative w-full h-full min-h-full">
      <MyTreemapViewNode
        :node="node"
        :current-id="currentId"
        :nodes-by-id="nodesById"
        v-for="node in nodesWithPositions"
        :key="node.id"
      />
    </div>
  </div>
</template>
