# Candidate review: `d3-force`

> **Status:** GO (als neues Paket `@amigo-labs/force-layout`, kein Drop-in) · **Predicted:** 🟡 Yellow leaning 🟢 Green · **Reviewed:** 2026-04-20

## Verdict

`d3-force` ist eine **N-Body-Simulation** auf Graph-Nodes — Quad-Tree-basierte many-body repulsion + Feder-Forces für Edges, iterativ über Ticks. Pure Math auf Float-Arrays, keine DOM-Dependency. Shape ist Green für mittlere/große Graphen, aber **Tick-Callback-Semantik** ist die Falle: der idiomatische Use (`simulation.on('tick', draw)`) ruft JS 300× pro Simulation — exakt die `chart.js`-Animation-Falle. Als Batch-API (`simulate(nodes, edges, iterations) → finalPositions`) ist es Green; als Tick-Mirror ist es Black.

## JS package

- **npm:** [`d3-force`](https://www.npmjs.com/package/d3-force) (~2 M/Woche standalone) + via `d3`-bundle (~5 M/Woche)
- **Exports:** `forceSimulation(nodes)`, `forceManyBody()`, `forceLink(edges)`, `forceCenter()`, `forceCollide()`, `forceX()`, `forceY()`, `simulation.tick()`, `.on('tick'|'end', cb)`, `.restart()`, `.alpha()`
- **Typical input:** Nodes mit `{id, x?, y?, vx?, vy?}` + Edges mit `{source, target, distance?}`
- **Typical output:** In-place mutation der Nodes mit `x, y, vx, vy` nach N Ticks
- **Realistic median use-case:** Force-directed Graph-Darstellung in Browsern (ObservableHQ, Kumu, Gephi-Web) — 50–500 Nodes, 60–300 Ticks bis Konvergenz, animiert per Tick-Callback

## Rust replacement

- **Candidate crates:** `fdg` (force-directed-graph, aktiv, MIT, Quadtree + Barnes-Hut), `fdg-sim` (Kernkomponente), alternativ direkter Port auf `petgraph` + custom Barnes-Hut
- **Maintenance:** `fdg` aktiv, letzte Commits Q4 2025
- **Gotchas:** d3's spezifische Force-Kombination (Link-Distance + many-body + collision) ist stabil-abgestimmt; Rust-Parity braucht identische Parameter-Semantik. Fixed-Nodes (pinned) müssen unterstützt werden.

## BACKLOG check

Kein Eintrag. Kein `docs/packages.json`-Entry. Erster Force-Simulation-Kandidat.

## FFI-overhead prediction

| Factor | Assessment |
|---|---|
| Per-call work | Tick: O((V+E) log V) mit Barnes-Hut. 100 Nodes × 300 Ticks ≈ 30–80 ms JS. 500 Nodes × 300 Ticks ≈ 500 ms–2 s. Substantiell. |
| Input size | Nodes-Array 50–500 × ~40 B + Edges ~60–800 × ~20 B = 2–30 KB. Ein Crossing. |
| Output size | Positions flach, ~16 B × V. ≤10 KB für Median. `Buffer`/Float64Array flach. |
| Stateful potential | **Hoch.** Simulation-State (Quadtree-Budget, Alpha-Decay) gehört in NAPI-Klasse — Caller kann mehrere `tick(n)`-Calls machen ohne Setup neu aufzubauen. |
| Batch realism | Ein `simulate(iterations)` liefert Final-Positions; Tick-by-Tick ist der animierte Pfad. Server-Side (SSR-Graphen, Layout-Precompute) ist Batch-natürlich. |
| FFI-share | Batch-simulate: <1% FFI auf Median (30 ms Rust, 200 ns Crossings). Tick-Mirror (`tick()` × 300 mit JS-Callback): 300 × ~300 ns = 90 µs Overhead bei 30 ms Work = 0.3%. Akzeptabel — aber Callback-Pattern bleibt API-hygienisch unsauber. |

## Classification reasoning

Drei Pfade:

1. **Batch `simulate(nodes, edges, iterations) → positions`** — 🟢 Green. One-Shot-Compute. Passt zu SSR, statischen Graph-Previews, CI-Layout-Precompute, Mermaid-Force-Renderern.
2. **Stateful `ForceSimulation`-Klasse mit `.tick(n)`** — 🟡 Yellow. User ruft `.tick(1)` × 300 in RAF-Loop für Animation. 300 FFI-Crossings sind tolerabel (BASELINE), aber jeder Tick verlangt Positions-Transfer zurück nach JS. Bei 500 Nodes = 8 KB × 300 Crossings = ~2.5 MB/Simulation durchgeschaufelt. Messbar aber nicht Killer.
3. **Tick-Callback `.on('tick', cb)` mit User-JS pro Tick** — 🔴 Red/Black. `chart.js`-Animation-Falle reinkarniert. Nicht anbieten.

Für den Median-Server-Side-Use-Case (Layout-Precompute, Graph-Export) ist Pfad 1 ausreichend und liefert Green. Für Browser-interaktive Animation (d3-forces Haupt-Use-Case) bleibt JS-Baseline optimal — kein Port-Wert. Also: Paket addressiert den **Server-Side-Pfad** explizit, Browser-User bleiben auf d3-force.

**Shape-Match:** wie `commonmark`/`pdfkit-batch` (spec-in, result-out, substantielle Compute). **Nicht** wie `chart.js` (keine Plugin-Callbacks im v1-API).

**Benchmark-Gap-Flag:** Kleiner Graph (20 Nodes × 100 Ticks) muss ≥1× treffen sonst Yellow-Downgrade. d3's Quadtree ist hochoptimiert in V8 — der Rust-Gewinn könnte auf kleinen Graphen unter 1.5× liegen.

## If GO — proposed port

- **Crate-name:** `@amigo-labs/force-layout`
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
    alphaDecay?: number;         // default: 0.0228 (→ ~300 Ticks)
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
  Kein `.on('tick', cb)`-Callback. Browser-Animationen bleiben bei d3.
- **Must-have benchmark scenarios:**
  - **Tiny (20/30):** 20 Nodes, 30 Edges, 100 Ticks. Green-Gate: ≥ 1×.
  - **Median (100/150):** **Entscheider** — 100 Nodes, 150 Edges, bis Konvergenz (~300 Ticks). Green-Gate: ≥ 2×.
  - **Large (500/800):** 500/800, 300 Ticks. Green-Gate: ≥ 3×.
  - **Tick-API (100/150, 300 × tick(1)):** misst Stateful-Class-Pfad mit JS-Loop. Yellow akzeptabel, Red-Warnung bei < 1.5×.
- **Green gate:** alle Batch-Szenarien + ≥2× Median.
- **Risks:**
  - **V8-Optimum:** d3's ManyBodyForce ist V8-JIT-freundlich — kleine Graphen könnten unter 2× liegen, weil die Rust-Pipeline pro Tick vergleichsweise wenig Arbeit hat.
  - **Force-Parity:** Exakte Reproduktion der d3-Force-Kombination ist nicht Ziel; Layout-Qualität "gleichwertig" reicht. Pixel-Regression-Tests werden brechen.
  - **Positions-Marshaling:** Float64Array/`Buffer` statt `{id, x, y}[]` könnte den Output-Overhead halbieren — v2-Optimierung falls Yellow.
  - **Baseline-Gap:** `docs/BASELINE.md` deckt nicht "Array of 500 Number-Objekte". Vor Port-Start `nodeArrayEcho`-Case im `_ffi-bench` ergänzen.

## If NO-GO — BACKLOG entry

```markdown
- **d3-force** (~2M/Woche standalone). N-Body-Force-Simulation. Shape-Green für Server-Side-Batch, aber Measurement ergab <2× auf dem Median-Case (100 Nodes × 300 Ticks), weil d3's Quadtree in V8 bereits JIT-optimal läuft. Eingefroren bis messbarer Hebel (SIMD-Quadtree?) oder Median-Graph wächst. Siehe `docs/perf-review/d3-force.md`.
```

Section: **FFI overhead > gain** oder **Parity too expensive**.
