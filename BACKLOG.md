# Backlog — Maybe in Future

This file tracks **permanent NO-GO decisions** on npm packages we evaluated but chose not to port, organized by rejection reason. Future candidate scans should consult this list before reconsidering any of these packages — if the calculus has genuinely changed (V8 major bump, new Rust crate, etc.), re-reviews go through `rust-check` and update the corresponding `docs/perf-review/<pkg>.md`.

**Candidates with GO verdicts pending implementation** are tracked via their review docs in `docs/perf-review/` and surface in the main `docs/perf-review.md` table once they ship. They are not listed here until a final decision is reached.

## Ruled out — AI-category (FFI-shape or structural)

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
- **remark** / `unified` ecosystem (~8M core, ~50M ecosystem). Core mdast parse is CommonMark+GFM — already covered by `@amigo-labs/commonmark` (🟢 3.5×–8.1×). Value-prop is the 100+ `remark-*` plugins walking the AST in JS callbacks. Drop-in without plugins duplicates commonmark; with plugin-bridge requires AST marshalling across FFI = `xml` antipattern (measured Red, archived). Same lesson as `langchain`, `handlebars`, `ejs`. Full review: `docs/perf-review/remark.md`.
- **cheerio** (~10M). Server-side jQuery: `parse5`/`htmlparser2` backend (both flagged above) + 70+ chain-methods + mutation-chain API. Every `.find().attr().text()` step is an FFI crossing with intermediate Cheerio-collection marshalling — same shape as archived `xml`. Drop-in without the chain API isn't a drop-in; a separate bytes-in/bytes-out `@amigo-labs/html-extract` is a different market (not reviewed). Full review: `docs/perf-review/cheerio.md`.

## Scope too large

- **jsdom** (76M). Browser-API surface is gigantic.
- **ws** (204M). Integrating a WebSocket implementation into the NAPI event loop is hard.

## FFI overhead > gain

- **mime** / **mime-types** (combined 343M). Pure hashmap lookups in JS — calling through NAPI would be slower than the JS baseline.
- **dotenv** (91M). Parser is ~50 lines of JS.
- **cosmiconfig** (143M). Mostly filesystem I/O, not CPU.
- **semver** (~150M). Per-call work is microseconds of V8-JIT'd parse + range-compare. Rust `semver` crate is faster per-se (~2–3× isolated) but 109 ns FFI floor plus UTF-conversion eats the gain on typical `satisfies()` calls — realistic end-to-end ~1.2×. Package-manager resolvers use scattered-single-call pattern; no batch ecosystem. Same trap as `mime`/`dotenv`/`deep-equal`. Full review: `docs/perf-review/semver.md`.

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
