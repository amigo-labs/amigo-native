# Candidate review: `mermaid`

> **Status:** NO-GO (permanent) · **Predicted:** ⚫ Black · **Reviewed:** 2026-04-20

## Verdict

`mermaid` is a **browser-first diagram rendering library**: a DSL parser per diagram type followed by a D3/DOM-driven SVG renderer that depends on live `getBBox` text-metric queries. The realistic median user is a browser (docs-site, React app, Markdown-to-HTML pipeline), where NAPI cannot load. The server-side path (`@mermaid-js/mermaid-cli`) runs the entire library inside headless Chrome via Puppeteer — the JS-engine and DOM aren't incidental, they are the runtime. Scope is ~18 diagram types with independent grammars and layout engines; no Rust crate covers any of it. Three independent blockers (wrong runtime, no Rust replacement, JS-engine coupling for text layout) put this permanently out of reach. Same shape as the chart.js rejection, one tier worse on scope.

## JS package

- **npm:** [`mermaid`](https://www.npmjs.com/package/mermaid)
- **Downloads:** ~2.5–3M/week (Q1 2026; v10/v11 dominant)
- **Exports / API surface:** top-level `mermaid.initialize(config)`, `mermaid.render(id, source) → { svg, bindFunctions }`, `mermaid.parse(source)`, `mermaid.run({ nodes, ... })`, plus internal registries per diagram type (flowchart / sequence / class / state / ER / gantt / pie / requirement / git-graph / journey / C4 / mindmap / timeline / quadrant / sankey / block / architecture / packet / radar / xy-chart). Each diagram has its own Jison/Langium grammar and its own renderer module.
- **Typical input:** a string of mermaid DSL (50 B — 20 KB), optionally a config object (theme, fontFamily, securityLevel, flowchart-specific options, …)
- **Typical output:** SVG markup (10 KB — 500 KB) + a `bindFunctions` callback that attaches DOM event handlers inside a live document
- **Realistic median use-case:** rendering a diagram block inside a browser page (docs site, MDX, React component, Jupyter, Obsidian). The function is called once per diagram on page load, then re-rendered on theme/config change. Server-side rendering exists (`mmdc` CLI, Netlify/Vercel build pipelines) but every known implementation shells out to headless Chromium via Puppeteer/Playwright — `mermaid` itself requires a DOM to measure text.

## Rust replacement

- **Candidate crate(s):** none with a mermaid-compatible surface.
  - No `mermaid-rs` or equivalent on crates.io. A few toy flowchart parsers exist as personal projects, none parse multiple diagram types, none render.
  - `layout-rs`, `dagre-rs` (unmaintained) — partial dagre-style graph layout. Not mermaid. Would still need text metrics.
  - `graphviz-rust`, `dot-parser` — DOT, not mermaid. Different DSL, different semantics, different output expectations.
  - `typst` — whole-document system with its own diagram ecosystem. Not a port target.
  - `resvg`/`usvg` — SVG rendering, not SVG generation from a diagram DSL. Solves the wrong half of the problem.
- **Maintenance / license:** moot — nothing covers the surface. Even building a single diagram type (flowchart) from scratch would require a Rust port of dagre-style layered graph layout **plus** a text-shaping pipeline (`rustybuzz` / `cosmic-text`) to replicate browser `getBBox` — and then the result still wouldn't match browser-rendered output because fonts and text shaping differ.
- **Known gotchas / divergences:** mermaid's output is **visually compared against browser rendering in its own CI**. Any Rust reimplementation would diverge on exact node sizes, edge routing, wrapping, and font fallback. "Compatible" is not achievable without a browser measuring text.

## BACKLOG check

No `mermaid` entry in `BACKLOG.md`. No diagram-DSL library has been evaluated previously. Closest precedent is `chart.js` (`docs/perf-review/chartjs.md`, 2026-04-20) which was rejected for the same browser-first + large-scope + native-baseline reasons; mermaid shares all three and adds a fourth (text-metric coupling). Closest structural precedents in-tree: `jsdom` (`docs/perf-review/jsdom.md`, scope too large — browser API surface) and `ejs` (`docs/perf-review/ejs.md`, needs a JS engine). This review is the first recorded rejection in the diagram-DSL category; the verdict generalizes to `@mermaid-js/mermaid-cli`, `mermaid-js`, `remark-mermaid`, `rehype-mermaid`, and any other mermaid-wrapping package.

## FFI-overhead prediction

| Factor | Assessment |
|---|---|
| Per-call algorithmic work | Substantial in raw compute terms (parse DSL + build graph + run layout + emit SVG is 1–50 ms on realistic inputs), but inseparable from the DOM dependency — the layout step reads `getBBox` synchronously during rendering. Without a browser, the work can't run as-is. |
| Input size distribution | Small-to-medium strings (50 B – 20 KB DSL). Input transfer is cheap; not the problem. |
| Output size distribution | SVG 10 KB – 500 KB — `Buffer`/`string` return is fine if we only consider this axis. Doesn't rescue the rest. |
| Reusable setup (stateful potential) | Parser grammars and theme config are reusable, but the dominant cost is per-diagram layout, not setup. A NAPI class caching parsers saves <5% of total work. |
| Batch-usage realism | Near zero. Callers render one diagram per element, typically during page mount. No batched workload exists. |
| FFI-share estimate vs. Rust work | Irrelevant — the Rust crate doesn't exist and couldn't be built without replicating headless browser text layout. FFI overhead isn't the binding constraint; feasibility is. |

## Classification reasoning

Four independent blockers, any one sufficient for Black, together permanent:

1. **Wrong runtime.** Mermaid's primary consumer is the browser (docs, MDX, React, Jupyter, Obsidian, GitLab/GitHub issue rendering). NAPI binaries don't load in browsers. The server-side slice (`mmdc` + build-time pipelines) is <10% of traffic and already routes through Puppeteer/Chromium because mermaid itself needs a DOM. Same primary-use-case-unreachable problem as `chart.js` (`docs/perf-review/chartjs.md`) and the same "wrong runtime" failure mode flagged in `docs/post-mortems/xml.md`.

2. **No Rust target exists.** `chart.js` at least had `plotters` as a structurally-different-but-real alternative. Mermaid has nothing — not for flowchart, not for sequence, not for gantt, not for any diagram type. A port is not "wrap the Rust crate with NAPI", it is "implement mermaid from scratch in Rust, including 18 parsers and their renderers." That is a multi-year, multi-engineer product, not a crate.

3. **Text-metric coupling.** Mermaid's layout passes depend on `getBBox()` — the actual pixel size of rendered text in the current font. This is why `mmdc` uses headless Chrome: the layout algorithm is mathematically coupled to browser text shaping. Substituting `rustybuzz`/`cosmic-text` would produce measurably different node sizes and edge routing, breaking visual parity with every existing mermaid diagram on the internet. Parity isn't a tuning concern, it's unreachable. Same class of problem as `docs/perf-review/jsdom.md` — the browser API surface *is* the contract.

4. **Scope is larger than jsdom or chart.js.** 18 diagram types, each with its own grammar and renderer. Chart.js has 9 controllers sharing one scales/animation/plugin framework; mermaid has 18 largely-independent subsystems. A one-diagram-type MVP (flowchart only) is useless because callers pass arbitrary mermaid source and expect all diagrams to work.

Reference patterns: **chart.js** (wrong runtime + no Rust replacement + scope) + **jsdom** (DOM surface is the contract) + **ejs** (needs a JS engine to execute intended work). No overlap with any Green shape in the repo — those are bytes-in/bytes-out computational kernels (`inflate`, `sanitize-html`, `commonmark`, `jose`). Mermaid is the structural opposite: text-in, rendered-DOM-out, measured-in-browser.

**No "reframed package" rescue.** For `pdfkit`, a document-as-data reframing turned a chain API into a spec API and made a port possible. Mermaid has no equivalent reframing: the output *is* measured SVG, which *is* browser-computed layout. Exposing only the parser — `parseMermaid(src) → AST` — is a dead-end because callers who have the AST still need a renderer and no Rust renderer exists; callers who have a renderer (headless Chrome via `mmdc`) already have the parser. There is no middle layer a Rust crate can usefully occupy.

**Benchmark-gap flag:** not applicable — the rejection is structural (runtime + feasibility), not numerical. No benchmark would change the verdict; the port itself isn't buildable.

## If NO-GO — BACKLOG entry

```markdown
- **mermaid** (~2.5–3M). Browser-first diagram DSL renderer (flowchart / sequence / class / state / ER / gantt / pie / requirement / git / journey / C4 / mindmap / timeline / quadrant / sankey / block / architecture / packet / radar / xy). Four structural blockers: (1) dominant use-case is the browser (docs sites, MDX, React, Jupyter) where NAPI does not load — server-side `mmdc` already runs inside headless Chrome via Puppeteer; (2) no Rust crate covers any mermaid diagram type, and no standalone dagre-compatible layout engine with visual parity exists — a port is a multi-year reimplementation, not a wrapper; (3) layout algorithms are coupled to browser `getBBox` text shaping, so any Rust-side text metric substitution diverges from every existing mermaid diagram's visual output; (4) scope is 18 independently-grammared diagram subsystems — larger than jsdom or chart.js. Permanent NO-GO. Same exclusion applies to `@mermaid-js/mermaid-cli`, `remark-mermaid`, `rehype-mermaid`, and other mermaid wrappers. See `docs/perf-review/mermaid.md`.
```

Section in `BACKLOG.md`: **Scope too large** (primary) — with concurrent fit for **Needs a JS engine** (server-side path runs inside headless Chrome; browser path needs a live DOM for text metrics).
