# Candidate review: `dagre` / `@dagrejs/dagre`

> **Status:** GO (als neues Paket `@amigo-labs/graph-layout`, kein Drop-in) · **Predicted:** 🟢 Green · **Reviewed:** 2026-04-20

## Verdict

`dagre` ist ein reiner **Algorithmus** — Sugiyama-Style Layered-Layout für gerichtete Graphen — **ohne** DOM, Canvas, Events oder Plugin-Callbacks. Input: Graph-Topologie + Node-Größen. Output: Koordinaten. Das ist exakt die `commonmark` / `pdfkit`-neu Green-Shape: Bytes-in / Bytes-out, substantielle Compute pro Call, keine Callback-Boundary. Der einzige Fallstrick ist die Drop-in-Versuchung: die graphlib-Chain-API (`g.setNode(...); g.setEdge(...); dagre.layout(g)`) mit dutzenden `setNode`-Crossings pro Layout wäre die `xml`/`pdfkit-chain`-Falle. Als `layout(spec)`-Paket mit einem Call pro Graph ist es Green.

## JS package

- **npm:** [`dagre`](https://www.npmjs.com/package/dagre) (original, seit 2020 unmaintained) + [`@dagrejs/dagre`](https://www.npmjs.com/package/@dagrejs/dagre) (aktiver Fork, Major-Consumer-Empfehlung)
- **Downloads:** `dagre` ~1.5 M/Woche + `@dagrejs/dagre` ~1.3 M/Woche ≈ **~2.8 M/Woche kombiniert** (Q1 2026)
- **Exports / API surface:** `graphlib.Graph` (Node-Klasse, stateful), `layout(graph, opts?)`, `acyclic`, `normalize`, `rank`, `order`, `position` als Einzel-Phasen-Exports
- **Typical input:** Graph-Objekt mit `setNode(id, {width, height, label, rank?})` + `setEdge(v, w, {weight?, minlen?, labelpos?})` + Graph-Optionen (`rankdir`, `nodesep`, `ranksep`, `marginx`, `marginy`)
- **Typical output:** Der gleiche Graph, **in-place mutiert** — jeder Node bekommt `.x`, `.y`; jede Edge bekommt `.points: [{x, y}, …]` + Routing; Graph selbst bekommt `.width`, `.height`
- **Realistic median use-case:** **Mermaid-Flowcharts** (~20–200 Nodes, neuer Layout pro Edit), **ReactFlow-Editoren** (~10–500 Nodes, Re-Layout auf User-Action), **Cytoscape/joint.js-Dashboards**. Graphen sind meist 20–300 Nodes, 30–500 Edges. Re-Layout passiert **häufig** (pro User-Keystroke in manchen Editoren), aber immer als ein `layout()`-Call — nicht in Hot-Loops aufgerufen

## Rust replacement

- **Candidate crate(s):**
  - `layout` / `layout-rs` (nadavrot/layout auf crates.io) — **primär**. Sugiyama-Layered-Layout, aktiv gepflegt, MIT, pure-Rust, renderfähig zu SVG aber Koordinaten-Output ist direkt zugänglich. Keine native Dependencies, WASM-tauglich.
  - `petgraph` — für Graph-Primitive (DAG-Check, SCC, topological sort) als Baustein
  - `rust-sugiyama` (weniger bekannt, kleinerer Scope) — sekundär
  - Custom-Port: Der Sugiyama-Algorithmus aus `dagre/lib/` ist gut dokumentiert (~3000 Zeilen JS, davon ~1500 hot). Direkte Portierung mit `petgraph`-Backend ist tractable
- **Maintenance / license:** `layout-rs` MIT, aktiv, letzte Commits Q1 2026. `petgraph` ist Standard-Crate des Ökosystems. Kein Supply-Chain-Risiko.
- **Known gotchas / divergences:**
  - Pixel-Parity mit `dagre` **kein Ziel** — Sugiyama hat viele valide Lösungen pro Graph, jeder Implementer wählt marginal anders
  - Edge-Routing: `dagre`'s Spline-Heuristik (via `graphlib-dot` indirekt) ist proprietär; `layout-rs` routet direkt. Konsumenten wie Mermaid akzeptieren das, weil sie die Points ohnehin durch ihre eigene Spline-Library schieben
  - `ranker: 'network-simplex' | 'tight-tree' | 'longest-path'` — drei Ranker-Algorithmen in dagre. v1 kann auf `network-simplex` (der default) begrenzt sein; die anderen als Fast-Follow
  - Label-Nodes: `dagre` fügt implizit Dummy-Nodes für Kanten-Labels ein. Muss repliziert werden, sonst kollidieren Labels mit Edges

## BACKLOG check

Kein `dagre`-Eintrag in `BACKLOG.md`. Keine Graph-Layout- oder Visualisierungs-Bibliothek bisher bewertet (nur `chart.js` → Black). Kein Eintrag in `docs/packages.json`. Dieses Review ist der erste Kandidat in der Graph-Algorithmen-Kategorie und legt die Vorlage für `d3-force`, `cytoscape-layouts`, `elkjs` etc.

## FFI-overhead prediction

| Factor | Assessment |
|---|---|
| Per-call algorithmic work | **Substantiell für den Median-Case.** 100 Nodes / 150 Edges: ~2–10 ms in dagre JS (abhängig von Ranker). 500 Nodes / 800 Edges: ~50–200 ms. Rust-Port sollte 2–5× darunter liegen. Kein Trivial-Compute-Risiko. |
| Input size distribution | Graph-Spec als JSON/Array ~2–50 KB für den Median. Batch-Pass (ein Call mit `{nodes, edges}`) kollabiert die 150+ `setNode`/`setEdge` Crossings der graphlib-API auf **ein** Crossing. |
| Output size distribution | Positions-Array ~100 × 16 B (x/y doubles) + Edge-Points ~200 × 4 × 16 B = ~15 KB für Median-Graph. `Buffer`/Typed-Array-Return oder einfaches JS-Objekt — `docs/BASELINE.md` sagt beides ist flach <200 ns bis ~1 MB. |
| Reusable setup (stateful potential) | **Mittel.** Graph-Konfiguration (`rankdir`, `ranksep`, etc.) könnte in einer `GraphLayouter`-Klasse gecached werden. Größerer Hebel: bei Re-Layout auf User-Edit **mutiert** der User den Graph; wenn er eine NAPI-Klasse hält, könnte ein diff-basiertes Re-Layout später Punkte holen (Fast-Follow, nicht v1). |
| Batch-usage realism | **Mittel-niedrig.** Ein User-Edit = ein `layout()`-Call. Mermaid-Server (z.B. Docusaurus-Build) rendert aber hunderte Diagramme pro Build — `layoutMany(specs: LayoutSpec[])` ist für diese Use-Cases der Hebel. |
| FFI-share estimate vs. Rust work | Drop-in Chain-API (`setNode` × 150 + `layout()`): 150 Crossings × 180 ns = ~27 µs FFI bei ~5 ms Rust-Compute = **<1% FFI** — tolerabel, aber unnötig. Batch-Spec-API: <0.5% FFI. Beide sind Green-tauglich aus FFI-Sicht; Präferenz für Batch-API aus API-Hygiene-Gründen (kein Stateful-Object über FFI-Grenze mit Mutations-Semantik). |

## Classification reasoning

Dagre ist einer der **saubersten** Green-Shapes im JS-Ökosystem, gerade weil es keinen der drei `chart.js`-Blocker hat:

1. **Runtime-Symmetrie.** Dagre läuft identisch in Browser und Node — reiner Algorithmus, keine DOM-Dependencies. `@amigo-labs/graph-layout` erreicht den Node-Consumer-Pfad (Mermaid-Server, Docusaurus-Build, CI-Graph-Rendering, reactflow-SSR) ohne Runtime-Mismatch. Browser-Consumer bleiben auf JS, das ist OK — sie haben nie eine native Option.

2. **Keine native Konkurrenz.** Anders als `chart.js` (wo `node-canvas` → Skia das Feld hielt) hat Graph-Layout **keinen** nativen JS-Konkurrenten. Dagre ist pure JS, ELK ist Java (via GWT zu JS), alle anderen Layouter sind ebenfalls pure JS. Rust-Port misst gegen echte JS-Baseline.

3. **Keine Callback-Surface.** Dagre hat keine Plugins, keine Tooltip-Formatter, keine Animationen. Der einzige Callback im API ist `nodeOrder` (optional, selten genutzt). v1 kann ihn weglassen.

Zusätzlich: der Algorithmus ist **compute-bound**, nicht memory-bound — Crossing-Reduction ist der typische Hot-Path und das ist pure Integer-Arithmetik auf Rank-/Order-Arrays. Rust hat hier nachmessbare Gewinne (kein GC-Druck auf den inneren Loops, Fixed-Size-Arrays statt V8-Arrays, kein Hashmap-Lookup für Node-IDs wenn man auf `usize`-Indices geht).

**Shape-Matching:**
- ✅ Wie `commonmark` (Bytes-in-spec, Bytes-out-result, substantielle Compute)
- ✅ Wie `pdfkit` (neues Paket, nicht Drop-in; Spec→Output; stateful-class optional)
- ✅ Wie `sanitize-html` (AST-Transformation mit Parser + Algorithmus + Serializer)
- ❌ **Nicht** wie `chartjs` (keine Browser-Runtime, keine Native-Konkurrenz, keine Callbacks)
- ❌ **Nicht** wie `deep-equal`/`levenshtein` (kein Short-Input-Hot-Loop)

**Benchmark-Gap-Flag:** Die Green-Prediction ist algorithmisch fundiert aber unmeasured. Vor Shipping müssen die vier Szenarien unten gemessen werden. Kleinster Graph (10 Nodes) muss mindestens `1×` treffen — darunter kippt es auf Yellow. Ranker-Wahl ist Faktor: `network-simplex` ist der schwerste Pfad in dagre und damit der beste Gewinn-Kandidat; `longest-path` ist trivial und bringt kaum Rust-Gewinn.

## If GO — proposed port

- **Recommended crate-name:** `@amigo-labs/graph-layout` (nicht `@amigo-labs/dagre` — explizit nicht Drop-in, und öffnet Tür für weitere Layouter-Algorithmen als Fast-Follow: `force`, `elk-lite`, `hierarchical`)
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
    constructor(options?: LayoutOptions);   // Options einmal setzen, viele layouts
    layout(nodes: NodeSpec[], edges: EdgeSpec[]): LayoutResult;
  }
  ```
  **Explizit nicht** `graphlib.Graph`-kompatibel. Keine stateful Mutation über die FFI-Grenze, kein `g.node(id).x = ...`.
- **Must-have benchmark scenarios:**
  - **Tiny (10/12):** 10 Nodes, 12 Edges — Mermaid-Minimal-Flowchart. Misst ob FFI-Overhead den Win auffrisst. Green-Gate: ≥ 1×.
  - **Small (50/75):** typischer README-Flowchart. Green-Gate: ≥ 1.5×.
  - **Median (100/150):** **der eigentliche Bench-Entscheider** — ReactFlow-Editor mit mittlerer Komplexität. Green-Gate: ≥ 2×.
  - **Large (500/800):** CI/CD-DAG, Monorepo-Dep-Graph. Green-Gate: ≥ 3×.
  - **Ranker-Matrix:** alle drei Szenarien × {`network-simplex`, `longest-path`} getrennt messen. `network-simplex` ist der Gewinn-Driver.
- **Acceptance thresholds (Green gate):** alle oben + `layoutMany(100 × Median-Graph)` ≥ 3× dagre-Schleife (misst Batch-FFI-Amortisation). Ein Szenario unter dem Gate → Yellow, Review nach einem Sprint.
- **Risks:**
  - **Parity-Tail:** dagre hat 10 Jahre Edge-Cases (self-loops, multi-edges, disconnected components, rank-constraints, compound-nodes). v1-Scope muss explizit ausgewiesen sein: **einfache gerichtete Graphen, keine Compound-Nodes, keine Multi-Edges**. Das schließt ~95% des Mermaid/ReactFlow-Traffics ein.
  - **Output-Divergenz:** Positionen werden sich von dagre unterscheiden (auch schon zwischen `dagre` und `@dagrejs/dagre` gibt es Drift). Consumer müssen wissen: das Paket berechnet *ein gutes* Layout, nicht *dagre's* Layout. Mermaid-User die Pixel-Regression-Tests gegen dagre-Output haben, werden sie neu baseliine müssen.
  - **Layout-rs-Maturity:** Falls `layout-rs` nicht alle drei Ranker hat oder Edge-Routing schwach ist, muss der Sugiyama-Pipeline custom implementiert werden. Das ist ~2000 Zeilen Rust statt ~300. Vor Port-Start muss verifiziert werden.
  - **Benchmark-Realismus:** Der Median-Fall ist "User klickt, Layout neu" — also eine Single-Call-Latenz, nicht Throughput. Green ist erst dann Green, wenn die Single-Call-Latenz auch bei 100-Node-Graphen klar unter dem JS-Baseline liegt (inklusive First-Call-Cold-Start — keine Regex-Compile-o.ä. Kaltstart-Falle).
  - **`_ffi-bench`-Baseline-Nuance:** `docs/BASELINE.md` deckt `echoBuffer`, nicht "JSON-Objekt mit 500 Nodes". Input-Marshaling-Kosten für tiefe Node-Arrays sind qualitativ geschätzt, nicht gemessen. Vor Port-Start einen `nodeArrayEcho(n)`-Case zum `_ffi-bench`-Crate ergänzen.

## If NO-GO — BACKLOG entry

Nicht einschlägig — Prediction ist Green. Falls das Review-Ergebnis nach Messung aber Yellow oder Red würde (z.B. wenn `layout-rs` auf kleinen Graphen langsamer ist als dagre-JS weil JS' JIT die einfachen Integer-Loops schon optimal übersetzt), wäre die BACKLOG-Einordnung:

```markdown
- **dagre / @dagrejs/dagre** (~2.8M/Woche kombiniert). Graph-Layout-Algorithmus (Sugiyama-layered). Shape-technisch Green — aber Measurement ergab <1.5× Gewinn auf dem Median-Case (100/150 Graph), weil V8 den Crossing-Reduction-Hotloop bereits gut JIT'd. Port eingefroren bis a) messbar schnellerer Rust-Sugiyama-Ansatz gefunden (SIMD für Rank-Arrays?), b) Median-Case sich zu größeren Graphen verschiebt. Siehe `docs/perf-review/dagre.md`.
```

Section in `BACKLOG.md`: **FFI overhead > gain** (falls klein-Graph-Problem) oder **Parity too expensive** (falls Sugiyama-Varianten-Tail zu lang wird).
