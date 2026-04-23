# Candidate review: `pdfkit`

> **Status:** GO (as a new package, not a drop-in for `pdfkit`) · **Predicted:** 🟡 Yellow leaning 🟢 Green · **Reviewed:** 2026-04-20

## Verdict

`pdfkit`'s fluent-chain API (`doc.text().image().font().addPage().end()`) is the gut shape the `xml` post-mortem warns against directly: dozens to hundreds of small FFI crossings per document. A 1:1 drop-in is ⚫ Black. As a **new package** with a *document-as-data* API (one spec object → one `Buffer` return per call, plus a batch API and a stateful font cache) it runs on the same track as `commonmark`/`inflate`: substantial compute, bytes-out via `Buffer` (flat at ~180 ns), no chained-call chain across the FFI boundary. For the stated median use-case (high-volume labels/tickets), the batch form is actually the main attraction.

## JS package

- **npm:** [`pdfkit`](https://www.npmjs.com/package/pdfkit)
- **Downloads:** ~2.3M/week (v0.18.0, Q1 2026)
- **Exports / API surface:** fluent-chainable builder: `new PDFDocument()`, `.text()`, `.font()`, `.fontSize()`, `.image()`, `.moveTo()`, `.lineTo()`, `.stroke()`, `.addPage()`, `.end()`; `PDFDocument` is a readable Node stream, typically consumed via `doc.pipe(fs.createWriteStream(...))`
- **Typical input:** imperative script firing dozens–hundreds of chain calls (text segments, coordinates, images as Buffer/path, font references)
- **Typical output:** PDF bytes, usually 2 KB – 10 MB, delivered via a Node stream
- **Realistic median use-case (confirmed by user):** **high-volume label/ticket printing** — thousands of small PDFs per request, each ~2–20 KB, nearly identical templates with variable fields (address, barcode, ID)

## Rust replacement

- **Candidate crate(s):** `printpdf` (primary — low-level, actively maintained by fschutt, WASM-capable, pure-Rust deps) · `pdf-writer` (secondary — minimalistic, very low allocation, but even more low-level) · `krilla` (newer, high-level, ergonomic — watch list for maturity)
- **Maintenance / license:** `printpdf` active, MIT-licensed; `genpdf` (checked as a high-level option) has no commits in ~3 years → **disqualified**; `lopdf` too low-level for a productive port
- **Known gotchas / divergences:**
  - Font embedding: `pdfkit` ships with 14 embedded standard Type-1 fonts; in Rust TTFs have to be loaded and subsetted explicitly (`printpdf` via `ttf-parser`/`owned_ttf_parser`)
  - Image embedding: JPEG directly, PNG via a decoder — `printpdf` has both, but color-space handling differs from `pdfkit`
  - Text layout: `pdfkit` has line-breaking/word-wrapping built in; `printpdf` expects pre-computed coordinates → limit v1 scope to labels, where layout is trivial
  - Pixel-identical output with `pdfkit` is **not a goal** — the package is explicitly incompatible

## BACKLOG check

No existing `pdfkit` entry. The only PDF-related reference in `BACKLOG.md:12` is `pdf-parse` (extraction, not generation) — no overlap. No entry in `docs/packages.json`.

## FFI-overhead prediction

| Factor | Assessment |
|---|---|
| Per-call algorithmic work | **Path-dependent.** Drop-in (per chain call): trivial (< 1 µs per `.text()` → FFI dominates). New package (per `generate(spec)`): substantial (label ~50–200 µs for font subset + zlib stream pack) |
| Input size distribution | Drop-in: many small strings/numbers per call. New package: spec object (~100 B – 5 KB JSON) per label; batch array for 1000 labels = ~1–5 MB — both tolerable via `Buffer`/JSON string |
| Output size distribution | Labels 2–20 KB, tickets 5–50 KB, reports 50 KB – 10 MB. `Buffer` return is flat ~180 ns from 1 KB to 10 MB (see `docs/BASELINE.md:26–30`) — output FFI cost negligible |
| Reusable setup (stateful potential) | **High.** Font parsing + glyph cache costs ~5–15 ms cold per font. At 1000 labels with the same font, doing this per call would be a killer — a stateful `PdfBuilder` class pattern (load font once, many `generate()` on it) is the decisive optimization |
| Batch-usage realism | **Very high for the stated use-case.** Label printing is batch by definition; `generateMany(specs: LabelSpec[]): Buffer[]` collapses 1000 FFI crossings into one |
| FFI-share estimate vs. Rust work | Drop-in chain API: >90% FFI (→ ⚫ Black). New package single: ~30% for small labels (~50 µs Rust work, ~15 µs input marshal). Batch 1000: <2% FFI (one crossing amortized over 1000 labels) |

## Classification reasoning

Two paths — two classifications. The decision is API shape, not Rust-vs-JS.

**Path A — drop-in (1:1 mirror of the chain API) → ⚫ Black.** Every `.text()`, `.moveTo()`, `.stroke()` is an FFI crossing with string arguments. 1000 labels × ~30 chain calls = 30,000 FFI crossings per request. That's the exact gut shape that `docs/post-mortems/xml.md:32–40` describes as catastrophic ("~10k FFI crossings — more than the `sax` library's entire JS execution"). Parity cost (stream protocol, chain-return semantics, image pipeline, font registry) is high, and at the end the thing is slower than `pdfkit` in JS. No combination of C levers rescues that.

**Path B — new package, document-as-data → 🟡 Yellow with a reachable 🟢 Green gate.** The caller builds a plain JS spec object (`{ width, height, elements: [{type: 'text', x, y, value, font}, {type: 'barcode', ...}] }`), one NAPI call consumes it and returns the PDF `Buffer`. A stateful `PdfBuilder` class caches fonts. `generateMany(specs)` for real batching. The pattern reproduces `commonmark`'s Green shape exactly (see `docs/perf-review/commonmark.md:1–3`): bytes-in, bytes-out, substantial compute per byte, no object traversal, no callback boundary. For labels, the layout work is trivial enough that `printpdf`'s low-level interface suffices — the v1 feature set can stay deliberately small.

Reference patterns: shape resembles `commonmark` (GO new package, bytes-out) and `inflate` (shipped, `Buffer` flat via BASELINE) → 🟢 Green shape. NOT `nanoid`/`mime` (small inputs, trivial per-call).

**Benchmark gap flag:** the prediction is qualitative. Before the Green gate, the three scenarios below must be measured — without numbers the package stays at 🟡 Yellow.

## If GO — proposed port

- **Recommended crate name:** `@amigo-labs/pdf`
- **Primary API sketch:**
  ```ts
  type FontSpec = { name: string; data: Buffer };
  type LabelSpec = {
    width: number;   // pt
    height: number;  // pt
    elements: Array<
      | { type: 'text'; x: number; y: number; font: string; size: number; value: string }
      | { type: 'barcode'; x: number; y: number; encoding: 'code128' | 'ean13'; value: string }
      | { type: 'image'; x: number; y: number; w: number; h: number; data: Buffer }
      | { type: 'line'; x1: number; y1: number; x2: number; y2: number; width: number }
    >;
  };

  export class PdfBuilder {
    constructor(opts: { fonts: FontSpec[] });  // load and parse fonts once, cache subset-ready
    generate(spec: LabelSpec): Buffer;
    generateMany(specs: LabelSpec[]): Buffer[];   // critical for the high-volume use-case
  }
  ```
  Explicitly **not** `pdfkit`-compatible. No chainable methods across the FFI boundary.
- **Must-have benchmark scenarios:**
  - **Small-single:** one 4×6 address label (~2 KB output, one font, 3 text elements, one barcode). Measure cold start and hot path separately.
  - **Batch-1000 (the actual median case):** one `generateMany` with 1000 identically shaped labels, variable fields. Tests whether the stateful font cache + batch FFI amortization deliver the promised win.
  - **Medium 10-page receipt (~50 KB output):** multi-page, multiple fonts, text + lines + one image. Sanity check that the architecture scales beyond labels.
- **Acceptance thresholds (Green gate):**
  - Batch-1000 ≥ **5×** node `pdfkit` (total wall-clock from build → all 1000 buffers)
  - Small-single hot path ≥ **2×** `pdfkit`
  - Medium 10-page ≥ **2×** `pdfkit`
  - Cold-start cost (first `generate()` call incl. font load) has to be reported, even though it's not Green-gating — transparency requirement from the skill rule "realistic median explicitly stated"
- **Risks:**
  - **Feature scope creep:** as soon as users demand complex text wrapping, tables, SVG, or kerning-accurate multi-font layout, that blows past `printpdf`'s low-level surface. v1 must be documented as limited to labels/tickets/simple receipts — otherwise scope tips toward `genpdf` complexity (and that's stale).
  - **Font-subset quality:** `printpdf` subsetting is functional, but not as glyph-efficient as `pdfkit`'s fontkit. Output PDFs could be ~10–20% larger — irrelevant for labels, possibly visible for reports.
  - **Migration positioning:** communication must be unambiguous: new package for batch/label workloads, **not** a `pdfkit` migration target. Mispositioning would generate GitHub issues for pdfkit parity that are unsolvable by design.
  - **Baseline nuance:** `docs/BASELINE.md` covers `echoBuffer`, not PDF compute. The FFI-share estimate above is derived, not measured. After the port, add an `_ffi-bench` case for PDF-input-spec marshalling.

## If NO-GO — BACKLOG entry

If the user decides NO-GO after this review (e.g. because scope risk beyond labels is too high), or if we want to explicitly bury the drop-in path:

```markdown
- **pdfkit (as drop-in)** (~2.3M/week, PDF generation via a chainable builder API). Rejected after candidate review `docs/perf-review/pdfkit.md`: the chain API (`doc.text().image().addPage().end()`) produces dozens to hundreds of FFI crossings per document — exactly the shape `docs/post-mortems/xml.md` warns about. A *new* package `@amigo-labs/pdf` with a document-as-data API (one spec object → one Buffer, plus batch) is an independent option and not blocked by this rejection.
```

Section in `BACKLOG.md`: **FFI overhead > gain / Parity too expensive**
