# @amigo-labs/force-layout

> Force-directed graph layout — batch-mode simulation (many-body +
> spring + centre + collision). Replaces
> [`d3-force`](https://www.npmjs.com/package/d3-force) for SSR /
> precompute workloads where you don't need per-tick callbacks.

## Install

```bash
pnpm add @amigo-labs/force-layout
```

## Usage

```js
import { simulate } from '@amigo-labs/force-layout'

const { nodes } = simulate(
  [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
  [
    { source: 'a', target: 'b', distance: 60 },
    { source: 'b', target: 'c', distance: 60 },
  ],
  { iterations: 300, charge: -30, centerStrength: 0.1 },
)

// nodes → [{ id, x, y, vx, vy }, ...]
```

## Options

```ts
interface SimulationOptions {
  iterations?: number      // default 300
  charge?: number          // many-body strength (negative = repulsion). default -30
  collideRadius?: number   // collision radius (0 disables). default 0
  centerX?: number          // default 0
  centerY?: number          // default 0
  centerStrength?: number  // default 0.1
  alpha?: number           // default 1
  alphaDecay?: number      // default ≈ computed from iterations
  velocityDecay?: number   // default 0.4
}

interface NodeSpec {
  id: string
  x?: number      // starting x (default phyllotaxis spiral)
  y?: number      // starting y
  fixed?: boolean // pin to (x, y) — skip forces
}

interface EdgeSpec {
  source: string
  target: string
  distance?: number    // target link length. default 30
  strength?: number    // spring strength in [0,1]. default 1 / min(inDeg, outDeg)
}
```

## Scope

- Many-body (repulsion) — O(V²) brute-force.
- Link (Hooke spring with degree-weighted bias).
- Centering.
- Collision (hard-sphere overlap resolution).
- Pinned nodes.

## Scope cuts

- **No tick callback.** One-shot `simulate()` returns final
  positions. Animation loops stay on d3.
- **No force composition**. `simulate()` takes a fixed force stack.
- **No per-node / per-link strength functions**. Constants only.
- **O(V²)** many-body — at >1000 nodes the Barnes-Hut wins. v0.2
  will add a quadtree.

See [`__conformance__/divergences.md`](./__conformance__/divergences.md).

## License

MIT
