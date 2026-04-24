# Candidate review: `dagre` / `@dagrejs/dagre`

> **Status:** GO (as a new package `@amigo-labs/graph-layout`, not a drop-in) · **Predicted:** 🟢 Green · **Reviewed:** 2026-04-20
> **Shipped:** v0.1 on branch `claude/crate-performance-audit-6KLOJ` (2026-04-23). Benchmarks measured.


## Verdict

`dagre` is a pure **algorithm** — Sugiyama-style layered layout for directed graphs — **without** DOM, canvas, events, or plugin callbacks. Input: graph topology + node sizes. Output: coordinates. This is exactly the `commonmark` / `pdfkit`-new Green shape: bytes-in / bytes-out, substantial compute per call, no callback boundary. The only pitfall is the drop-in temptation: the graphlib chain API (`g.setNode(...); g.setEdge(...); dagre.layout(g)`) with dozens of `setNode` crossings per layout would be the `xml`/`pdfkit`-chain trap. As a `layout(spec)` package with one call per graph it's Green.

## JS package

- **npm:** [`dagre`](https://www.npmjs.com/package/dagre) (original, unmaintained since 2020) + [`@dagrejs/dagre`](https://www.npmjs.com/package/@dagrejs/dagre) (active fork, major consumer recommendation)
- **Downloads:** `dagre` ~1.5M/week + `@dagrejs/dagre` ~1.3M/week ≈ **~2.8M/week combined** (Q1 2026)
- **Exports / API surface:** `graphlib.Graph` (node class, stateful), `layout(graph, opts?)`, `acyclic`, `normalize`, `rank`, `order`, `position` as single-phase exports
- **Typical input:** graph object with `setNode(id, {width, height, label, rank?})` + `setEdge(v, w, {weight?, minlen?, labelpos?})` + graph options (`rankdir`, `nodesep`, `ranksep`, `marginx`, `marginy`)
- **Typical output:** the same graph, **mutated in place** — every node gets `.x`, `.y`; every edge gets `.points: [{x, y}, …]` + routing; the graph itself gets `.width`, `.height`
- **Realistic median use-case:** **Mermaid flowcharts** (~20–200 nodes, new layout per edit), **ReactFlow editors** (~10–500 nodes, re-layout on user action), **Cytoscape/joint.js dashboards**. Graphs are usually 20–300 nodes, 30–500 edges. Re-layout happens **often** (per user keystroke in some editors), but always as a single `layout()` call — not invoked in hot loops

## Rust replacement

- **Candidate crate(s):**
  - `layout` / `layout-rs` (nadavrot/layout on crates.io) — **primary**. Sugiyama layered layout, actively maintained, MIT, pure-Rust, can render to SVG but coordinate output is directly accessible. No native dependencies, WASM-capable.
  - `petgraph` — for graph primitives (DAG check, SCC, topological sort) as a building block
  - `rust-sugiyama` (less known, smaller scope) — secondary
  - Custom port: the Sugiyama algorithm in `dagre/lib/` is well documented (~3000 lines of JS, ~1500 of them hot). Direct porting with a `petgraph` backend is tractable
- **Maintenance / license:** `layout-rs` MIT, active, last commits Q1 2026. `petgraph` is a standard ecosystem crate. No supply-chain risk.
- **Known gotchas / divergences:**
  - Pixel parity with `dagre` is **not a goal** — Sugiyama has many valid solutions per graph, each implementer picks marginally differently
  - Edge routing: `dagre`'s spline heuristic (via `graphlib-dot` indirectly) is proprietary; `layout-rs` routes directly. Consumers like Mermaid accept this because they pass the points through their own spline library anyway
  - `ranker: 'network-simplex' | 'tight-tree' | 'longest-path'` — three ranker algorithms in dagre. v1 can be limited to `network-simplex` (the default); the others as a fast-follow
  - Label nodes: `dagre` implicitly inserts dummy nodes for edge labels. Must be replicated, otherwise labels collide with edges

## BACKLOG check

No `dagre` entry in `BACKLOG.md`. No graph-layout or visualization library rated so far (only `chart.js` → Black). No entry in `docs/packages.json`. This review is the first candidate in the graph-algorithms category and sets the template for `d3-force`, `cytoscape-layouts`, `elkjs` etc.

## FFI-overhead prediction

| Factor | Assessment |
|---|---|
| Per-call algorithmic work | **Substantial for the median case.** 100 nodes / 150 edges: ~2–10 ms in dagre JS (depending on ranker). 500 nodes / 800 edges: ~50–200 ms. Rust port should land 2–5× below that. No trivial-compute risk. |
| Input size distribution | Graph spec as JSON/array ~2–50 KB for the median. A batch pass (one call with `{nodes, edges}`) collapses the 150+ `setNode`/`setEdge` crossings of the graphlib API into **one** crossing. |
| Output size distribution | Positions array ~100 × 16 B (x/y doubles) + edge points ~200 × 4 × 16 B = ~15 KB for the median graph. `Buffer`/typed-array return or plain JS object — `docs/BASELINE.md` says both are flat <200 ns up to ~1 MB. |
| Reusable setup (stateful potential) | **Medium.** Graph configuration (`rankdir`, `ranksep`, etc.) could be cached in a `GraphLayouter` class. Bigger lever: on re-layout after a user edit the user **mutates** the graph; if they hold a NAPI class, diff-based re-layout could pick up points later (fast-follow, not v1). |
| Batch-usage realism | **Medium-low.** One user edit = one `layout()` call. But Mermaid servers (e.g. Docusaurus build) render hundreds of diagrams per build — `layoutMany(specs: LayoutSpec[])` is the lever for those use-cases. |
| FFI-share estimate vs. Rust work | Drop-in chain API (`setNode` × 150 + `layout()`): 150 crossings × 180 ns = ~27 µs FFI on ~5 ms Rust compute = **<1% FFI** — tolerable, but unnecessary. Batch spec API: <0.5% FFI. Both are Green-capable from an FFI perspective; preference for the batch API on API-hygiene grounds (no stateful object across the FFI boundary with mutation semantics). |

## Classification reasoning

Dagre is one of the **cleanest** Green shapes in the JS ecosystem, precisely because it has none of the three `chart.js` blockers:

1. **Runtime symmetry.** Dagre runs identically in browser and Node — pure algorithm, no DOM dependencies. `@amigo-labs/graph-layout` reaches the Node consumer path (Mermaid server, Docusaurus build, CI graph rendering, reactflow SSR) without a runtime mismatch. Browser consumers stay on JS, which is fine — they never had a native option.

2. **No native competition.** Unlike `chart.js` (where `node-canvas` → Skia held the field), graph layout has **no** native JS competitor. Dagre is pure JS, ELK is Java (via GWT to JS), all other layouters are also pure JS. The Rust port measures against a real JS baseline.

3. **No callback surface.** Dagre has no plugins, no tooltip formatters, no animations. The only callback in the API is `nodeOrder` (optional, rarely used). v1 can leave it out.

Also: the algorithm is **compute-bound**, not memory-bound — crossing reduction is the typical hot path, and it's pure integer arithmetic on rank/order arrays. Rust has measurable wins here (no GC pressure on inner loops, fixed-size arrays instead of V8 arrays, no hashmap lookup for node IDs if you use `usize` indices).

**Shape matching:**
- ✅ Like `commonmark` (bytes-in spec, bytes-out result, substantial compute)
- ✅ Like `pdfkit` (new package, not drop-in; spec → output; stateful-class optional)
- ✅ Like `sanitize-html` (AST transformation with parser + algorithm + serializer)
- ❌ **Not** like `chartjs` (no browser runtime, no native competition, no callbacks)
- ❌ **Not** like `deep-equal`/`levenshtein` (no short-input hot loop)

**Benchmark gap flag:** the Green prediction is algorithmically grounded but unmeasured. Before shipping, the four scenarios below must be measured. The smallest graph (10 nodes) has to hit at least `1×` — below that it tips to Yellow. Ranker choice is a factor: `network-simplex` is the heaviest path in dagre and therefore the best win candidate; `longest-path` is trivial and brings barely any Rust win.

## If GO — proposed port

- **Recommended crate name:** `@amigo-labs/graph-layout` (not `@amigo-labs/dagre` — explicitly not drop-in, and opens the door to further layouter algorithms as fast-follow: `force`, `elk-lite`, `hierarchical`)
- **Primary API sketch:**
  ```ts
  type NodeSpec = {
    id: string;
    width: number;
    height: number;
    label?: string;
    rank?: number;        // optional pre-assigned rank
  };
  type EdgeSpec = {
    from: string;
    to: string;
    weight?: number;
    minlen?: number;
    label?: string;
    labelWidth?: number;
    labelHeight?: number;
  };
  type LayoutOptions = {
    rankdir?: 'TB' | 'BT' | 'LR' | 'RL';  // default: 'TB'
    ranker?: 'network-simplex' | 'tight-tree' | 'longest-path';
    nodesep?: number;    // px between siblings
    ranksep?: number;    // px between ranks
    edgesep?: number;
    marginx?: number;
    marginy?: number;
    acyclicer?: 'greedy' | null;
  };
  type NodeResult = { id: string; x: number; y: number; width: number; height: number };
  type EdgeResult = {
    from: string;
    to: string;
    points: Array<{ x: number; y: number }>;
    labelX?: number;
    labelY?: number;
  };
  type LayoutResult = {
    nodes: NodeResult[];
    edges: EdgeResult[];
    width: number;
    height: number;
  };

  export function layout(
    nodes: NodeSpec[],
    edges: EdgeSpec[],
    options?: LayoutOptions
  ): LayoutResult;

  export function layoutMany(
    specs: Array<{ nodes: NodeSpec[]; edges: EdgeSpec[]; options?: LayoutOptions }>
  ): LayoutResult[];

  export class GraphLayouter {
    constructor(options?: LayoutOptions);   // set options once, many layouts
    layout(nodes: NodeSpec[], edges: EdgeSpec[]): LayoutResult;
  }
  ```
  **Explicitly not** `graphlib.Graph`-compatible. No stateful mutation across the FFI boundary, no `g.node(id).x = ...`.
- **Must-have benchmark scenarios:**
  - **Tiny (10/12):** 10 nodes, 12 edges — Mermaid minimal flowchart. Measures whether FFI overhead eats the win. Green gate: ≥ 1×.
  - **Small (50/75):** typical README flowchart. Green gate: ≥ 1.5×.
  - **Median (100/150):** **the actual bench decider** — ReactFlow editor with medium complexity. Green gate: ≥ 2×.
  - **Large (500/800):** CI/CD DAG, monorepo dep graph. Green gate: ≥ 3×.
  - **Ranker matrix:** measure all three scenarios × {`network-simplex`, `longest-path`} separately. `network-simplex` is the win driver.
- **Acceptance thresholds (Green gate):** all of the above + `layoutMany(100 × median-graph)` ≥ 3× a dagre loop (measures batch FFI amortization). One scenario below the gate → Yellow, review after one sprint.
- **Risks:**
  - **Parity tail:** dagre has 10 years of edge cases (self-loops, multi-edges, disconnected components, rank constraints, compound nodes). v1 scope must be explicitly declared: **simple directed graphs, no compound nodes, no multi-edges**. That covers ~95% of Mermaid/ReactFlow traffic.
  - **Output divergence:** positions will differ from dagre (there's already drift between `dagre` and `@dagrejs/dagre`). Consumers need to know: the package computes *a good* layout, not *dagre's* layout. Mermaid users with pixel-regression tests against dagre output will need to re-baseline.
  - **layout-rs maturity:** if `layout-rs` lacks any of the three rankers or edge routing is weak, the Sugiyama pipeline has to be implemented custom. That's ~2000 lines of Rust instead of ~300. Must be verified before the port starts.
  - **Benchmark realism:** the median case is "user clicks, re-layout" — so single-call latency, not throughput. Green is only Green once single-call latency is clearly below the JS baseline at 100-node graphs (including first-call cold start — no regex-compile or similar cold-start trap).
  - **`_ffi-bench` baseline nuance:** `docs/BASELINE.md` covers `echoBuffer`, not "JSON object with 500 nodes". Input marshalling costs for deep node arrays are qualitatively estimated, not measured. Add a `nodeArrayEcho(n)` case to the `_ffi-bench` crate before the port starts.

## If NO-GO — BACKLOG entry

Not applicable — prediction is Green. But if the review result after measurement turns Yellow or Red (for example because `layout-rs` is slower than dagre-JS on small graphs because V8's JIT already translates the simple integer loops optimally), the BACKLOG classification would be:

```markdown
- **dagre / @dagrejs/dagre** (~2.8M/week combined). Graph-layout algorithm (Sugiyama-layered). Shape-Green — but measurement showed <1.5× win on the median case (100/150 graph) because V8 already JITs the crossing-reduction hotloop well. Port frozen until a) a measurably faster Rust Sugiyama approach is found (SIMD for rank arrays?), b) the median case shifts toward larger graphs. See `docs/perf-review/dagre.md`.
```

Section in `BACKLOG.md`: **FFI overhead > gain** (if small-graph problem) or **Parity too expensive** (if the Sugiyama-variants tail gets too long).
