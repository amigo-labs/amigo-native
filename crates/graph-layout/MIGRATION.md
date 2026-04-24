# Migrating from `dagre` / `@dagrejs/dagre`

`@amigo-labs/graph-layout` is **not** a drop-in. It replaces
`dagre.layout(graphlibGraph)` with a single `layout(spec)` call.

## Before (dagre)

```js
import * as dagre from '@dagrejs/dagre'

const g = new dagre.graphlib.Graph()
g.setGraph({ rankdir: 'TB', nodesep: 60, ranksep: 80 })
g.setDefaultEdgeLabel(() => ({}))

for (const node of myNodes) {
  g.setNode(node.id, { width: node.w, height: node.h })
}
for (const edge of myEdges) {
  g.setEdge(edge.source, edge.target)
}

dagre.layout(g)

// g is mutated in place — read back:
const positions = myNodes.map((n) => g.node(n.id))
const routings = myEdges.map((e) => g.edge(e.source, e.target))
```

## After (`@amigo-labs/graph-layout`)

```js
import { layout } from '@amigo-labs/graph-layout'

const result = layout({
  nodes: myNodes.map((n) => ({ id: n.id, width: n.w, height: n.h })),
  edges: myEdges.map((e) => ({ source: e.source, target: e.target })),
  options: { rankdir: 'TB', nodesep: 60, ranksep: 80 },
})

// result.nodes → [{ id, x, y, width, height }, ...]
// result.edges → [{ source, target, points: [...] }, ...]
```

## Option differences

- dagre accepts `graph.rankdir`, `graph.nodesep`, `graph.ranksep`,
  `graph.marginx`, `graph.marginy` — we map to `options.rankdir`,
  `options.nodesep`, `options.ranksep`, `options.marginx`,
  `options.marginy` (same semantics).
- dagre's `ranker: 'network-simplex' | 'tight-tree' | 'longest-path'`
  is unsupported — we run longest-path only.
- dagre's `edgelabelpos` is unsupported — post-process if needed.

## Staying on upstream

- You need the graphlib API for side operations (DFS, cycles,
  components).
- You rely on dagre's spline edge-routing output.
- You use edge labels with dummy-node positioning.
- You depend on dagre's specific ranker flavour.
