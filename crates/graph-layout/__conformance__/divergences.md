# Divergences — graph-layout

`@amigo-labs/graph-layout` is **not** a drop-in for
[`dagre`](https://www.npmjs.com/package/dagre) or
[`@dagrejs/dagre`](https://www.npmjs.com/package/@dagrejs/dagre). The
per-review verdict is "new package, one-call spec-in / positions-out,
not the graphlib chain-API". Byte-level parity on coordinates is
explicitly **not** a goal.

## API shape — not Drop-in

### One spec-in, one result-out

dagre uses a stateful graphlib Graph (N × `g.setNode()`, M × `g.setEdge()`,
then `dagre.layout(g)` that mutates the graph in place). Ours is
`layout({ nodes, edges, options }) → { nodes, edges, width, height }`.

### No in-place mutation

Your input spec is untouched. The result is a new object. Downstream
renderers loop over `result.nodes` and `result.edges`.

### No `graphlib.Graph` export

Algorithm-only package. If you need graphlib utilities (DFS, SCC),
use [`graphlib`](https://www.npmjs.com/package/graphlib) directly or
port to [`petgraph`](https://crates.io/crates/petgraph).

## Algorithmic differences

### Ranker

dagre offers `network-simplex`, `tight-tree`, and `longest-path`.
v0.1 ships a longest-path-with-topological-fallback only. For the
typical Mermaid / ReactFlow use-case this is indistinguishable.

### Crossing reduction

dagre does 24 sweeps of barycentric + median heuristic with
branch-and-bound; we do 4 sweeps of barycentric alone. On
dense graphs (>200 nodes) crossings may be 5–15% higher.

### Edge routing

dagre inserts dummy nodes for edge-label positioning and then spline
routes around them. v0.1 emits straight-line two-point edges (source
centre → target centre). Renderers that apply their own spline
(Mermaid, ReactFlow) are unaffected.

### Cycle handling

dagre reverses edges in strongly-connected components to produce a
DAG. We skip the reversal step; cycle edges keep their original
direction, nodes in the cycle get rank 0.

## Coordinate space

- Origin is the top-left corner; y grows downward (matches dagre).
- `rankdir: 'TB'` is the default.
- `BT` flips y; `LR` / `RL` swaps axes and flips x respectively.

## Known parity holes

- **Label nodes**: not emitted. dagre's `edgelabelpos` feature is
  unsupported.
- **`acyclicer` / `combineMultigraph`** options: unsupported.
- **Separate ranker per-subgraph**: unsupported.
- **Intersecting edges at sibling boundaries**: not avoided. dagre's
  median-based tie-break wins here.

## What we do that upstream doesn't

- **`layoutMany(specs)`**: N graphs in one FFI crossing. Upstream JS
  equivalent is `specs.map(toGraph).map(dagre.layout)` — ours
  amortises the V8 boundary cost for CI-time graph-rendering
  workloads.
- **Pinned ranks**: per-node `rank` option lets you anchor a node to
  a specific layer.
