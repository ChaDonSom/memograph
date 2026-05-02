/**
 * This file is the graph-reading companion to `MyTreemapView.vue`.
 *
 * `MyTreemapView` already explains the treemap geometry side of the project:
 * values become rectangle areas, D3 packs those areas into a container, and
 * custom tilers decide where the major bands land.
 *
 * This helper sits one step earlier in the pipeline.
 * Before a treemap can become "community aware", we need a simpler answer first:
 * which pages appear to belong together in the underlying relationship graph?
 *
 * The working theory for this project is:
 * - a page is a graph node
 * - a relationship is a graph edge
 * - pages that touch the same neighbors often belong to the same local region
 *   Here, a "neighbor" simply means another page connected by at least one relationship.
 * - those regions can later become treemap groups
 * - once groups exist, treemap math can pack groups first and individual pages second
 * - only after that does relationship-line routing become easier to reason about
 *
 * The helpers here are intentionally cheap, readable probes rather than final community detectors.
 * They let a human inspect the graph structure before we commit to a stronger grouping rule.
 *
 * Two probes live here:
 * 1. `buildNeighborSummary(...)` asks: "who directly touches whom?"
 * 2. `findStrongestNeighborOverlaps(...)` asks: "which pairs live in similar neighborhoods?"
 *
 * Important modeling choice:
 * For this early discovery pass, we temporarily ignore edge direction.
 * If A links to B or B links to A, we treat both pages as touching each other.
 * That is useful because community detection usually cares more about local connectedness
 * than about arrow direction. The original directed edges still exist elsewhere for labels,
 * routing, and any later logic that needs the exact direction back.
 */

/**
 * The smallest slice of a page record we need in order to reason about communities.
 *
 * The full node objects in the app carry many more fields, but this helper only needs:
 * - a stable id so we can connect nodes together
 * - an optional title so debug output stays readable to humans
 *
 * Keeping this type small makes the helper reusable and easy to test mentally.
 */
type DiscoverableNode = {
  id: string
  title?: string | null
}

/**
 * The smallest slice of a relationship record we need for neighborhood math.
 *
 * `fromId` and `toId` represent the two endpoints of a directed edge in the app's real data model.
 * We accept them as optional here because partially edited or malformed data should be safely skippable
 * during debug exploration instead of crashing the panel.
 */
type DiscoverableEdge = {
  fromId?: string | null
  toId?: string | null
}

/**
 * Human-readable "pulse check" for a single node.
 *
 * This is the first trustworthy summary to inspect because it answers basic structural questions:
 * - Is this page isolated?
 * - Is it a hub?
 * - Which pages are directly adjacent to it?
 *
 * A node's "degree" means the number of unique neighbors it has.
 * In other words, degree tells us how many distinct pages this page touches at all.
 *
 * That does not make degree a community detector by itself.
 * It simply confirms that the raw graph has been read correctly before we ask deeper questions.
 */
export type NeighborSummary = {
  // Stable id so the summary can be matched back to the original node.
  id: string
  // Safe display label with blank titles normalized to a fallback string.
  title: string
  // Number of unique neighbors, not number of raw edge rows.
  degree: number
  // Neighbor ids, sorted for stable debug output and easy diffing.
  neighbors: string[]
  // The same neighbor list translated into readable titles.
  neighborTitles: string[]
}

/**
 * Human-readable comparison of one unordered pair of nodes.
 *
 * The main question here is not "are these pages directly connected to each other?"
 * The question is "do these two pages live in similar neighborhoods?"
 *
 * "Shared neighbors" means pages that appear in both nodes' neighbor lists.
 * The "union" of neighbors means every distinct neighbor seen in either list.
 * "Jaccard similarity" means shared neighbors divided by that full union.
 *
 * That is why the fields focus on the overlap between their neighbor sets.
 */
export type NeighborOverlap = {
  // First node in the unordered pair.
  aId: string
  aTitle: string
  aDegree: number
  // Second node in the unordered pair.
  bId: string
  bTitle: string
  bDegree: number
  // Raw evidence: how many neighbor pages do both nodes share?
  sharedCount: number
  // Denominator for Jaccard: all distinct neighbors seen in either list.
  unionCount: number
  // Shared neighbor ids so a human can inspect the claim directly.
  shared: string[]
  // Shared neighbor titles so the same claim is readable without id lookup.
  sharedTitles: string[]
  // SharedCount / UnionCount, rounded for display.
  jaccard: number
}

// Central place for the fallback label so every debug view names missing titles the same way.
const UNTITLED_PAGE_LABEL = "(untitled)"

/**
 * Normalize a node title into something safe to render.
 *
 * The debug panel should never make callers think about null, undefined, or empty strings.
 * By resolving that once here, every downstream summary can assume it already has a valid label.
 */
function displayTitle(node: DiscoverableNode | undefined) {
  if (!node) return UNTITLED_PAGE_LABEL
  if (typeof node.title === "string" && node.title.trim()) return node.title
  return UNTITLED_PAGE_LABEL
}

/**
 * Build `nodeId -> node` so later helpers can translate ids into readable titles cheaply.
 *
 * This is a standard lookup-table move:
 * instead of re-scanning the full node array every time we need a title,
 * we pay the one-time setup cost and get fast repeated lookups afterwards.
 */
function buildNodeLookup(nodes: DiscoverableNode[]) {
  return new Map(nodes.map((node) => [node.id, node]))
}

/**
 * Build `nodeId -> Set<neighborId>` for the current graph.
 *
 * Why a `Map`?
 * - node ids are our stable keys
 * - we want quick lookup by id
 *
 * Why a `Set` for each node?
 * - it removes duplicate neighbors automatically
 * - it gives degree as `.size`
 * - it makes "is this page already a neighbor?" cheap to answer
 *
 * This function is where the directed graph is temporarily converted into an undirected view.
 * If `fromId -> toId` exists, we record that both pages touch each other.
 * That is the right simplification for early community inspection because we are focusing on
 * local neighborhoods, not yet on arrow semantics.
 */
function buildNeighborLookup(nodes: DiscoverableNode[], edges: DiscoverableEdge[]) {
  // Start every node with an empty neighbor set so isolated pages still appear in summaries.
  const neighborsByNodeId = new Map(nodes.map((node) => [node.id, new Set<string>()]))

  for (const edge of edges) {
    const fromId = edge.fromId
    const toId = edge.toId

    // Skip incomplete rows instead of letting half-baked edit state poison the debug view.
    if (!fromId || !toId) continue

    const fromNeighbors = neighborsByNodeId.get(fromId)
    const toNeighbors = neighborsByNodeId.get(toId)

    // If an edge points at a node outside the supplied node list, ignore it.
    // This keeps the output focused on the current visible graph slice.
    if (!fromNeighbors || !toNeighbors) continue

    // Community discovery begins with the simplest structural question:
    // "who touches whom at all?"
    // So we treat the relationship as a two-way touch for this phase.
    fromNeighbors.add(toId)
    toNeighbors.add(fromId)
  }

  return neighborsByNodeId
}

/**
 * Return ids in a stable lexical order.
 *
 * Stable ordering matters more than it first appears:
 * - JSON output stops jumping around between renders
 * - diffs are easier to read
 * - a human can compare two debug snapshots without noise from insertion order
 */
function sortedIds(values: Iterable<string>) {
  return [...values].sort((left, right) => left.localeCompare(right))
}

/**
 * Translate an id list into a readable title list using our lookup table.
 *
 * We keep both ids and titles in the debug output because ids are precise for code,
 * while titles are faster for human pattern recognition.
 */
function titlesForIds(ids: string[], nodesById: Map<string, DiscoverableNode>) {
  return ids.map((id) => displayTitle(nodesById.get(id)))
}

/**
 * Sort node summaries so the structurally busiest pages float to the top.
 *
 * This ordering is a debugging convenience, not graph theory.
 * Higher degree does not automatically mean "stronger community member".
 * It simply makes hubs and suspiciously busy pages easier to inspect first.
 */
function compareNeighborSummary(left: NeighborSummary, right: NeighborSummary) {
  return right.degree - left.degree || left.title.localeCompare(right.title) || left.id.localeCompare(right.id)
}

/**
 * Sort pair overlaps so the most convincing shared-neighborhood evidence appears first.
 *
 * We rank by raw `sharedCount` before `jaccard` on purpose.
 * A tiny leaf pair can earn a perfect Jaccard of `1` with only one shared neighbor,
 * which looks mathematically neat but is weak evidence for a real community.
 * Raw shared support keeps the top of the list closer to what a human actually cares about.
 */
function compareNeighborOverlap(left: NeighborOverlap, right: NeighborOverlap) {
  return (
    right.sharedCount - left.sharedCount ||
    right.jaccard - left.jaccard ||
    right.aDegree + right.bDegree - (left.aDegree + left.bDegree) ||
    left.aTitle.localeCompare(right.aTitle) ||
    left.bTitle.localeCompare(right.bTitle)
  )
}

/**
 * Compute the set intersection between two neighbor lists.
 *
 * In graph terms, this returns the pages that both nodes touch.
 * Those shared neighbors are the raw material for overlap-based community hints.
 */
function sharedNeighborIds(leftNeighbors: Set<string>, rightNeighbors: Set<string>) {
  const shared: string[] = []

  for (const neighborId of leftNeighbors) {
    if (rightNeighbors.has(neighborId)) shared.push(neighborId)
  }

  return sortedIds(shared)
}

/**
 * First probe: summarize every node's immediate neighborhood.
 *
 * This is the cheapest trustworthy graph pulse.
 * If this output looks wrong, there is no point trusting any later community logic.
 * We use it to answer foundational questions such as:
 * - which pages are isolates?
 * - which pages are hubs?
 * - which pages touch the exact neighbors we expected?
 *
 * The return value is intentionally rich for debugging: ids for precision, titles for readability,
 * and degree so the human reader immediately sees how connected each page is.
 */
export function buildNeighborSummary(nodes: DiscoverableNode[], edges: DiscoverableEdge[]) {
  const nodesById = buildNodeLookup(nodes)
  const neighborsByNodeId = buildNeighborLookup(nodes, edges)

  return nodes
    .map((node) => {
      // Sorting here makes each node's neighbor list stable and easy to scan in a `<pre>` block.
      const neighborIds = sortedIds(neighborsByNodeId.get(node.id) || [])

      return {
        id: node.id,
        title: displayTitle(node),
        // Degree answers the simple question: "how many unique pages does this page touch?"
        degree: neighborIds.length,
        neighbors: neighborIds,
        neighborTitles: titlesForIds(neighborIds, nodesById),
      }
    })
    .sort(compareNeighborSummary)
}

/**
 * Second probe: brute-force every unordered pair of nodes and compare their neighborhoods.
 *
 * This is intentionally the simple version.
 * We are not trying to be clever yet; we are trying to be legible.
 * The algorithm mirrors the human thought process exactly:
 * - take node A
 * - take node B
 * - list A's neighbors
 * - list B's neighbors
 * - count what they share
 * - count the full combined neighborhood
 * - compute overlap strength
 *
 * The work is `O(n^2)` over nodes because every pair is checked once.
 * That is acceptable here because the purpose is exploratory debugging on a modest graph,
 * and the brute-force version is easier to trust than a hidden optimization.
 *
 * `limit` is only a UI/readability control for the debug panel.
 * It is not part of the graph theory and it does not change the raw pair math.
 */
export function findStrongestNeighborOverlaps(nodes: DiscoverableNode[], edges: DiscoverableEdge[], limit = 30) {
  const nodesById = buildNodeLookup(nodes)
  const neighborsByNodeId = buildNeighborLookup(nodes, edges)
  const pairs: NeighborOverlap[] = []

  for (let i = 0; i < nodes.length; i++) {
    // Start at `i + 1` so each unordered pair is compared exactly once.
    // We do not need both `(A, B)` and `(B, A)` because the overlap math is symmetric here.
    for (let j = i + 1; j < nodes.length; j++) {
      const leftNode = nodes[i]
      const rightNode = nodes[j]
      const leftNeighbors = neighborsByNodeId.get(leftNode.id) || new Set<string>()
      const rightNeighbors = neighborsByNodeId.get(rightNode.id) || new Set<string>()
      const sharedIds = sharedNeighborIds(leftNeighbors, rightNeighbors)

      // Pairs with no shared neighbors tell us nothing about community candidates,
      // so we drop them early to keep the output focused.
      if (!sharedIds.length) continue

      // The union is every distinct neighbor seen in either list.
      // It becomes the denominator for Jaccard similarity.
      const unionCount = new Set([...leftNeighbors, ...rightNeighbors]).size
      const jaccard = unionCount ? sharedIds.length / unionCount : 0

      pairs.push({
        aId: leftNode.id,
        aTitle: displayTitle(leftNode),
        aDegree: leftNeighbors.size,
        bId: rightNode.id,
        bTitle: displayTitle(rightNode),
        bDegree: rightNeighbors.size,
        // Raw shared support: how many of the same pages do these two pages both touch?
        sharedCount: sharedIds.length,
        unionCount,
        shared: sharedIds,
        sharedTitles: titlesForIds(sharedIds, nodesById),
        // Jaccard = shared / union.
        // We round only for display so the debug panel stays readable.
        jaccard: Number(jaccard.toFixed(3)),
      })
    }
  }

  return pairs.sort(compareNeighborOverlap).slice(0, limit)
}
