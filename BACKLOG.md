# Backlog — Don't Touch

This file tracks npm packages we evaluated and archived as NO-GO, or that are structurally unsuitable for a Rust port via NAPI-RS. Future candidate scans must consult this list before reconsidering any of these.

Each entry has a full `rust-check` review at `docs/perf-review/<name>.md` and carries short tags signalling the rejection reason. Entries are sorted alphabetically for scan-friendliness; the tag filter is the primary navigation aid.

**If you believe the calculus has genuinely changed** (V8 major bump, new Rust crate, spec stabilized, upstream revived) — run `rust-check` and update the corresponding review doc before reconsidering. Do not re-port without a fresh review.

## Tags

- `[FFI]` — FFI-floor trap; work-per-call smaller than NAPI boundary cost
- `[NATIVE]` — already wraps a C/C++ library; re-wrapping in Rust yields no speedup
- `[IO]` — pure network or filesystem I/O; compute surface negligible
- `[PARITY]` — spec-driven parity tail with unbounded maintenance cost
- `[CALLBACK]` — plugin/chain API requires JS callbacks across FFI (measured antipattern, see `docs/post-mortems/xml.md`)
- `[SCOPE]` — scope too large (browser DOM, protocol impl, JS runtime emulation)
- `[JS-ENGINE]` — needs a full JS engine at runtime (e.g. embedded `<% %>` execution)
- `[MEASURED]` — we actually built and benchmarked it; shipped Red, then deprecated
- `[DEPRECATED]` — upstream npm package is deprecated; don't clone a dead library

## Archived packages

- **`ajv`** (~40M/week) `[PARITY]` — codegen-based vs. Rust's spec-interpreter `jsonschema`: two different philosophies, not a port. `docs/perf-review/ajv.md`.
- **`@anthropic-ai/sdk`** (~3M/week) `[IO]` — pure HTTP client; network latency dominates any Rust JSON-parse gain. Covered under the `openai` review. `docs/perf-review/openai.md`.
- **`cheerio`** (~10M/week) `[CALLBACK]` `[PARITY]` — `parse5`/`htmlparser2` backend plus 70+ chain-method mutation API = `xml` antipattern per call step. `docs/perf-review/cheerio.md`.
- **`cohere-ai`** (~200k/week) `[IO]` — pure HTTP client; see the `openai` review. `docs/perf-review/openai.md`.
- **`compute-cosine-similarity`** and siblings (~500k/week combined) `[FFI]` — two small f64 arrays in, scalar out; V8 vectorizes the inner loop, marshalling drowns SIMD. Same lesson as `deep-equal`. `docs/perf-review/compute-cosine-similarity.md`.
- **`core-js`** (~60M/week) `[JS-ENGINE]` — polyfills for JS language standards; structurally not Rust-portable; obsolete on Node 18+. `docs/perf-review/core-js.md`.
- **`cosmiconfig`** (~143M/week) `[IO]` — mostly filesystem I/O, not CPU. `docs/perf-review/cosmiconfig.md`.
- **`deep-equal`** (shipped + deprecated in 0.2.0) `[MEASURED]` — 0.96×–1.30× across sizes; `fast-deep-equal` is 50 lines of V8-friendly JS, FFI has no headroom. `docs/post-mortems/deep-equal.md`, `docs/perf-review/deep-equal.md`.
- **`dotenv`** (~91M/week) `[FFI]` — parser is ~50 lines of V8-JIT'd JS; NAPI boundary cost exceeds the parse itself. `docs/perf-review/dotenv.md`.
- **`ejs`** (~39M/week) `[JS-ENGINE]` — embeds JS code at render time; not feasible without QuickJS integration. `docs/perf-review/ejs.md`.
- **`faiss-node`** (~10k/week) `[NATIVE]` — already a native C++ binding to Facebook-Faiss; re-wrapping in Rust is native-over-native. `docs/perf-review/onnxruntime-node.md` (covers the pattern).
- **`fastest-levenshtein`** (~2M/week) `[FFI]` — short-string-dominant corpus; repeats our measured `levenshtein` failure. `docs/perf-review/string-similarity.md`.
- **`gpt-tokenizer`** `[MEASURED]` — 2–3× faster than our `@amigo-labs/tiktoken` Rust binding across all sizes; its LRU-merge-cache plus V8-tuned hot path beat FFI'd `tiktoken-rs`. `docs/perf-review/gpt-tokenizer.md`.
- **`handlebars`** (~35M/week) `[PARITY]` `[CALLBACK]` — `handlebars-rust` has documented divergences; helper callbacks across FFI are expensive. `docs/perf-review/handlebars.md`.
- **`har-validator`** (~5M/week, declining) `[DEPRECATED]` — upstream deprecated since 2020; orphaned by `request`'s own deprecation. `docs/perf-review/har-validator.md`.
- **`hnswlib-node`** (~50k/week) `[NATIVE]` — already a native C++ binding; Rust `hnsw_rs` vs. C++ `hnswlib` is native-vs-native (~0.9–1.4×), fails Green gate structurally. `docs/perf-review/hnswlib-node.md`.
- **`htmlparser2`** (part of ~192M/week combined with `parse5`) `[PARITY]` — reaching `parse5`-level error-recovery parity plus two separate adapter APIs is too much. `docs/perf-review/htmlparser2.md`, `docs/perf-review/parse5.md`.
- **`js-yaml`** (~156M/week) `[PARITY]` — `js-yaml` has years of legacy custom tags and Ruby Psych compat quirks; could ship as "CommonMark-YAML" alternative but not as drop-in. `docs/perf-review/js-yaml.md`.
- **`jsdom`** (~76M/week) `[SCOPE]` — browser-API surface is gigantic. `docs/perf-review/jsdom.md`.
- **`langchain`** / **`@langchain/core`** (~4M/week combined) `[CALLBACK]` `[IO]` `[PARITY]` — orchestration framework over network-I/O and user callbacks; zero compute surface of its own; spec-driven tail never ends. The `@langchain/textsplitters` sub-scope is a separate GO candidate (see `docs/perf-review/langchain__textsplitters.md`). `docs/perf-review/langchain.md`.
- **`leven`** (~300k/week) `[FFI]` — see `string-similarity`. `docs/perf-review/string-similarity.md`.
- **`levenshtein`** (shipped + deprecated in 0.2.0) `[MEASURED]` — slower than JS on every size, worst 0.13× at 10k chars; UTF-16↔UTF-8 marshalling dominates; SIMD can't offset. `docs/post-mortems/levenshtein.md`, `docs/perf-review/levenshtein.md`.
- **`marked`** (~30M/week) `[PARITY]` — `marked`'s GFM interpretation ≠ `pulldown-cmark`'s GFM; pick one spec. `@amigo-labs/commonmark` shipped as the CommonMark+GFM-spec path. `docs/perf-review/marked.md`.
- **`mime`** / **`mime-types`** (combined ~343M/week) `[FFI]` — pure hashmap lookups in JS; calling through NAPI would be slower than the JS baseline. `docs/perf-review/mime.md`, `docs/perf-review/mime-types.md`.
- **`moment`** (~15M/week, declining) `[DEPRECATED]` — upstream "in maintenance mode" since 2020; use `date-fns`/`dayjs`/`Temporal`. `docs/perf-review/moment.md`.
- **`onnxruntime-node`** (~400k/week) `[NATIVE]` — already wraps ONNX Runtime C++; Rust `ort` wraps the same library. `docs/perf-review/onnxruntime-node.md`.
- **`openai`** (~20M/week) `[IO]` — pure HTTP client; network RTT dominates any Rust gain by orders of magnitude. `docs/perf-review/openai.md`.
- **`parse5`** (part of ~192M/week combined with `htmlparser2`) `[PARITY]` — `html5ever` is excellent but `parse5`-level error-recovery parity is too much. `docs/perf-review/parse5.md`.
- **`remark`** / `unified` ecosystem (~8M/week core, ~50M/week ecosystem) `[CALLBACK]` `[PARITY]` — core mdast parse is already covered by `@amigo-labs/commonmark`; value-prop is the 100+ plugin transformers, which require AST-marshalling across FFI = `xml` antipattern. `docs/perf-review/remark.md`.
- **`request`** (~8M/week, declining) `[DEPRECATED]` `[IO]` — formally deprecated February 2020; HTTP-client shape is Black anyway. `docs/perf-review/request.md`.
- **`semver`** (~150M/week) `[FFI]` — V8-JIT'd parse + range-compare is microsecond work; 109 ns FFI floor plus UTF-conversion eats any Rust gain; no batch ecosystem. `docs/perf-review/semver.md`.
- **`stopword`** (~1M/week) `[FFI]` — hashset lookup inside a filter loop; `Vec<String>` in/out marshalling is 30× the Rust compute. Integrated into `@amigo-labs/stemmer` instead. `docs/perf-review/stopword.md`.
- **`string-similarity`** (~10M/week) `[FFI]` — short-string-dominant corpus; same failure mode as our archived `levenshtein` crate. `docs/perf-review/string-similarity.md`.
- **`tough-cookie`** (~157M/week) `[PARITY]` — browser-compat quirks + Public Suffix List + cookie-jar state; easily a month-long project. `docs/perf-review/tough-cookie.md`.
- **`ws`** (~204M/week) `[SCOPE]` — integrating a WebSocket implementation into the NAPI event loop is hard. `docs/perf-review/ws.md`.
- **`@xenova/transformers`** (~500k/week) `[NATIVE]` `[PARITY]` — ORT-WASM abstraction layer; compute is ORT's, parity surface is Python Hugging-Face Transformers. Doubled rejection. `docs/perf-review/xenova-transformers.md`.
- **`xml`** (never published, archived 2026-04-19) `[MEASURED]` — 0.72× `sax` at 10 MB SOAP; AST-over-FFI means V8 `JSON.parse` dominates the output. Archived to `archived/xml/`. `docs/post-mortems/xml.md`, `docs/perf-review/xml.md`.
