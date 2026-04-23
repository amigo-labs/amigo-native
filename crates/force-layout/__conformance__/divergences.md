# Divergences — force-layout

`@amigo-labs/force-layout` is **not** a drop-in for
[`d3-force`](https://www.npmjs.com/package/d3-force). It replaces
the tick-callback animation loop with a batch-mode `simulate()`
that returns final positions.

## API shape — not drop-in

### No tick callback

d3's idiomatic usage is `simulation.on('tick', draw)` — one JS
callback per tick, ~300 per simulation. See
`docs/perf-review/d3-force.md` for the rationale. For SSR /
pre-compute workloads, the batch form is strictly better.

If you need per-tick state (animation frames in a browser), stay on
`d3-force`.

### No force composition API

d3 composes forces:
```js
simulation
  .force('link', d3.forceLink(edges).distance(50))
  .force('charge', d3.forceManyBody().strength(-30))
  .force('center', d3.forceCenter(w/2, h/2))
```

We bake the common forces into options on `simulate()`. Custom
forces require staying on d3.

### No per-node strength / per-link strength function

d3 accepts callbacks for force strength. We accept constants (or,
for links, a per-edge `strength` field). Callbacks are anti-pattern
over FFI.

## Algorithmic differences

### O(V²) many-body

d3 uses Barnes-Hut quadtree for many-body in O(V log V). We
iterate in O(V²) for simplicity. For graphs <500 nodes, the
constant-factor advantage of pure-Rust dominates. At >1000 nodes
we're slower than d3 per iteration (the quadtree wins). Barnes-Hut
is fast-follow.

### Alpha / decay

d3 uses a cosine-easing alpha decay by default. We use multiplicative
decay `alpha *= (1 - alphaDecay)`. Convergence trajectories differ;
final equilibria agree.

### Collision

d3's collision is iterative with `iterations` parameter (default 1).
Ours is single-pass per tick. At high node density, d3's collision
settles slightly tighter.

### Initial positions

d3 uses a phyllotaxis spiral for unset initial positions. We use the
same spiral (same formula).

## What we do that upstream doesn't

- **Single FFI crossing** for the whole simulation.
- **Deterministic** (no `Math.random()`-based jitter — starting
  positions are the phyllotaxis spiral, initial velocities zero).
