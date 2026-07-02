# Candidate review: `pdf-parse`

> **Status:** GO (as a new package, scoped to text extraction) · **Predicted:** 🟢 Green · **Reviewed:** 2026-04-21
> **Shipped:** v0.1 on branch `claude/crate-performance-audit-6KLOJ` (2026-04-23). Benchmarks pending full bench suite.


## Verdict

`pdf-parse` is a thin wrapper around **Mozilla's pdf.js** — a ~500k-LOC pure-JS PDF renderer. For the pure text-extraction path that is massive overhead: full page-layout graph, font decoding, CIDMap resolution, all in JS land. Rust `lopdf` + `pdf-extract` run on SIMD-accelerated byte parsers, use native zlib/LZW decompressors, and skip the render pipeline entirely. The shape is textbook Green: **Buffer in / String out, one FFI crossing per document**, substantial CPU work per call. The real reservation is **parity on pathological PDFs** — encrypted, JBIG2, CJK CID mappings, malformed cross-reference tables — not perf.

## JS package

- **npm:** [`pdf-parse`](https://www.npmjs.com/package/pdf-parse)
- **Downloads:** ~1M/week (Q1 2026 estimate, BACKLOG figure confirmed)
- **Exports / API surface:** `pdf(dataBuffer, opts?) → Promise<{ text, numpages, numrender, info, metadata, version }>`. Minimalist; the second argument allows a `pagerender` callback (we ignore it in a port — a callback across the FFI boundary is an antipattern).
- **Typical input:** PDF buffers 50 KB – 10 MB. Median ~500 KB – 2 MB (whitepaper, invoice, report)
- **Typical output:** plaintext string of length 5 KB – 500 KB. Plus a metadata object (small, <1 KB)
- **Realistic median use-case:** **RAG ingestion batch** — pushing 100–10 000 PDFs through the pipeline, extracting `text` once per PDF and chunking it. Second use case: **ad-hoc server extraction** (upload form, one PDF per request). Both have the same shape: one PDF in, one text out, no per-page callbacks needed.

## Rust replacement

- **Candidate crate(s):**
  - [`pdf-extract`](https://crates.io/crates/pdf-extract) — **primary**. High-level API `extract_text(bytes) → Result<String>`, maintained (jrmuizel), MIT. Covers the 80/20 common PDF features: text streams, ligatures, CID decoding, layout reordering.
  - [`lopdf`](https://crates.io/crates/lopdf) — low-level PDF parser used as the backend. `pdf-extract` builds on it. Use it directly if we want more than just text (metadata fields, forms, attachments — fast follow).
  - [`pdf`](https://crates.io/crates/pdf) — alternative parser (pdf-rs/pdf), more active, but the API is unstable between 0.x releases.
  - **Not suitable:** `mupdf` bindings — that would again be a C-library wrapper (MuPDF in C), the same `hnswlib-node` mistake.
- **Maintenance / license:** `pdf-extract` MIT, `lopdf` MIT, both active (Q1 2026 releases). No supply-chain risk.
- **Known gotchas / divergences:**
  - **Encrypted PDFs**: `pdf-extract` v0.7 supports RC4 and AES-128 standard encryption, but **no** public-key security. For typical corporate PDFs (AES-128) that is sufficient.
  - **JBIG2-compressed images**: irrelevant for text extraction, but the parser must skip the stream gracefully.
  - **CJK fonts with proprietary CMaps**: the non-Unicode Adobe CMaps (GB-EUC-H etc.) are only partially implemented in `pdf-extract`. A corpus of Chinese/Japanese business PDFs must be checked side by side against `pdf-parse`.
  - **Text reordering**: `pdf-parse` emits text in page-stream order, `pdf-extract` attempts geometric reordering. Not a bug, but an output divergence — consumers doing regex-based matching on positional context will break.
  - **Form fields (AcroForms)**: `pdf-parse` ignores them, `pdf-extract` partially. Document the divergence.
  - **Malformed cross-references**: pdf.js has decades of recovery heuristics for broken PDFs. `lopdf`/`pdf-extract` have fewer. For edge-case PDFs (scanner output, old Adobe versions) parity may be missing.

## BACKLOG check

Existing entry: `BACKLOG.md:12`:
> **pdf-parse** (~1M, text-extraction path). Per-document parsing via `pdf-extract` / `lopdf`. Parity on edge-case PDFs is the main risk.

Categorized as "Predicted Green". This review confirms the prediction with the explicit scope caveat: **text extraction only, not pdf.js parity**.

Distinction from existing reviews:
- `docs/perf-review/pdfkit.md` and the `typst` review address the **write side** (producing PDFs). `pdf-parse` is the **read side**. No overlap, perfectly complementary.
- The binary-size question is far smaller here than for `typst` — `pdf-extract` + `lopdf` + deps land at ~3–5 MB per target, roughly the `zip`/`commonmark` category, not the `typst` category (15–25 MB).

No entry in `docs/packages.json`.

## FFI-overhead prediction

| Factor | Assessment |
|---|---|
| Per-call algorithmic work | **High.** Text extraction of a 1 MB PDF with 50 pages: pdf-parse/pdf.js ~200–500 ms in V8, `pdf-extract` expected at 20–80 ms. Substantial compute, FFI share <0.5%. |
| Input size distribution | Buffer 50 KB – 10 MB. Zero-copy via V8 buffer handle (`docs/BASELINE.md:30` — flat <200 ns up to 10 MB). No marshalling problem on the input side. |
| Output size distribution | String 5 KB – 500 KB. UTF-16 conversion costs ~0.35 ns/byte (`docs/BASELINE.md:27`). 500 KB output = ~175 µs conversion overhead — irrelevant against >20 ms of Rust compute (<1%). |
| Reusable setup (stateful potential) | Low. No model/key/schema per call. Document-parser state exists per document, not per API consumer. No NAPI class needed. |
| Batch-usage realism | High. RAG ingestion workload = "process 1000 PDFs". `extractTextMany(buffers: Buffer[]) → string[]` or `extractTextManyAsync` with a rayon pool would be the second lever beyond single calls — justifies a Phase-C1 sprint after v1. |
| FFI-share estimate vs. Rust work | <1% at the median (1 MB → 30 ms Rust). Scales even better on large documents. |

## Classification reasoning

PDF text extraction is **the canonical Green shape from the `inflate`/`commonmark` playbook**:

1. **The pure-JS baseline is slow.** pdf.js is a complete PDF renderer — interpreting the PostScript-like content streams, font-subset decoding, CIDMap resolution, layout compositing. For text extraction everything except the text-showing operators (`Tj`, `TJ`, `'`, `"`) gets thrown away — that is massive waste. Rust can drive the hot path directly: tokenize the content stream → keep only text operators → apply font mapping → concat. V8 optimization changes none of this, because the ballast sits in the parser graph.

2. **The compute is substantial.** A 1 MB PDF with 50 pages often corresponds to 5–15 MB of decompressed content streams that a tokenizer has to chew through. That is real work, not a hashmap lookup. The FFI floor of 109 ns is literally in the 0.0005% range.

3. **Input is a Buffer, output is a String.** The two most FFI-safe types. No `Vec<Object>`, no `Vec<String>`, no callback. Textbook.

4. **Parity is the only cost item, and industry practice knows it.** Tika, PDFBox, `pdftotext` (poppler), `pdf-parse` itself — they all diverge on edge-case PDFs. We document our divergences (`__conformance__/divergences.md` as with `commonmark`), and the "RAG ingestion" use case easily tolerates a 1–2% document failure rate, because upstream pipelines have fallback loops anyway.

**Shape matching:**
- ✅ Like `inflate` (Buffer in / Buffer out, substantial compute, zlib-rs as the engine)
- ✅ Like `commonmark` (spec parser, new package, no drop-in parity obligation, "we're the CommonMark renderer, not the marked clone")
- ❌ Not like `hnswlib-node` (no native competition — pdf.js is pure JS, not C++ passed through)
- ❌ Not like `deep-equal` (no short-input hot-loop trap — we process documents, not bytes)

**Benchmark-gap flag:** This prediction is made without a spike. Before shipping, four scenarios must be measured (see below). The realistic median (1 MB PDF) must hit ≥3×. The 50 KB bucket must hit ≥2× or be documented as a Yellow edge.

## If GO — proposed port

- **Recommended crate-name:** `@amigo-labs/pdf-parse` (drop-in-oriented name; the API shape matches; divergences documented as with `commonmark` against the spec)
- **Primary API sketch:**
  ```ts
  export interface PdfParseResult {
    text: string;
    numpages: number;
    info: Record<string, string>;   // Title, Author, Producer, Creator, CreationDate, ModDate
    metadata: Record<string, string> | null;  // XMP, if present
    version: string;   // "1.7" etc.
  }

  export function parse(buf: Buffer | Uint8Array, opts?: {
    max?: number;      // max pages to process (default: all)
    password?: string; // for AES-128 encrypted PDFs
  }): Promise<PdfParseResult>;

  // Synchronous path for small PDFs (<500 KB)
  export function parseSync(buf: Buffer | Uint8Array, opts?: ...): PdfParseResult;

  // Batch lever (fast follow in v0.2)
  export function parseMany(
    bufs: Buffer[],
    opts?: { concurrency?: number }
  ): Promise<PdfParseResult[]>;
  ```
- **Must-have benchmark scenarios (Gate):**
  - Small: 50 KB PDF (5 pages, English, simple text) — target ≥2× vs. `pdf-parse`
  - Medium: 1 MB PDF (50 pages, mixed text + tables) — target ≥3× (the main Green-gate case)
  - Large: 10 MB PDF (500 pages, report with graphics) — target ≥3×
  - Batch: 100 × 200 KB PDFs via `parseMany` — target ≥4× (rayon lever)
- **Acceptance thresholds (Green gate):** ≥2× on the small PDF AND ≥3× on the median AND ≥3× on large. Anything else becomes a Yellow sprint or a scope cut.
- **Risks:**
  - **Parity on CJK fonts** — must be validated with a corpus of Chinese/Japanese PDFs, divergences documented
  - **Encrypted-PDF coverage** — only AES-128 + RC4, no public key
  - **Edge-case recovery** — pdf.js has more recovery heuristics. Corpus fuzz testing needed (`fast-check` with malformed byte flips)
  - **Binary size** — ~3–5 MB per platform target × 6 targets. Below `typst`, but not trivial. `lto=true, strip=symbols, panic=abort` mandatory.
  - **Sync interface** — `pdf-parse` is async (because of pdf.js); we can offer sync and that is a feature, but users who rely on `await pdf(buf)` don't have to change the shape of their code

## If NO-GO — BACKLOG entry

Not applicable (GO recommendation).

Section in `BACKLOG.md`: **Under investigation — AI / RAG preprocessing** → the entry can stay where it is; update its status to "Reviewed GO 2026-04-21, ready for v0.1 spike."
