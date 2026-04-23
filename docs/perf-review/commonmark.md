# Candidate review: `commonmark`

> **Status:** GO (as a new package, not a drop-in for `marked`) · **Predicted:** 🟢 Green · **Reviewed:** 2026-04-19

## Verdict

`pulldown-cmark` is a textbook Green shape: bytes-in / bytes-out, substantial compute work per byte, no object traversal, no callback-boundary problem. As a *new* package with honest positioning (CommonMark + GFM spec-strict, not `marked`-compatible) it sidesteps the parity trap that blocks `marked` itself.

## JS package

- **npm:** no direct candidate as a drop-in target — this package is a **new product**. Comparison alternatives in JS: `marked` (~30M/week), `markdown-it` (~25M/week), `commonmark.js` (~2M/week)
- **Downloads:** n/a (newcomer)
- **Exports / API surface:** kept small — `render(md: string, opts?): string`, possibly `parse(md) → token-array` for streaming/walk use-cases
- **Typical input:** Markdown document 1 KB – 1 MB
- **Typical output:** HTML string
- **Realistic median use-case:** site builders (Astro/Docusaurus-style tools) rendering 500–5000 docs per build; CLI README viewers; AI chat UIs that render Markdown responses server-side

## Rust replacement

- **Candidate crate(s):** `pulldown-cmark` (primary — minimal, fast, CommonMark-compliant, GFM extensions via feature flags), `comrak` (more feature-rich, more GFM parity with GitHub, larger bundle)
- **Maintenance / license:** `pulldown-cmark` active (raphlinus + contributors), MIT; `comrak` active, BSD-2
- **Known gotchas / divergences:** CommonMark 0.30 spec as the baseline — if we communicate that cleanly, "divergence" is not a bug but a feature

## BACKLOG check

No existing BACKLOG entry. `marked` is listed there as a drop-in NO-GO — this package is explicitly **not** a `marked` replacement but a stand-alone offering.

## FFI-overhead prediction

| Factor | Assessment |
|---|---|
| Per-call algorithmic work | Substantial: 100 KB Markdown ~500 µs – 1 ms in `pulldown-cmark`, JS baseline `marked` ~5 ms → 5–10× headroom |
| Input size distribution | 1 KB – 1 MB, `Buffer` input possible → FFI input cost negligible |
| Output size distribution | HTML string ~1.5× input size; 0.35 ns/byte FFI output cost = ~50 µs at 150 KB output — tolerable |
| Reusable setup (stateful potential) | Low — options are small, no expensive setup |
| Batch-usage realism | High: site builders render hundreds of docs per build; a `renderMany(docs: string[])` API makes sense |
| FFI-share estimate vs. Rust work | <15% on documents ≥10 KB; ~40% at 1 KB but speedup is still ≥2× |

## Classification reasoning

The shape matches `sanitize-html` and `inflate` in the repo exactly: bytes-in, substantial compute, bytes-out. Not a `deep-equal` shape (no object traversal), not a `handlebars` shape (no callbacks), not a `mime` shape (no FFI trap). `pulldown-cmark` is also a pull parser, streams internally — memory footprint is good.

The single condition for Green instead of Yellow: the smallest realistic input has to perform cleanly. At 1 KB Markdown JS `marked` is ~50 µs, `pulldown-cmark` over FFI comes in at an estimated ~15–20 µs — above 2×. At 100 KB it becomes 8–10×. The 2×-at-smallest-input gate holds.

GFM parity with `pulldown-cmark` is good: tables, strikethrough, task lists, footnotes, autolinks via feature flags. It's not `marked`-compatible, but it is **spec-compatible** — and a spec-compatible CommonMark/GFM is an honest, defensible position.

## If GO — proposed port

- **Recommended crate name:** `@amigo-labs/commonmark`
- **Primary API sketch:**
  ```ts
  export interface CommonMarkOptions {
    gfm?: boolean;                // default true (tables, strike, task-lists, autolinks)
    footnotes?: boolean;          // default false
    smartPunctuation?: boolean;   // default false
    unsafeHtml?: boolean;         // default false — filter raw HTML
    headingIds?: boolean;         // default true — slugify headings
  }

  export function render(markdown: string | Buffer, opts?: CommonMarkOptions): string;

  // Batch API for site builders
  export function renderMany(docs: Array<string | Buffer>, opts?: CommonMarkOptions): string[];

  // Optional: stateful renderer class for repeated calls with the same opts set
  export class Renderer {
    constructor(opts?: CommonMarkOptions);
    render(markdown: string | Buffer): string;
  }
  ```

- **Must-have benchmark scenarios:**
  - **small**: 1 KB Markdown (typical blog paragraph) vs. `marked`, `markdown-it`
  - **medium**: 50 KB (long blog post / README) vs. same
  - **large**: 500 KB (Docusaurus API reference) vs. same
  - **batch**: `renderMany(500 × 10KB docs)` — site-build shape
  - **realistic median**: AI chat response shape, 2–5 KB with code blocks + inline formatting

- **Acceptance thresholds (Green gate):**
  - ≥2× vs. `marked` at 1 KB
  - ≥5× at 50 KB
  - ≥8× at 500 KB
  - `renderMany` per-item overhead ≤15% vs. single call (otherwise no batch gain)

- **Risks:**
  - **Feature-request drift**: users want `marked` plugins or `markdown-it` plugins ported — clearly document "spec-only, no plugin API in v1"
  - **Heading IDs / slug behavior**: `github-slugger` is the de-facto standard in JS; we either have to reuse `slug`/`slugify` (we ship `@amigo-labs/slugify`) or introduce a new `headingSlugger`
  - **HTML sanitizing interaction**: `unsafeHtml: false` must be clearly documented; users who need raw HTML will turn it on and then have an XSS incident → README warning, link to `@amigo-labs/sanitize-html` as the recommended chain
  - **GFM edge cases vs. GitHub**: `pulldown-cmark`'s GFM ≈ GitHub's GFM, but not byte-identical. Irrelevant for most users, problematic for GitHub-rendering clones — document in the README

## If NO-GO — BACKLOG entry

n/a — recommendation is GO.
