# Candidate review: `typst`

> **Status:** GO (as a new package, not a drop-in) · **Predicted:** 🟢 Green · **Reviewed:** 2026-04-20

## Verdict

`typst` as a library is a textbook Green shape, structurally analogous to `commonmark` and `inflate`: **markup string + optional JSON data in → PDF bytes out, one FFI crossing per document**. The expensive work (parsing, layout, font resolution, PDF emission via `krilla`) runs entirely Rust-side. No callback boundary, no object traversal across the boundary, no chain-API trap like with `pdfkit`.

This is a **new package**, not a drop-in. The JS alternatives for multi-page business reports with tables (invoices, statements, dashboards) are Puppeteer (a Chromium process) or `pdfmake` / `html-pdf-node` — the former has hundreds of MB of overhead and starts a browser per request, the latter is pure JS without a serious typesetting engine. Against both, ≥2× is trivially reachable; against Puppeteer more like 10–50×.

Parity is not a goal: Typst is its own markup-language ecosystem — that's the product, not the compromise.

## JS package

- **npm:** no direct drop-in candidate — this package is a **new product**. Comparison alternatives in JS for business-report generation:
  - `puppeteer` (~5M/week) — HTML→PDF via Chromium, highest fidelity but massive process overhead
  - `pdfmake` (~400k/week) — pure-JS document-as-data API, with tables + page breaks
  - `html-pdf-node` / `html-pdf-chrome` (~150k/week) — wrappers around Chromium/Puppeteer
  - `jsreport` / `carbone` — higher-level abstraction, often use LibreOffice or Puppeteer internally
- **Downloads:** n/a (newcomer; the `typst-js` npm package at ~5k/week is a WASM build of the Typst CLI, not consumable as a library)
- **Exports / API surface:** kept small — `compile(source, data?) → Buffer`, stateful `TypstCompiler` class for repeated calls with shared font and package cache
- **Typical input:** Typst source 2–50 KB + optional JSON data object 100 B – 500 KB (invoice line items, report KPIs)
- **Typical output:** PDF bytes 20 KB – 5 MB, depending on page count and embedded assets
- **Realistic median use-case:** server-side invoice/statement generation, 10–500 documents per request, each 2–20 pages, templates written once and rendered many times with variable data

## Rust replacement

- **Candidate crate(s):** `typst` (primary — the core library of the Typst ecosystem, contains parser, compiler, layout engine) together with `typst-pdf` (PDF export via `krilla`) and `typst-kit` (font and package-resolution helpers for library embedding).
- **Maintenance / license:** very active (typst GmbH, broad OSS surroundings), Apache-2.0, clean library separation from 0.11+. No known ABI-break issues per release in the `typst` crate itself; the API between major versions is more stable than `krilla` or `pdf-writer` alone.
- **Known gotchas / divergences:**
  - **Font strategy must be explicitly decided** — typst doesn't resolve fonts out of the box: either we bundle a default set (Libertinus + Fira + New Computer Modern, ~15–20 MB), or we accept caller-provided TTF buffers, or we resolve from disk. The choice shapes binary size and portability.
  - **Package resolution** (`#import "@preview/…"`) goes online against the Typst package index. Default must be **offline-only** (supply-chain risk, sandboxing) — opt-in later, if at all.
  - **Cold start:** first `compile()` call loads fonts, parses the core library, costs 50–200 ms. Only amortizable via a `TypstCompiler` class.
  - **Binary size:** Typst brings substantial deps (Rust regex engine, ICU parts, `krilla`, font parser). Release build with `lto` + `strip` estimated at ~15–25 MB per platform target — roughly doubles the largest current package in the repo. Must be weighed explicitly against the policy.
  - **No pixel-parity goal** vs. Puppeteer/LibreOffice — same as `commonmark` vs. `marked`: own positioning as a spec-conformant Typst renderer.

## BACKLOG check

No existing `typst` entry in `BACKLOG.md`. The only PDF-related reference in `BACKLOG.md:12` is `pdf-parse` (text extraction via `pdf-extract` / `lopdf`) — that's the read path, not the write path. No overlap.

Delineation to existing reviews:
- `docs/perf-review/pdfkit.md` (2026-04-20) recommends `printpdf` for the **label/ticket use-case** (~2–20 KB, high-volume batch, trivial layout). That analysis explicitly excludes text wrapping and tables from v1 scope. This typst review addresses the complementary use-case — multi-page documents with tables, computed totals, proper typography. The two packages don't collide; they cover different shapes.
- `docs/post-mortems/xml.md` is the warning against object traversal across the FFI boundary — typst avoids that by design (bytes-in, bytes-out).

No entry in `docs/packages.json`.

## FFI-overhead prediction

| Factor | Assessment |
|---|---|
| Per-call algorithmic work | **Substantial.** 10-page invoice with a table ~8–25 ms Rust compute (parse + layout + PDF emit). 50-page report with math/charts ~80–300 ms. Relative to the FFI fixed-cost baseline (~110 ns), that's orders of magnitude of headroom. |
| Input size distribution | Typst source 2–50 KB + JSON data 0.1–500 KB. Via `Buffer` input (like `renderBytes` in `commonmark`), FFI input cost is ~flat 180 ns regardless of size (see `docs/BASELINE.md:28–30`). For string input up to 50 KB it would be ~20 µs UTF-16→UTF-8 — negligible next to compute. |
| Output size distribution | PDF bytes 20 KB – 5 MB. `Buffer` return is flat ~180 ns up to 10 MB (BASELINE.md:30) — output FFI cost is noise in the budget. |
| Reusable setup (stateful potential) | **High.** Font parsing + package cache costs 50–200 ms cold per font set. A `TypstCompiler` NAPI class caches fonts, parsed core-library modules, and (if enabled) loaded packages. On 500 invoices with the same template + same font set, that's the difference between 25 s and 4 s total wall-clock. |
| Batch-usage realism | **High.** Invoice runs, monthly statement batches, report generation for dashboards — the default is batch, not single request. `compileMany(jobs)` via `rayon::par_iter` collapses the FFI crossings and uses multiple cores — see `crates/commonmark/src/lib.rs:183–194` as a reference pattern. |
| FFI-share estimate vs. Rust work | <1% for 10+-page reports (one FFI-in, 10+ ms Rust compute, one FFI-out). Even for 2-page invoices <5%. The compute side dominates structurally. |

## Classification reasoning

The shape matches the existing Green packages `commonmark`, `inflate`, `zip`, `sanitize-html` exactly: **bytes-in, substantial compute, bytes-out, no callback boundary, no object traversal**. The Rust side does enough real work per byte that the FFI fixed costs go invisible. Per `docs/BASELINE.md:25–33`, the relevant floor (109 ns noop, 180 ns buffer return, ~35 µs per 100 KB string input) is three orders of magnitude smaller than the expected compute time (several ms per document) — so structural headroom is there.

The actual Green condition is the smallest realistic input: **a 1-page invoice, no batch, cold start included**. Cold that's ~100–200 ms (font load dominates) — typst loses against `pdfmake` there (~30–50 ms for a simple document in pure JS). Hot, with the `TypstCompiler` class, the same invoice runs in ~5–10 ms — then 3–6× faster than `pdfmake` with better typography. The 2×-at-smallest-input gate holds **only** on the hot path. That has to be transparent in the docs — it's the same nuance as with `commonmark`'s `Renderer` class.

Against Puppeteer/`html-pdf-node`, typst wins structurally on every input, because those start a browser process or hold one persistent (memory overhead ~100–300 MB per worker). For server-side invoice generation, that's a hard cost advantage, not just wall-clock.

A `parser-`/`handlebars`-shape trap does not exist: typst has no callback extension points across the FFI. Data comes in as JSON (one blob, one marshal), template modules come in as strings (one blob, one marshal). No `--include-helper=function` escape hatches.

**Benchmark gap flag:** the prediction is qualitative. Before the Green gate, the four scenarios below must be measured — without numbers the package stays at 🟡 Yellow, as with `pdfkit.md`.

## If GO — proposed port

- **Recommended crate name:** `@amigo-labs/typst`
- **Primary API sketch:**
  ```ts
  type FontSpec = { name?: string; data: Buffer };
  type CompileOptions = {
    /** Typst source as UTF-8 string or Buffer. */
    source: string | Buffer;
    /** JSON-serializable data injected into the template as sys.inputs. */
    data?: Record<string, unknown>;
    /** Additional in-memory source files addressable by #import "path". */
    virtualFiles?: Record<string, string | Buffer>;
  };

  /** One-shot convenience — allocates fonts per call, fine for low volume. */
  export function compile(opts: CompileOptions): Buffer;

  /** Reusable compiler — the Green path for batch / server workloads. */
  export class TypstCompiler {
    constructor(opts: {
      /** User-provided fonts. If omitted, ships a bundled default set. */
      fonts?: FontSpec[];
      /** Filesystem root for #include resolution. Default: no disk access. */
      root?: string;
      /** Allow @preview/ package resolution. Default: false (offline only). */
      allowPackages?: boolean;
    });
    compile(opts: CompileOptions): Buffer;
    compileMany(jobs: CompileOptions[]): Buffer[];
  }
  ```
  Explicitly **not** compatible with Puppeteer or `pdfmake`. The input language *is* Typst markup — that's a deliberate product offering.

- **Must-have benchmark scenarios:**
  - **small-cold:** 1-page invoice, single `compile()` call, against `pdfmake` + `puppeteer`. Report cold-start cost transparently.
  - **small-hot:** 1-page invoice via `TypstCompiler.compile()` after warm-up, against the same baseline. This is the actual Green gate.
  - **batch-500:** `compileMany` with 500 invoices, identical template, variable data. Against Puppeteer (worker pool with 4 workers) and `pdfmake` (single-thread). The main win case.
  - **long-report:** 50-page business report with tables, charts (as SVG/PNG), title page, table of contents. Against Puppeteer + ChartJS HTML. Tests layout scaling.
  - **realistic median:** 5-page monthly statement with 50-row table, an embedded chart, and computed totals.

- **Acceptance thresholds (Green gate):**
  - small-hot ≥ **2×** `pdfmake`
  - batch-500 ≥ **5×** `pdfmake` and ≥ **10×** `puppeteer` (wall-clock incl. process startup for Puppeteer)
  - long-report ≥ **2×** `puppeteer` (Puppeteer + HTML chart libs is actually fast here — the target is conservative)
  - small-cold is allowed to be worse than `pdfmake` — but must be documented, and the `compile()` standalone path should be explicitly positioned in the README as "for one-shot usage, warm path uses `TypstCompiler`"
  - Cold-start cost (first `TypstCompiler.compile()` incl. font load) has to be reported — transparency requirement analogous to `pdfkit.md`.

- **Risks:**
  - **Binary-size explosion.** Typst + fonts + krilla + pdf-writer estimate to 15–25 MB per NAPI target. Six targets = 90–150 MB total npm artifact size. Has to be weighed against the repo policy. Mitigation: optionally a `@amigo-labs/typst-fonts` peer package for the default fonts, `@amigo-labs/typst` itself stays font-free.
  - **Font-resolution complexity.** Three plausible strategies (bundled / user TTFs / disk-resolve) and all three are wanted by different user classes. v1 has to pick one and push the others into documented follow-ups, otherwise the API design diverges in three directions at once.
  - **Typst API churn.** The library API of `typst` + `typst-pdf` + `typst-kit` is comparatively stable from 0.11, but not 1.0. Major upgrades every ~6 months, some with API shifts. We're committing to a version pin and active maintenance of upgrades.
  - **User expectation "LaTeX-in-JS".** Typst is not LaTeX, doesn't know every LaTeX convention. Will produce support issues that can only be answered with "That's Typst, not LaTeX — see typst.app". The README has to make this upfront.
  - **Baseline nuance:** `docs/BASELINE.md` doesn't measure Typst compute. The FFI-share estimate above is derived from Typst community's own benchmarks, not measured in our harness. After the port, extend the `_ffi-bench` harness with a `compilePdfJob` case.

## If NO-GO — BACKLOG entry

If the binary-size budget (90–150 MB total for six targets) is judged a showstopper, or if the use-case is deemed too narrow for its own package:

```markdown
- **typst (as library)** (not on npm, ~5k/week as WASM build). Evaluated in `docs/perf-review/typst.md`. FFI shape is textbook Green (bytes-in, bytes-out, no callbacks), compute win against Puppeteer/pdfmake substantial (predicted 5–50× depending on use-case). Deferred due to binary size (~15–25 MB per platform × 6 targets = 90–150 MB npm artifact) and scope question: business-report generation is a narrow vertical that claims a significant share of the repo's download size. Re-evaluate once Typst offers a slimmer embedding profile or the repo's binary-size budget expands.
```

Section in `BACKLOG.md`: **Parity too expensive** (doesn't fit — it's not a parity problem) → rather a new section or **Scope too large**.
