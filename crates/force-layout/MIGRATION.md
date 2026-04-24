# Migrating from `d3-force`

## Before (d3-force)

```js
import * as d3 from 'd3-force'

const sim = d3
  .forceSimulation(nodes)
  .force('link', d3.forceLink(edges).id((d) => d.id).distance(50))
  .force('charge', d3.forceManyBody().strength(-30))
  .force('center', d3.forceCenter(width / 2, height / 2))
  .on('tick', () => draw(nodes))

// or: run without a tick callback
sim.stop()
for (let i = 0; i < 300; i++) sim.tick()
// nodes are mutated in place
```

## After (`@amigo-labs/force-layout`)

```js
import { simulate } from '@amigo-labs/force-layout'

const result = simulate(nodes, edges, {
  iterations: 300,
  charge: -30,
  centerX: width / 2,
  centerY: height / 2,
})

// result.nodes → [{ id, x, y, vx, vy }, ...]
draw(result.nodes)
```

For animated use (tick-by-tick rendering), stay on `d3-force`.

## What changes

- **Single `simulate(nodes, edges, opts)`** returns a result — no
  simulation object, no chain API.
- **No `.on('tick', cb)`** — the whole simulation runs in Rust.
- **Input/output separation** — your `nodes` array is not mutated.
- **Link distance** is a per-edge field (`distance`), not a function.
- **`forceCenter(cx, cy)`** → `{ centerX, centerY }` options.

## Staying on upstream

- You need a live tick loop (animation in the browser).
- You compose custom forces that d3-force doesn't cover out of the
  box.
- You have >1000 nodes and want Barnes-Hut speed today.
