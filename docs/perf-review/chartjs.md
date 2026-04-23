# Candidate review: `chart.js`

> **Status:** NO-GO (permanent) · **Predicted:** ⚫ Black · **Reviewed:** 2026-04-20

## Verdict

`chart.js` is a **browser rendering library** for Canvas 2D with plugin callbacks, an animation loop, and an event-handler surface. The typical user calls it in browsers — where there is no NAPI. The server-side path (`chartjs-node-canvas`) already sits on `node-canvas` (Skia/Cairo, native C++); a Rust port would re-wrap an already-native baseline. The API surface (9+ chart types, plugin lifecycle, scales, tooltips, animations) is structurally a `jsdom`/`ejs` hybrid — huge scope **and** mandatory JS callbacks per frame.

## JS package

- **npm:** [`chart.js`](https://www.npmjs.com/package/chart.js)
- **Downloads:** ~5M/week (Q1 2026, all majors combined; v4.x dominant)
- **Exports / API surface:** `Chart` class (stateful, instantiated per canvas `ctx`), `registerables`, a controller per chart type (Line/Bar/Radar/Pie/Doughnut/PolarArea/Bubble/Scatter), plugin system with ~20 lifecycle hooks (`beforeDraw`, `afterRender`, `beforeEvent`, …), scales (linear/log/time/category), animation engine, interaction layer (hover/click/tooltips), legend renderer
- **Typical input:** Canvas `CanvasRenderingContext2D` + a large config object (`{ type, data: { datasets, labels }, options: { scales, plugins, animation, … } }`)
- **Typical output:** rendering side effect on `<canvas>` + `Chart` instance with `.update()`/`.destroy()`/`.resize()`/event API
- **Realistic median use-case:** **browser-interactive dashboards** — one `new Chart(ctx, cfg)`, then a mutation loop (`chart.data.datasets[0].data.push(x); chart.update()`), hover events, responsive resize. Non-browser usage (Node/SSR) is <5% of traffic and by default runs through `chartjs-node-canvas` (a wrapper around `node-canvas`, which itself is native C++/Skia)

## Rust replacement

- **Candidate crate(s):** none with a `chart.js`-compatible API. Existing Rust chart crates follow different philosophies:
  - `plotters` (active, MIT, ~2k⭐) — builder API, renders PNG/SVG/bitmap, no interactive rendering, no plugin surface
  - `poloto` (SVG only, static)
  - `charming` (Rust binding to Apache ECharts — requires a JS engine, only pushes the problem further)
  - `textplots` (irrelevant)
- **Maintenance / license:** `plotters` is the only serious option, but structurally incompatible with how `chart.js` is used (no stateful mutation, no plugins, no browser events)
- **Known gotchas / divergences:** `chart.js` is primarily **interactive**. Any meaningful use involves DOM events, RAF-driven animations, and plugin callbacks — all features a Rust crate cannot provide without triggering N FFI crossings into V8 per frame

## BACKLOG check

No existing `chart.js` or `chartjs` entry in `BACKLOG.md`. No chart/visualization library rated so far. No entry in `docs/packages.json`. This review is the first documented exclusion of this category.

## FFI-overhead prediction

| Factor | Assessment |
|---|---|
| Per-call algorithmic work | **Two paths, both problematic.** Browser: irrelevant — NAPI doesn't exist there. Server-side static render: substantial (layout + canvas draw ~1–10 ms), but the competing path (`chartjs-node-canvas` → `node-canvas` → Skia) is already native |
| Input size distribution | Config object ~1–50 KB JSON, datasets can be large (10k+ points). JSON serialization per `update()` would be additional overhead |
| Output size distribution | Browser: n/a (canvas side effect). Server: PNG/SVG 10 KB – 5 MB — a `Buffer` return would be flat (see `docs/BASELINE.md`), but the rest of the equation doesn't tip to Green |
| Reusable setup (stateful potential) | **High** (a `Chart` instance lives long), but that's exactly the trap: `update()`/mutation callbacks per frame = N FFI crossings. `jsdom` shape (object-mutation hot loop) |
| Batch-usage realism | Zero. Charts are mutated statefully, not batched |
| FFI-share estimate vs. Rust work | Browser use: 100% (NAPI not available). Server static: ~20–40% versus Rust draw, but the competitor is `node-canvas` (C++), not pure JS — win vs. the actual baseline is marginal to negative. Plugin/animation paths: >80% FFI for callback roundtrips |

## Classification reasoning

Three problems, each one Black-worthy alone, together permanently unportable:

1. **Wrong runtime.** chart.js's dominant use-case is the browser. NAPI binaries don't load in the browser. >95% of the user base is structurally unaddressable for a port. Even the best Rust optimizations produce zero value in the primary use-case. This is the same mistake `docs/post-mortems/xml.md` describes under "wrong baseline" — only a level earlier: here the runtime is wrong, not the baseline.

2. **Competitor is already native.** For the server-side niche path (`chartjs-node-canvas`), the JS baseline isn't JS at all — it's `node-canvas`, a C++/Skia binding. Measuring a Rust port against a native baseline repeats the mistake from `docs/perf-review/gpt-tokenizer.md` (Rust vs. V8-tuned JS), only more extreme: we'd be measuring Rust/Skia against C++/Skia. No expected win.

3. **Plugin and animation callbacks force coupling to the JS engine.** chart.js's plugin API (`beforeDraw`, `afterRender`, tooltip generators as callbacks) has exactly the same shape as `ejs`'s expression eval: user-supplied JS, per frame (60fps = 60 callbacks/sec minimum) back across the FFI into V8. That's the `docs/perf-review/ejs.md` trap. Even if plugins were made "optional", the default tooltip/legend formatters are already callbacks — the median user hits the worst case.

Bonus problem: **scope is as large as jsdom** — 9 chart-type controllers, scales hierarchy, animation engine, hit-testing, responsive layout. Parity investment in months, not days.

Reference patterns: **jsdom** (browser runtime, object mutation) + **ejs** (callback-per-expression) + **gpt-tokenizer lesson** (Rust doesn't win against already-native competition). No overlap with Green shapes (`commonmark`/`inflate`/`pdfkit-new`) — those take one spec object → one `Buffer` return with substantial one-shot compute. chart.js is the opposite: long-lived instance, many small state mutations, callback-heavy rendering.

**No "new package" escape hatch like in `pdfkit`.** The `pdfkit` review shows that a document-as-data reframing can rescue a chain-API drop-in. That doesn't work for chart.js: (a) the equivalent path — "plain spec object → PNG/SVG buffer" — is exactly what `plotters` offers natively in Rust, without a NAPI wrapper. Any Rust/Node user can bind `plotters` directly via their own Rust project; we add no value. (b) The interactive path (the actual `chart.js` use-case) is by definition browser-bound and therefore NAPI-unreachable. There is no middle layer on which an amigo package could sensibly land.

**Benchmark gap flag:** not relevant — the classification doesn't hinge on measurements, but on runtime/shape arguments. Benchmarks would only numerically confirm the structural rejection.

## If NO-GO — BACKLOG entry

```markdown
- **chart.js** (~5M). Browser-first Canvas-2D charting library with plugin callbacks and an animation loop. Three structural blockers: (1) the dominant use-case is the browser, where NAPI doesn't load — >95% of the user base is unreachable; (2) the server-side niche (`chartjs-node-canvas`) competes against `node-canvas`/Skia, i.e. an already-native C++ baseline; (3) plugin/animation callbacks force per-frame FFI roundtrips back into V8 (`ejs` trap). No "new package" reframing rescues this — the equivalent path (spec → PNG/SVG buffer) is already served directly by `plotters`, without a NAPI wrapper. No Rust chart crate has a `chart.js`-compatible API. Permanent NO-GO. The same exclusion applies analogously to `chartjs-node-canvas`, `react-chartjs-2`, `chartkick` and related visualization wrappers. See `docs/perf-review/chartjs.md`.
```

Section in `BACKLOG.md`: **Scope too large** (primary) — a secondary classification under **Needs a JS engine** for the plugin/animation callbacks would also be correct.
