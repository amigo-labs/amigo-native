# Backlog — Maybe in Future

Packages considered in earlier planning iterations and ruled out for now due to parity risk, excessive scope, or insufficient payoff. Any of these can be re-evaluated later if the calculus changes.

## Under investigation — AI / RAG preprocessing

New category, not yet ruled out. Each entry is subject to a `rust-check` candidate review before a port is scheduled. Download numbers are rough Q1 2026 estimates.

### Predicted Green (≥2× at median, FFI-shape viable)

- **pdf-parse** (~1M, text-extraction path). Per-document parsing via `pdf-extract` / `lopdf`. Parity on edge-case PDFs is the main risk. Full review: `docs/perf-review/pdf-parse.md`.
- **wink-bm25-text-search** / **bm25** (~15k combined). Index build + scoring over a corpus; amortized FFI. Index as NAPI class. Full review: `docs/perf-review/wink-bm25-text-search.md`.

## Under investigation — Document / report generation

Server-side PDF/document generation candidates. Same gate as above: `rust-check` review before scheduling.

### Predicted Green (≥2× at median, FFI-shape viable)

- **typst** (as library, not an npm drop-in target). Markup-language-based typesetting → PDF via `krilla`. Bytes-in (source + JSON data), bytes-out (PDF buffer) — same FFI shape as `commonmark`/`inflate`. Novel capability: no npm package offers native-speed Typst compilation; competes against Puppeteer (Chromium overhead) and `pdfmake` (pure JS, weak typography). Predicted 5–50× vs. Puppeteer on batch report runs. Main risks are binary size (~15–25 MB per target × 6 targets) and cold-start cost (font + core-library load, amortized via a stateful `TypstCompiler` NAPI class). Full review: `docs/perf-review/typst.md`.
- **printpdf** (as library, pairs with `@amigo-labs/pdf` — the new-package path from the `pdfkit` review). Low-level PDF builder for label/ticket/receipt workloads; document-as-data API, explicitly not a `pdfkit` drop-in. Full review: `docs/perf-review/pdfkit.md`. Listed here as the sibling of `typst` so future report-gen candidate scans see both paths in one place — `typst` covers business reports (tables, multi-page, typography), `printpdf` covers labels (high-volume batch, trivial layout). Non-overlapping.

### Predicted Yellow (green on large inputs, marginal on small)

- **@langchain/textsplitters** (~2M). Recursive character + token-aware splitters via `unicode-segmentation` plus custom logic. Green on RAG-scale documents, Red on tweet-sized chunks — must bench small bucket before committing.
- **natural** — Porter/Snowball batch surface only (~300k total). `rust-stemmers`. Single-word-per-call path is a Red trap; port requires deliberately *not* exposing the one-word API.
- **franc** / **cld** — language detection (~500k combined). `whatlang` / `lingua-rs`. Paragraph-size green, short-string red — gate on realistic median string length.
- **sbd** — sentence boundary detection (~200k). `pragmatic_segmenter`-style Rust. Parity with Pragmatic's abbreviation rules is real work but tractable.

### Ruled out — AI-category (FFI-shape or structural)

- **compute-cosine-similarity** & siblings (~500k). Two small arrays in, one float out — marshalling drowns SIMD. Same lesson as `deep-equal`.
- **string-similarity** / **leven** / **fastest-levenshtein** (~10M combined). Short-string dominant corpus — repeats the `levenshtein` failure exactly (see `docs/perf-review/levenshtein.md`).
- **stopword** (~1M). Hashset lookup per call — lookup-style FFI trap, same as `mime`.
- **onnxruntime-node** (~400k), **faiss-node** (~10k), **hnswlib-node** (~50k). Already native bindings over C++ libraries — re-wrapping a wrapper adds maintenance without speedup. `hnswlib-node` specifically: Rust `hnsw_rs` vs. C++ `hnswlib` is native-vs-native (expected 0.9–1.4×), fails Green gate structurally. Re-categorized from "Under investigation" 2026-04-21. Full review: `docs/perf-review/hnswlib-node.md`.
- **@xenova/transformers** (~500k). ORT-WASM based, spec-driven parity surface, bound by ORT not by us.
- **openai** / **@anthropic-ai/sdk** / **cohere-ai** (~30M+ combined). HTTP + JSON clients — zero compute surface, pure I/O.
- **langchain** / **langchain-core** (~4M). Callback-graph orchestration with unbounded async surface — parity tail never ends.

## Parity too expensive

- **js-yaml** (156M downloads). Spec-compliant YAML parity via `saphyr` is realistic, but `js-yaml` has years of legacy custom tags and Ruby Psych compat quirks. Could ship as a "CommonMark-YAML" alternative — not as a drop-in.
- **ajv** / **json-schema** (ajv ~40M). `ajv` is codegen-based; Rust `jsonschema` is a spec interpreter. Two different philosophies, not a port.
- **tough-cookie** (157M). Browser-compat quirks + Public Suffix List + cookie-jar state. Easily a month-long project.
- **handlebars** (35M). `handlebars-rust` ships with documented divergences; helper callbacks across the FFI boundary would be expensive.
- **parse5** / **htmlparser2** (combined 192M). `html5ever` is excellent, but reaching `parse5`-level error-recovery parity plus two separate adapter APIs is too much.
- **marked** (~30M). `marked`'s GFM interpretation ≠ `pulldown-cmark`'s GFM.

## Scope too large

- **jsdom** (76M). Browser-API surface is gigantic.
- **ws** (204M). Integrating a WebSocket implementation into the NAPI event loop is hard.

## FFI overhead > gain

- **mime** / **mime-types** (combined 343M). Pure hashmap lookups in JS — calling through NAPI would be slower than the JS baseline.
- **dotenv** (91M). Parser is ~50 lines of JS.
- **cosmiconfig** (143M). Mostly filesystem I/O, not CPU.

## Needs a JS engine

- **ejs** (39M). Executes embedded JS code at render time — not feasible without a QuickJS-style integration.

## Ported then deprecated — measured Red/Black

Packages we actually built, shipped or staged, benchmarked, and then retired because the numbers refused to meet the Green gate. Listed here so future candidate scans don't reconsider them without reading the post-mortem first.

- **deep-equal** (shipped, deprecated in 0.2.0). ~1.3× on flat objects, parity on nested / arrays. `fast-deep-equal` is 50 lines of V8-friendly JS — FFI overhead has no headroom to pay for. See `docs/post-mortems/deep-equal.md`, `docs/perf-review/deep-equal.md`.
- **levenshtein** (shipped, deprecated in 0.2.0). **Slower than JS on every size**, worsens with length (0.13× at 10k chars). UTF-16↔UTF-8 marshalling dominates; `triple_accel` SIMD can't offset it. See `docs/post-mortems/levenshtein.md`, `docs/perf-review/levenshtein.md`.
- **xml** (never published, archived 2026-04-19). 0.72× `sax` at 10 MB SOAP, 0.78× at 100 KB RSS; `parseXmlToJson` win relative to own baseline (3×) didn't close the gap to JS. Returning event trees as JS objects means V8 `JSON.parse` on the output dominates. See `docs/post-mortems/xml.md`, `docs/perf-review/xml.md`.
- **gpt-tokenizer** (not ported separately, considered a Red peer of `@amigo-labs/tiktoken`). gpt-tokenizer is 2–3× faster than our native Rust binding across all input sizes — its LRU-merge-cache plus V8-tuned hot path beat our FFI'd `tiktoken-rs`. Our tiktoken crate still ships (Green vs. `tiktoken` WASM + `js-tiktoken`) and exposes `encodeChat` / `countChatCompletionTokens` / `isWithinTokenLimit` as drop-ins, but gpt-tokenizer users have no reason to switch. See `docs/perf-review/gpt-tokenizer.md`, `docs/perf-review/tiktoken.md`.

## Deprecated / superseded

- `moment`, `request`, `core-js`, `har-validator`. Don't touch.
