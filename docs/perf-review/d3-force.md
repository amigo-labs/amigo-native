# Candidate review: `d3-force`

> **Status:** GO (as a new package `@amigo-labs/force-layout`, not a drop-in) · **Predicted:** 🟡 Yellow leaning 🟢 Green · **Reviewed:** 2026-04-20
> **Shipped:** v0.1 on branch `claude/crate-performance-audit-6KLOJ` (2026-04-23). Benchmarks measured.


## Verdict

`d3-force` is an **N-body simulation** over graph nodes — quad-tree-based many-body repulsion + spring forces for edges, iterated over ticks. Pure math on float arrays, no DOM dependency. The shape is Green for medium/large graphs, but the **tick-callback semantics** are the trap: the idiomatic use (`simulation.on('tick', draw)`) calls JS 300× per simulation — exactly the `chart.js` animation trap. As a batch API (`simulate(nodes, edges, iterations) → finalPositions`) it's Green; as a tick mirror it's Black.

## JS package

- **npm:** [`d3-force`](https://www.npmjs.com/package/d3-force) (~2M/week standalone) + via the `d3` bundle (~5M/week)
- **Exports:** `forceSimulation(nodes)`, `forceManyBody()`, `forceLink(edges)`, `forceCenter()`, `forceCollide()`, `forceX()`, `forceY()`, `simulation.tick()`, `.on('tick'|'end', cb)`, `.restart()`, `.alpha()`
- **Typical input:** nodes with `{id, x?, y?, vx?, vy?}` + edges with `{source, target, distance?}`
- **Typical output:** in-place mutation of the nodes with `x, y, vx, vy` after N ticks
- **Realistic median use-case:** force-directed graph visualization in browsers (ObservableHQ, Kumu, Gephi web) — 50–500 nodes, 60–300 ticks until convergence, animated via tick callback

## Rust replacement

- **Candidate crates:** `fdg` (force-directed-graph, active, MIT, Quadtree + Barnes-Hut), `fdg-sim` (core component), alternatively a direct port onto `petgraph` + custom Barnes-Hut
- **Maintenance:** `fdg` active, last commits Q4 2025
- **Gotchas:** d3's specific force combination (link distance + many-body + collision) is stably tuned; Rust parity needs identical parameter semantics. Fixed (pinned) nodes must be supported.

## BACKLOG check

No entry. No `docs/packages.json` entry. First force-simulation candidate.

## FFI-overhead prediction

| Factor | Assessment |
|---|---|
| Per-call work | Tick: O((V+E) log V) with Barnes-Hut. 100 nodes × 300 ticks ≈ 30–80 ms JS. 500 nodes × 300 ticks ≈ 500 ms–2 s. Substantial. |
| Input size | Nodes array 50–500 × ~40 B + edges ~60–800 × ~20 B = 2–30 KB. One crossing. |
| Output size | Positions flat, ~16 B × V. ≤10 KB for median. `Buffer`/Float64Array flat. |
| Stateful potential | **High.** Simulation state (quadtree budget, alpha decay) belongs in a NAPI class — the caller can make several `tick(n)` calls without rebuilding setup. |
| Batch realism | One `simulate(iterations)` delivers final positions; tick-by-tick is the animated path. Server-side (SSR graphs, layout precompute) is naturally batch. |
| FFI-share | Batch simulate: <1% FFI on median (30 ms Rust, 200 ns crossings). Tick mirror (`tick()` × 300 with JS callback): 300 × ~300 ns = 90 µs overhead on 30 ms of work = 0.3%. Acceptable — but the callback pattern remains API-hygienically unclean. |

## Classification reasoning

Three paths:

1. **Batch `simulate(nodes, edges, iterations) → positions`** — 🟢 Green. One-shot compute. Fits SSR, static graph previews, CI layout precompute, mermaid force renderers.
2. **Stateful `ForceSimulation` class with `.tick(n)`** — 🟡 Yellow. The user calls `.tick(1)` × 300 in a RAF loop for animation. 300 FFI crossings are tolerable (BASELINE), but every tick requires a positions transfer back to JS. At 500 nodes = 8 KB × 300 crossings = ~2.5 MB shuffled per simulation. Measurable, not killer.
3. **Tick callback `.on('tick', cb)` with user JS per tick** — 🔴 Red/Black. `chart.js` animation trap reincarnated. Don't offer.

For the median server-side use-case (layout precompute, graph export), path 1 is sufficient and delivers Green. For browser-interactive animation (d3-force's main use-case) the JS baseline stays optimal — no port value. So: the package addresses the **server-side path** explicitly, browser users stay on d3-force.

**Shape match:** like `commonmark`/`pdfkit-batch` (spec-in, result-out, substantial compute). **Not** like `chart.js` (no plugin callbacks in the v1 API).

**Benchmark gap flag:** a small graph (20 nodes × 100 ticks) has to hit ≥1× or Yellow downgrade. d3's quadtree is highly optimized in V8 — the Rust win on small graphs could come in under 1.5×.

## If GO — proposed port

- **Crate name:** `@amigo-labs/force-layout`
- **API sketch:**
  ```ts
  type ForceNode = { id: string; x?: number; y?: number; fx?: number; fy?: number };
  type ForceLink = { source: string; target: string; distance?: number; strength?: number };
  type ForceOptions = {
    manyBodyStrength?: number;   // default: -30
    linkDistance?: number;       // default: 30
    centerX?: number; centerY?: number;
    collideRadius?: number;
    alphaMin?: number;           // default: 0.001
    alphaDecay?: number;         // default: 0.0228 (→ ~300 ticks)
    velocityDecay?: number;      // default: 0.4
  };

  export function simulate(
    nodes: ForceNode[],
    links: ForceLink[],
    options?: ForceOptions & { iterations?: number }
  ): Array<{ id: string; x: number; y: number }>;

  export class ForceSimulation {
    constructor(nodes: ForceNode[], links: ForceLink[], options?: ForceOptions);
    tick(n?: number): void;                 // advance n ticks (default: 1)
    positions(): Array<{ id: string; x: number; y: number }>;
    setNodes(nodes: ForceNode[]): void;
    setLinks(links: ForceLink[]): void;
  }
  ```
  No `.on('tick', cb)` callback. Browser animations stay on d3.
- **Must-have benchmark scenarios:**
  - **Tiny (20/30):** 20 nodes, 30 edges, 100 ticks. Green gate: ≥ 1×.
  - **Median (100/150):** **the decider** — 100 nodes, 150 edges, to convergence (~300 ticks). Green gate: ≥ 2×.
  - **Large (500/800):** 500/800, 300 ticks. Green gate: ≥ 3×.
  - **Tick API (100/150, 300 × tick(1)):** measures the stateful-class path with a JS loop. Yellow acceptable, Red warning below 1.5×.
- **Green gate:** all batch scenarios + ≥2× median.
- **Risks:**
  - **V8 optimum:** d3's ManyBodyForce is V8-JIT-friendly — small graphs could land below 2× because the Rust pipeline has comparatively little work per tick.
  - **Force parity:** exact reproduction of d3's force combination isn't the goal; layout quality "equivalent" is enough. Pixel-regression tests will break.
  - **Positions marshalling:** Float64Array/`Buffer` instead of `{id, x, y}[]` could halve the output overhead — v2 optimization if Yellow.
  - **Baseline gap:** `docs/BASELINE.md` doesn't cover "array of 500 Number objects". Before the port starts, add a `nodeArrayEcho` case in `_ffi-bench`.

## If NO-GO — BACKLOG entry

```markdown
- **d3-force** (~2M/week standalone). N-body force simulation. Shape-Green for server-side batch, but measurement showed <2× on the median case (100 nodes × 300 ticks) because d3's Quadtree already runs JIT-optimal in V8. Frozen until there's a measurable lever (SIMD Quadtree?) or the median graph grows. See `docs/perf-review/d3-force.md`.
```

Section: **FFI overhead > gain** or **Parity too expensive**.
