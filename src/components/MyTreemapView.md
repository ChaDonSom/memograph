# MyTreemapView Architecture

This document explains what the custom treemap is trying to become.

It is not a note about one component. It is the design brief for a graph-aware treemap system that can show page importance, relationship neighborhoods, and eventually routed arrows.

The goal is to keep the ideas simple enough to reason about, while still being honest about the constraints of treemaps and graph data.

## Resume Here

If you are returning to this project after a long gap, start here before reading the rest of the document.

This section is meant to answer five questions quickly:

1. What exists right now?
2. Why was it built?
3. How well did it work?
4. What decision has been made?
5. What should happen next?

### Last verified state

This note was last brought up to date on 2026-05-01.

At that point, `MyTreemapView.vue` had already moved away from the broken hand-rolled placement loop and was using D3 treemap layout instead.

The current experimental behavior is:

- tile size is still driven only by page visits
- the top three pages by visits are pulled into a temporary featured band
- that featured band is forced to the top of the view
- the largest of those three is nudged toward the middle of the featured band
- everything else is laid out below with squarified treemap packing

That implementation compiled and the project built successfully.

### What the last completed step was

The last completed step was a proof-of-concept layout change, not a finished architecture change.

The view was switched from custom cursor math to D3 treemap, and a temporary grouping rule was added so the three largest pages could be kept high on the screen.

### Why that step was done

That step was meant to answer one narrow but important question:

Can Memograph influence treemap placement intentionally, instead of hoping a flat squarified layout will place important pages in a useful spot?

The answer was yes.

The featured-band experiment proved that placement can be influenced by building a temporary layout hierarchy before the data is handed to D3.

That was the point of the experiment.

### How well it went

The experiment succeeded as a layout proof.

It did not succeed as a final product rule.

What it proved:

- D3 treemap is the right base layout engine
- placement can be biased by grouping before layout
- the view does not need to rely on fragile manual packing logic

What it did not solve:

- the promoted group is still based on visits only
- the promoted group is not yet driven by graph relationships
- there is no real community detection yet
- there is no proper focus neighborhood yet
- there are no routing corridors yet

The current implementation should be treated as a working experiment, not as the final design.

### Current working decision

The current working decision is:

- use Louvain-style community detection, or something equivalent, for the unfocused global map
  - **Louvain:** treat every page as a 'community', then add pages to communities and check if internal vs external improves (sum up edge strength inside vs outside): if it does, keep the change and repeat until no more changes help. Then collapse communities into supernodes and repeat the process again on the smaller graph.
- use seed-based focus logic for the focused local promotion around the selected page
  - **Seed-based:** use selected page and a few strongest related ones as seeds, then louvain the rest of the graph around those seeds, but only allow moves that promote the seed neighborhood instead of rewriting the whole map
- do not rely on seed-only grouping as the whole architecture
- do not rely on visits alone for placement decisions

In plain language, the system should work like this:

- global mode should show stable neighborhoods in the graph
- focused mode should keep that global structure, then promote the selected page and its strongest nearby relations inside it

This decision was made because seed-only grouping is not enough for the unfocused mode, while pure community detection is not enough to explain what should be promoted when one page is selected.

### The next architecture step

This is the next step if the goal is to stabilize the architecture.

It is not necessarily the next product step, the next motivation step, or the thing that will feel most exciting to work on next.

The next architecture step is not to fully perfect the treemap math.

The next architecture step is to concretize the data and module boundaries that the final treemap will depend on.

More specifically, the next step is:

1. Separate raw graph metrics from the view.
2. Create a clean split between `nodeProminence` and `edgeStrength`.
3. Define the community-detection seam explicitly, with Louvain as the intended global strategy.
4. Define the focus-neighborhood seam explicitly, with seed-based logic as the intended local strategy.

This is the next step because the project is currently rich in layout ideas but still too implicit in its data contracts.

Without those seams, any future Louvain work, focus promotion work, or corridor work will end up trapped inside the view component.

### What success looks like for that architecture step

The next step should be considered successful when the following becomes true:

- the view no longer has to invent graph metrics inline
- a module can answer "how important is this page visually?"
- a different module can answer "how strong is this relationship for placement?"
- a community module can return stable group ids for the unfocused mode
- a focus module can return the promoted neighborhood for the focused mode
- the treemap view can consume these results instead of owning the policy itself

At that point, Louvain is no longer just an idea in prose. It has a defined home in the codebase.

### What not to forget later

Two decisions are easy to lose after time away, but they matter a lot:

1. Visual prominence and visual placement are separate jobs.
2. The treemap hierarchy is a temporary layout structure, not the source graph.

If either of those gets blurred later, the architecture will drift back toward one overloaded score and one oversized component.

### If you only have time for one short restart pass

Read these sections in this order:

1. Resume Here
2. Terms
3. Core Principles
4. Proposed Module Plan
5. Suggested Implementation Order

That should be enough to recover the big picture and the next action.

### Open questions that are still real

These questions were not resolved yet:

- exactly how node prominence should combine visits, recency, and content richness
- exactly how edge strength should combine manual weight, transitions, and relationship-content views
- whether community detection should run on every update or be cached and recomputed selectively
- how many pages should live in a focus neighborhood by default
- how much routing space should be reserved between major groups

Those are open implementation questions, not architectural confusion.

## Personal Pull Right Now

This section is here to preserve the human side of the project.

The architecture path is not always the same thing as the next step that keeps momentum alive.

At the time this note was updated, the strongest personal pull did not seem to be "implement Louvain right now." The stronger pull seemed to be keeping the app exciting enough to want to return to it.

That matters.

The development of the app is only as good as the already-working parts are at generating interest, curiosity, and energy.

### What seemed personally interesting next

These were the most plausible near-term directions:

- make the treemap tiles feel nicer and more readable right away
- test whether container-query-based typography and truncation feel stable enough to keep
- clean up Quill integration so editing feels like a finished feature instead of technical debt
- keep thinking about arrow routing in a concrete geometric way, even if full routing is not built yet

### The most likely motivation-first next step

If the goal is to keep excitement up rather than to settle the architecture first, container-query work is probably the safest next step.

Why it is a good candidate:

- it improves the treemap that already exists
- it is visible immediately
- it does not force a premature decision about Louvain, seed logic, or routing
- it mostly lives in presentation space, which should remain useful later even if the layout math changes

In plain language: making the tiles look good now is not a distraction if it is done in a way that stays isolated.

### Another valid momentum step

Cleaning up Quill integration is also a valid next move.

It is less directly tied to treemap architecture, but it improves an already-ready part of the product. That kind of work can be the right move if the real need is product energy rather than layout purity.

### What this means for the "next step"

There are really two next steps in this project, and both are valid:

- the next architecture step: define the seams for metrics, communities, focus, and layout
- the next momentum step: make the current app more satisfying to use and look at

Future work should not pretend those are always the same thing.

## Arrow Geometry Direction

One important routing idea became clear during this phase and should be treated as a first-class design decision.

Arrows should not be limited to entering and leaving a tile at a single midpoint on each edge.

They should be able to attach anywhere along a tile edge, as long as that portion of the edge is available.

That means later routing will need more than tile rectangles. It will need a map of routeable boundary segments and gutters.

### What this implies

The routing layer will likely need to know at least these things:

- the bounds of each tile
- which portions of each tile edge are available as arrow anchor segments
- the gutter and corridor geometry between tiles and groups
- which relationship is using which boundary segment and which corridor segment
- how congested each segment becomes as more relationships are drawn

### Why this matters now

This is not a small rendering detail.

It changes what the eventual layout result needs to return.

The layout system will not only need to answer "where are the tiles?" It will also need to answer "what routing surfaces exist around the tiles and between the groups?"

### The likely shape of the future routing model

The routing model will probably need concepts like these:

- `edge anchors`: usable segments along the top, right, bottom, or left edge of a tile
- `gutter map`: the routeable free space between nearby tiles
- `corridor map`: the higher-level routeable free space between larger communities or groups
- `segment claims`: which relationships occupy which parts of those routeable surfaces

This is one reason corridors and lanes are already part of the architecture plan. They are not just visual padding. They are future routing surfaces.

## Purpose

Memograph does not have plain category data. It has pages and relationships.

That means the treemap cannot be treated as a normal "folder contains files" visualization. It has to solve three different jobs at once:

1. Show which pages matter most.
2. Keep related pages near each other.
3. Leave enough structure for relationships to be drawn later.

Those jobs are related, but they are not the same job. The architecture needs to keep them separate.

## The Three Jobs of the Layout

### Visual prominence

Visual prominence answers one question: how much area should a page receive?

This is mostly a page question. It should be driven by node-level signals such as page visits, recency, and possibly content richness.

### Visual placement

Visual placement answers a different question: which pages should live near each other?

This is mostly a relationship question. It should be driven by edge-level signals such as transition traffic, visits to the relationship's own content, and any manual relationship weights.

### Routing

Routing answers a third question: if relationships are drawn as arrows later, where can they travel without the view turning into noise?

Routing depends on placement, but it is not the same thing as placement. A layout can place tiles well and still leave no clean path for arrows unless it reserves corridors or lanes intentionally.

## Terms

### Node

A page in the graph.

### Edge

A relationship between two pages.

### Page-level metrics

Measured facts about a page, such as page visits or last updated time.

### Relationship-level metrics

Measured facts about a relationship, such as manual edge weight, transition count, or views of relationship content.

### Node prominence

The derived value used to decide tile area.

### Edge strength

The derived value used to decide community detection, focus neighborhoods, and later arrow priority.

### Community

A neighborhood of pages that are strongly connected to one another and only lightly connected to the outside.

### Focus neighborhood

The local set of pages that should be promoted when a page is selected. In practice, this means the current page plus its strongest related pages.

### Layout hierarchy

The temporary tree passed into D3 treemap.

This matters because the source data is a graph, but D3 treemap expects a tree. The hierarchy is not the source of truth. It is a layout structure built from the graph.

### Corridor

A reserved gap between larger layout groups that can later carry arrows.

### Lane

A narrower routing path inside a corridor.

### Edge anchor

A usable segment along a tile edge where a relationship line can attach.

This is intentionally more flexible than a single midpoint port.

### Gutter map

A representation of the free space between tiles that later routing can use.

This space may eventually need to be divided into addressable segments rather than treated as one open area.

## Core Principles

### One score should not do everything

Prominence and placement should not share one master score.

A page can deserve a large tile because it is heavily visited, while a relationship can deserve tight placement because it is frequently traversed. Those are different truths. If they are collapsed too early into one number, the behavior becomes hard to tune and hard to explain.

### Treemap input is derived, not raw

D3 treemap does not inspect graph edges and discover clusters automatically.

It only knows how to lay out a hierarchy. That means Memograph must build a temporary tree that reflects the graph well enough for layout.

### Focus should promote, not rewrite reality

When a page is selected, the layout should highlight its neighborhood without throwing away the broader community structure.

The goal is a stable mental map, not a completely different world every time focus changes.

### Routing space is a first-class concern

If arrows are part of the product plan, the layout must reserve space for them early. Corridors and lanes are not cleanup work after the layout is done. They are part of the layout contract.

### Components should render, not invent graph math

`MyTreemapView.vue` should eventually consume a prepared layout result.

It should measure the container, request a layout, and render tiles. It should not become the permanent home of scoring, clustering, hierarchy building, and routing policy.

## What The Metrics Should Mean

### Node metrics

Node metrics describe what is true about a page itself.

Examples:

- page visits
- updated timestamp
- content length or richness
- incoming and outgoing degree

These signals are the raw material for visual prominence.

### Edge metrics

Edge metrics describe what is true about a relationship.

Examples:

- manual edge weight
- transitions from the relationship's root page to its arrowhead page
- transitions in both directions for bidirectional links
- views or openings of the relationship's own content
- last traversed timestamp

These signals are the raw material for visual placement and later arrow routing.

### Derived metrics

Raw metrics should be converted into two separate derived values:

- `nodeProminence`: how much space a node should claim
- `edgeStrength`: how much a relationship should influence grouping, proximity, and routing

That separation is one of the most important architectural decisions in this system.

## What Community Detection Means In This Project

Community detection does not mean "count the pages with many links" and it does not mean "walk a path and collect everything visited."

It means finding neighborhoods where pages are tightly connected to each other and more loosely connected to the outside.

That distinction matters.

- Degree tells us how connected a page is.
- Traversal tells us what is reachable.
- Community detection tells us what belongs together.

Those are different questions.

### Louvain in plain language

Louvain is a common community-detection strategy.

At a high level, it works like this:

1. Start by treating every page as its own tiny community.
2. Repeatedly move a page into a neighboring community if that makes the overall grouping tighter.
3. Once the local moves stop helping, collapse each discovered community into a "super node."
4. Repeat the same process again on the smaller graph.

The result is not a path. It is a set of neighborhoods.

That makes Louvain useful for the unfocused, global view of the graph.

### Seed-based focus in plain language

Seed-based focus starts from a chosen page rather than from the whole graph.

At a high level, it works like this:

1. Pick the focused page as the main seed.
2. Find the pages most strongly attached to it.
3. Grow a local neighborhood around that seed.
4. Promote that neighborhood inside the treemap.

This makes seed-based logic useful for focused views.

### How global and local logic should work together

The intended model is:

- Use community detection to build stable global neighborhoods.
- Use seed-based focus to promote a local neighborhood inside or around the selected page's community.

This preserves global structure while still giving focus mode a clear center.

## Why Treemap Groups Exist

Treemap layout needs nested containers.

The source graph does not naturally have those containers, so Memograph has to create them. That is not cheating. It is the standard way to express graph neighborhoods in a treemap.

A simple example looks like this:

```js
{
  children: [
    {
      groupKey: "community-1",
      children: [
        {
          groupKey: "focus-neighborhood",
          children: [
            { id: "ford-999", value: 32 },
            { id: "maxwell-special", value: 20 },
            { id: "indy-500", value: 18 },
          ],
        },
        {
          groupKey: "community-1-rest",
          children: [
            { id: "eddie-rickenbacker", value: 10 },
            { id: "speedway", value: 8 },
          ],
        },
      ],
    },
    {
      groupKey: "community-2",
      children: [
        { id: "fiat", value: 7 },
        { id: "itala", value: 6 },
      ],
    },
  ],
}
```

The important point is that the hierarchy is a layout artifact. It is built for packing and routing. It is not the same thing as the persisted graph model.

## Focused and Unfocused Modes

### Unfocused mode

When no page is focused, the treemap should answer this question:

"What are the main neighborhoods in my graph?"

That means:

- global community detection is active
- tile area comes from node prominence
- group placement comes from community structure
- arrows later should emphasize the strongest cross-community relationships

### Focused mode

When a page is focused, the treemap should answer this question:

"What neighborhood matters around this page, and how does it sit inside the larger graph?"

That means:

- keep the global community structure if possible
- identify the focused page's community
- build a promoted focus neighborhood inside or near that community
- increase visual prominence of the focused page carefully
- keep the strongest related pages close to it

## Corridors and Lanes

If relationships will be drawn later, the layout result must expose more than tile rectangles.

It must also expose group rectangles and routing spaces.

This means the layout engine should eventually return:

- tile bounds
- community bounds
- focus-neighborhood bounds
- edge-anchor segments along tile boundaries
- gutter geometry between nearby tiles
- corridor bounds between groups
- lane or load information for routed edges

The current `GraphView.vue` already points in this direction. The custom treemap architecture should reuse that lesson instead of rediscovering it later.

### Why midpoint-only arrows are not enough

Earlier attempts in the repo treated arrows as if they should enter or leave from the center of a tile edge.

That is too rigid for a dense treemap.

If many relationships touch one tile, the routing system will need to spread those attachments across available parts of the tile boundary and across the gutters around it.

That means later routing should think in terms of sections and segment assignments, not one fixed port per side.

## What `MyTreemapView.vue` Should Eventually Do

`MyTreemapView.vue` is the center of experimentation right now, but it should not remain the system boundary forever.

Its long-term responsibilities should be small and clear:

1. Measure the container.
2. Ask for a layout result using the current graph and focus state.
3. Render tiles, groups, and later arrows.
4. Apply tile-level presentation rules such as truncation or font scaling.

Its long-term responsibilities should not include:

- deriving metrics from raw graph data
- detecting communities
- deciding focus neighborhoods
- building routing plans
- mixing all layout policy into inline component code

## Proposed Module Plan

The following module plan turns the treemap system into a pipeline instead of a single large view component.

### `src/treemap/types.ts`

Defines the shared shapes used by the treemap system.

Suggested responsibilities:

- raw node and edge types used by the layout layer
- `NodeMetrics`
- `EdgeMetrics`
- `Community`
- `FocusNeighborhood`
- `TreemapHierarchyNode`
- `TreemapTile`
- `TreemapGroup`
- `Corridor`
- `TreemapLayoutResult`

This file exists to make the data contract explicit.

### `src/treemap/metrics.ts`

Builds measured node and edge signals from the raw graph.

Suggested responsibilities:

- derive page visits, degree, recency, and content richness
- derive transition counts per edge
- derive relationship-content view counts per edge
- normalize directional traffic for bidirectional edges
- produce `nodeProminenceInputs` and `edgeStrengthInputs`

This is the boundary between raw data and derived layout decisions.

### `src/treemap/prominence.ts`

Turns node metrics into the values that drive tile area.

Suggested responsibilities:

- compute `nodeProminence`
- optionally apply focus distortion without hiding the base value
- keep labels honest about what the treemap is showing

This file should decide how large nodes become. It should not decide where they go.

### `src/treemap/relationships.ts`

Turns edge metrics into placement and routing strength.

Suggested responsibilities:

- compute `edgeStrength`
- rank strongest direct relations for a focus node
- expose strongest cross-group edges for future routing
- keep directional and bidirectional relationships explicit

This file should decide how strongly pages should attract one another in layout logic. It should not decide tile area.

### `src/treemap/community.ts`

Builds stable graph neighborhoods.

Suggested responsibilities:

- detect communities from `edgeStrength`
- support an unfocused global mode based on community detection
- allow a Louvain-style implementation later
- expose a fallback strategy when the graph is small or sparse

This file answers: "which pages belong together globally?"

### `src/treemap/focus.ts`

Builds local promotion behavior around the selected page.

Suggested responsibilities:

- identify the selected page's community
- rank strongest directly related pages
- build a promoted `FocusNeighborhood`
- decide which pages receive temporary prominence boosts
- keep focus mode stable instead of rebuilding the whole map from scratch

This file answers: "what should be promoted right now?"

### `src/treemap/hierarchy.ts`

Converts graph neighborhoods into the tree structure expected by D3.

Suggested responsibilities:

- build the root layout hierarchy
- map communities to top-level groups
- nest focus neighborhoods inside communities when a page is selected
- attach final `value` fields for D3 treemap sizing

This file is the bridge between graph logic and treemap logic.

### `src/treemap/layout.ts`

Runs the D3 treemap and returns rectangles.

Suggested responsibilities:

- run `hierarchy(...)`, `sum(...)`, and treemap tiling
- choose tilers for global groups, focus neighborhoods, and leaf packing
- return tile bounds and group bounds
- keep D3-specific math out of the view component

This file is where D3 lives.

### `src/treemap/corridors.ts`

Plans reserved routing space between layout groups.

Suggested responsibilities:

- measure inter-group relationship load
- allocate corridors between major groups
- define internal lanes or routing hints
- expose geometry that future arrow rendering can reuse

This file turns "we may need arrows later" into an actual geometry contract.

### `src/treemap/presentation.ts`

Applies tile-level rendering rules based on available space.

Suggested responsibilities:

- font sizing
- title truncation
- subtitle visibility
- relationship label density
- later container-query style rules

This file keeps presentation logic out of the geometry engine.

## Recommended Data Flow

The intended pipeline is:

```text
raw graph
-> metrics
-> prominence and relationship strength
-> communities
-> focus neighborhood
-> layout hierarchy
-> treemap layout
-> corridors and lanes
-> presentation rules
-> component rendering
```

This pipeline is the main architectural decision in this document.

## Suggested Implementation Order

### Phase 1: separate metrics from views

Extract node and edge metric building from component code.

This creates a clean place for page visits, transition counts, and relationship-content visits to live.

### Phase 2: separate prominence from placement

Create separate derived values for node prominence and edge strength.

This is the point where the system stops relying on one overloaded score.

### Phase 3: introduce communities

Add a first pass at community detection for the unfocused view.

The first version can be simple, but it should still return community ids explicitly.

### Phase 4: add focus neighborhoods

When a page is selected, promote a local neighborhood inside the global community structure.

This is the point where focus mode becomes principled instead of ad hoc.

### Phase 5: move D3 into a layout module

Have the view consume a layout result rather than owning treemap policy directly.

### Phase 6: add routing contracts

Return group bounds, corridor bounds, and edge-priority information so arrows can be added without redesigning the layout engine.

### Phase 7: refine presentation

Once the geometry is stable, add label rules, truncation, and size-aware typography.

## What We Are Explicitly Not Doing

The system should avoid these traps:

- using one score for area, placement, and routing at the same time
- relying on degree alone to define communities
- relying on traversal alone to define communities
- post-processing tile positions in ways that break treemap geometry
- letting the view component become the permanent home of graph architecture

## Working Summary

Memograph's treemap is not a normal treemap.

It is a graph-aware layout pipeline with three separate goals:

- page importance should shape area
- relationship strength should shape proximity
- future arrows should shape reserved routing space

The source data remains a graph.

The treemap hierarchy is a temporary structure built from that graph.

Communities provide the global neighborhoods.
Focus neighborhoods provide the local promotion behavior.
Corridors and lanes provide the future routing contract.

If this architecture stays intact, the view can grow in sophistication without turning into a tangle of one-off layout rules.
