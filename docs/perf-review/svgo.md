# Candidate review: `svgo`

> **Status:** GO (drop-in-oriented with scope limits) · **Predicted:** 🟢 Green · **Reviewed:** 2026-04-20
> **Shipped:** v0.1 on branch `claude/crate-performance-audit-6KLOJ` (2026-04-23). Benchmarks measured.


## Verdict

`svgo` is an **SVG optimizer**: parser → AST plugin pipeline → serializer. Shape is identical to the already-Green-shipped `sanitize-html` (and to `commonmark`): bytes-in / bytes-out, substantial compute per byte, no callback boundary if the plugin list is passed as a static config object (not as JS callbacks). Rust already has an actively developed competitor benchmarked against `svgo`: **`oxvg`** (Oxc team). The question here isn't "is Rust fast enough", it's "can we cleanly NAPI-wrap oxvg/usvg with enough plugin parity".

## JS package

- **npm:** [`svgo`](https://www.npmjs.com/package/svgo) (~10M/week, Q1 2026)
- **Exports:** `optimize(svgString, config?) → { data, info }`, plugin registry (`preset-default` with ~30 plugins, custom plugins possible), CLI
- **Typical input:** SVG string 0.5–500 KB (icons: ~1–5 KB; illustrations: 10–100 KB; exported chart output or Figma SVG: up to MBs)
- **Typical output:** minified SVG string, usually 30–70% smaller than input
- **Realistic median use-case:** **build-time optimization** of icon sets and static SVG assets in Webpack/Vite/Rollup pipelines; **runtime optimization** in CMS/editor uploads. Typically: 100–10,000 SVGs per build, each 1–20 KB

## Rust replacement

- **Candidate crate(s):**
  - **`oxvg`** (primary) — from the Oxc team (Bun/Oxlint), actively maintained, MIT, benchmarks explicitly against svgo, >30 plugin parity as a goal. Q1 2026 still pre-1.0 but productively matured.
  - `usvg` (secondary, baseline) — from the resvg team, parses SVG → intermediate representation, focused on rendering not optimization. Not drop-in-capable, but a high-quality SVG parser if the oxvg parser isn't enough.
  - `svgcleaner` (obsolete, archived 2020) — don't use
- **Maintenance / license:** `oxvg` MIT, active, monthly releases. Supply-chain risk low (Oxc ecosystem, same vendor as Oxlint).
- **Known gotchas / divergences:**
  - Plugin parity: svgo has ~30 core plugins (preset-default) + ecosystem plugins. oxvg covers the most important ones (removeComments, removeMetadata, removeEmptyAttrs, cleanupNumericValues, mergePaths, convertColors, removeHiddenElems, etc.) but not 100%. Limit v1 scope to `preset-default`.
  - Custom JS plugins: svgo allows user JS plugins (`fn visit(node) { ... }`). That's the **`ejs` trap** — if a user plugin triggers a JS callback per node, the Green plan breaks. Don't offer in v1; config plugins (built-ins with options) are sufficient for >95% of users.
  - Output byte parity: oxvg's serializer writes marginally differently (attribute ordering, whitespace). Build tools with hash-based caching (vite's asset hash) have to re-hash. Document, don't fix.

## BACKLOG check

No entry in `BACKLOG.md`. No `docs/packages.json` entry. Shape neighbor is `sanitize-html` (shipped Green).

## FFI-overhead prediction

| Factor | Assessment |
|---|---|
| Per-call work | Substantial. Icon (~2 KB): 0.5–2 ms in svgo. Medium SVG (~30 KB): 5–20 ms. Large export (~500 KB): 50–300 ms. Per-byte compute is high (parser + ~30 plugin passes + serializer). |
| Input size | SVG string 0.5 KB – 5 MB. As `Buffer` or UTF-8 `String` — both flat via `docs/BASELINE.md` (<200 ns up to ~1 MB). |
| Output size | Output usually 30–70% smaller than input. `String`/`Buffer` return flat. |
| Stateful potential | **High.** Plugin config + compiled plugin chain could live in an `SvgOptimizer` class. For build tools (10k icons per build) that saves the config parse per call. |
| Batch realism | **Very high.** Build tools call `optimize()` in a loop over all SVG assets — `optimizeMany(svgs: string[], config)` collapses N FFI crossings into one and allows Rayon parallelization across workers. |
| FFI-share | Single: ~5% for median SVG (~10 ms Rust work, ~0.5 ms input marshal). Batch 1000 icons: <0.5%. |

## Classification reasoning

`svgo` hits the same Green-shape template set as `sanitize-html` / `commonmark`:

- ✅ **Bytes-in, bytes-out** — no graph traversal across the FFI boundary
- ✅ **Substantial compute per byte** — parser + plugin pipeline is not trivial
- ✅ **No callback surface** (as long as custom JS plugins stay excluded)
- ✅ **Stateful + batch-natural** — build-tool use-case gives perfect amortization
- ✅ **Native competition is weak** — svgo itself is pure JS, no native bindings have been mainstreamed yet
- ✅ **Rust equivalent exists and is active** — oxvg isn't hypothetical

The only structural pitfall is the **custom JS plugin API**. svgo's public contract allows user code as plugins (`{ name, fn(root) { ... } }`). That's the `ejs` killer — if we offer that, every node-visit callback triggers an FFI roundtrip. v1 **must not expose it**. Migration path for power users: either they stay on svgo, or we later expose an `svgo-compat` plugin that loads svgo as a fallback for custom-plugin cases (analogous to the `canvg` pattern for chart.js compat).

**Shape match:**
- ✅ Like `sanitize-html` (shipped Green): parser + transform + serializer, bytes-in/bytes-out
- ✅ Like `commonmark`: parser + pipeline + serializer, batch-amortizable
- ❌ **Not** like `mime` / `deep-equal` (no short-input hot loop, no trivial compute)
- ❌ **Not** like `chart.js` (no runtime dependency, no animation callbacks)

**Benchmark gap flag:** the Green prediction needs oxvg parity verification before shipping. If oxvg is missing important plugins (e.g. `mergePaths` or `convertPathData` — the most expensive and most win-bearing), we either wait for oxvg PRs or build a custom port. Before the port starts: cross-check the oxvg plugin matrix against svgo's `preset-default`.

## If GO — proposed port

- **Recommended crate name:** `@amigo-labs/svgo` (drop-in-oriented, because oxvg already targets this contract — naming supports migration positioning)
- **Primary API sketch:**
  ```ts
  type SvgoPlugin =
    | 'removeComments'
    | 'removeMetadata'
    | 'removeEmptyAttrs'
    | 'cleanupNumericValues'
    | 'mergePaths'
    | 'convertColors'
    | 'removeHiddenElems'
    | 'convertPathData'
    | 'collapseGroups'
    | { name: SvgoPlugin; params?: Record<string, unknown> };

  type SvgoConfig = {
    plugins?: SvgoPlugin[];        // default: preset-default equivalent
    multipass?: boolean;           // default: false
    floatPrecision?: number;       // default: 3
  };

  type SvgoResult = {
    data: string;                  // optimized SVG
    info: { inputBytes: number; outputBytes: number; savedPercent: number };
  };

  export function optimize(svg: string | Buffer, config?: SvgoConfig): SvgoResult;
  export function optimizeMany(
    svgs: Array<string | Buffer>,
    config?: SvgoConfig
  ): SvgoResult[];        // internally parallelized with Rayon across N cores

  export class SvgOptimizer {
    constructor(config?: SvgoConfig);
    optimize(svg: string | Buffer): SvgoResult;
    optimizeMany(svgs: Array<string | Buffer>): SvgoResult[];
  }
  ```
  **Not** offered: custom function plugins. Documented as an explicit v1 scope cut.
- **Must-have benchmark scenarios:**
  - **Icon (2 KB):** 2 KB Figma-export icon, preset-default. Green gate: ≥ 2×.
  - **Medium (30 KB):** illustration SVG. Green gate: ≥ 3×.
  - **Large (500 KB):** complex chart/diagram SVG with hundreds of paths. Green gate: ≥ 3×.
  - **Batch 1000 icons:** `optimizeMany(1000 × 2 KB icon)`. Green gate: ≥ 5× (Rayon parallelization across cores).
  - **Stateful reuse (100 optimize calls on the same `SvgOptimizer` instance):** measures the config-cache lever. Green gate: ≥ 1.1× fresh-instance baseline (modest, only config-parse saving).
- **Green gate:** all five scenarios + plugin-parity matrix for `preset-default` ≥95%.
- **Risks:**
  - **Plugin-parity tail:** svgo's plugin set is the product of 10 years of community iteration. oxvg has ~25 of the 30 core plugins. The missing 5 are mostly edge-case optimizations (`reusePaths`, `sortAttrs`) that yield < 2% gain — can be documented as "v1 not supported, pass through unchanged".
  - **Custom-plugin surface:** some enterprise users have their own svgo plugins. Migration path: they stay on svgo, or we ship `@amigo-labs/svgo` with an explicit `externalPlugins: false` contract and they opt in consciously.
  - **Output byte parity:** oxvg's serializer optimizes differently from svgo's. Build tools with hash-based caching see a one-time cache-invalidation spike on migration. Document as a breaking change in v1.
  - **oxvg maturity:** Q1 2026 pre-1.0. If oxvg isn't stable enough for amigo's release cadence, option B: build directly on the `usvg` parser and write our own plugin pipeline (~2000 lines of Rust). Scope decision before the port starts.
  - **Baseline nuance:** SVG string input is UTF-8 — a `String` argument triggers V8's UTF-16 → UTF-8 conversion. Measurable for large SVGs (>100 KB). `Buffer` overload as the primary API path, `String` as a convenience shim. `docs/BASELINE.md:echoBuffer` covers this.

## If NO-GO — BACKLOG entry

Not applicable — prediction is Green with high confidence (`sanitize-html` precedent). If review after measurement still turns Yellow:

```markdown
- **svgo** (~10M/week). SVG optimizer. Shape-Green, but oxvg plugin parity to `preset-default` insufficient (<95% of the optimizations applied, output bytes noticeably larger than svgo). Port frozen until oxvg-1.0 or a custom-pipeline budget is available. See `docs/perf-review/svgo.md`.
```

Section: **Parity too expensive**.
