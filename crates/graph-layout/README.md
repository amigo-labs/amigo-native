# @amigo-labs/graph-layout

> Hierarchical (Sugiyama-style) DAG layout. One call per graph —
> spec in, positions + edge routing out. Replaces
> [`dagre`](https://www.npmjs.com/package/dagre) /
> [`@dagrejs/dagre`](https://www.npmjs.com/package/@dagrejs/dagre) for
> Node-side rendering (Mermaid, ReactFlow-SSR, Docusaurus-build).

## Install

```bash
pnpm add @amigo-labs/graph-layout
```

## Usage

```js
import { layout, layoutMany } from '@amigo-labs/graph-layout'

const result = layout({
  nodes: [
    { id: 'a', width: 100, height: 40 },
    { id: 'b', width: 100, height: 40 },
    { id: 'c', width: 100, height: 40 },
  ],
  edges: [
    { source: 'a', target: 'b' },
    { source: 'a', target: 'c' },
  ],
  options: { rankdir: 'TB', nodesep: 60, ranksep: 80 },
})

// result.nodes      → [{ id, x, y, width, height }, ...]
// result.edges      → [{ source, target, points: [{x,y}, {x,y}] }, ...]
// result.width      → total bounding-box width
// result.height     → total bounding-box height

// Batch N layouts in a single FFI call (CI-time graph rendering):
layoutMany([spec1, spec2, spec3])
```

## Install for the browser

The same `import` works in Angular, React, Vite, esbuild, and webpack ≥ 5 — the bundler picks the WASM build via the `browser` conditional export:

```ts
import { layout, layoutMany } from '@amigo-labs/graph-layout'
```

The `_graph-layout-core` engine is the same code on both sides, so node positions are identical between Node and the browser.

## Options

```ts
interface LayoutOptions {
  rankdir?: 'TB' | 'BT' | 'LR' | 'RL'    // default 'TB'
  nodesep?: number                         // default 50
  ranksep?: number                         // default 50
  marginx?: number                         // default 0
  marginy?: number                         // default 0
}

interface NodeSpec {
  id: string
  width: number
  height: number
  rank?: number       // pin to a specific rank
}

interface EdgeSpec {
  source: string
  target: string
  minlen?: number     // minimum rank distance. default 1
  weight?: number     // crossing-reduction weight. default 1
}
```

## Scope

- Sugiyama-style hierarchical layout (layered DAG).
- Longest-path ranker with topological fallback for cycles.
- Barycentric crossing-reduction (4 sweeps).
- Straight-line two-point edge routing (renderers add splines).
- Pinned ranks (per-node `rank` override).

## Not in scope (v0.1)

- **graphlib chain-API** (`g.setNode(...)`, `g.setEdge(...)`). Each
  call would cost an FFI crossing. Use the one-spec form.
- **network-simplex / tight-tree rankers**. Longest-path covers the
  typical use-cases.
- **Spline edge routing**. Renderers apply their own.
- **Edge labels**. No dummy-node insertion for label positioning.

See [`__conformance__/divergences.md`](./__conformance__/divergences.md).

## License

MIT
