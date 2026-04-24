# Backlog — Don't Touch

This file tracks npm packages we evaluated and archived as NO-GO, or that are structurally unsuitable for a Rust port via NAPI-RS. Future candidate scans must consult this list before reconsidering any of these.

**If you believe the calculus has genuinely changed** (V8 major bump, new Rust crate, spec stabilized, upstream revived) — run `rust-check` and update the corresponding review doc before reconsidering. Do not re-port without a fresh review.

## Tags

| Tag | Meaning |
|---|---|
| `[FFI]` | FFI-floor trap; work-per-call smaller than NAPI boundary cost |
| `[NATIVE]` | already wraps a C/C++ library; re-wrapping in Rust yields no speedup |
| `[IO]` | pure network or filesystem I/O; compute surface negligible |
| `[PARITY]` | spec-driven parity tail with unbounded maintenance cost |
| `[CALLBACK]` | plugin/chain API requires JS callbacks across FFI (measured antipattern, see `docs/post-mortems/xml.md`) |
| `[SCOPE]` | scope too large (browser DOM, protocol impl, JS runtime emulation) |
| `[JS-ENGINE]` | needs a full JS engine at runtime (e.g. embedded `<% %>` execution) |
| `[MEASURED]` | we actually built and benchmarked it; shipped Red, then deprecated |
| `[DEPRECATED]` | upstream npm package is deprecated; don't clone a dead library |

## Archived packages

| Package | Downloads/week | Tags | Reason | Review |
|---|---:|---|---|---|
| `ajv` | ~40M | `[PARITY]` | codegen-based vs. Rust's spec-interpreter `jsonschema` — different philosophies | [ajv.md](docs/perf-review/ajv.md) |
| `@anthropic-ai/sdk` | ~3M | `[IO]` | pure HTTP client; network latency dominates any Rust JSON-parse gain | [openai.md](docs/perf-review/openai.md) |
| `cheerio` | ~10M | `[CALLBACK]` `[PARITY]` | `parse5`/`htmlparser2` backend + 70+ mutation chain-methods = `xml` antipattern | [cheerio.md](docs/perf-review/cheerio.md) |
| `cohere-ai` | ~200k | `[IO]` | pure HTTP client | [openai.md](docs/perf-review/openai.md) |
| `compute-cosine-similarity` + siblings | ~500k | `[FFI]` | two small f64 arrays in, scalar out; V8 vectorizes the inner loop, marshalling drowns SIMD | [compute-cosine-similarity.md](docs/perf-review/compute-cosine-similarity.md) |
| `core-js` | ~60M | `[JS-ENGINE]` | polyfills for JS language standards; structurally not Rust-portable; obsolete on Node 18+ | [core-js.md](docs/perf-review/core-js.md) |
| `cosmiconfig` | ~143M | `[IO]` | mostly filesystem I/O, not CPU | [cosmiconfig.md](docs/perf-review/cosmiconfig.md) |
| `deep-equal` | shipped + deprecated 0.2.0 | `[MEASURED]` | 0.96×–1.30× across sizes; `fast-deep-equal` is 50 lines of V8-friendly JS, FFI has no headroom | [deep-equal.md](docs/perf-review/deep-equal.md), [post-mortem](docs/post-mortems/deep-equal.md) |
| `dotenv` | ~91M | `[FFI]` | parser is ~50 lines of V8-JIT'd JS; NAPI boundary exceeds the parse itself | [dotenv.md](docs/perf-review/dotenv.md) |
| `ejs` | ~39M | `[JS-ENGINE]` | embeds JS code at render time; needs QuickJS integration | [ejs.md](docs/perf-review/ejs.md) |
| `faiss-node` | ~10k | `[NATIVE]` | already a native C++ binding to Facebook-Faiss | [onnxruntime-node.md](docs/perf-review/onnxruntime-node.md) |
| `fastest-levenshtein` | ~2M | `[FFI]` | short-string-dominant corpus; repeats our measured `levenshtein` failure | [string-similarity.md](docs/perf-review/string-similarity.md) |
| `gpt-tokenizer` | — | `[MEASURED]` | 2–3× faster than our `@amigo-labs/tiktoken` Rust binding across all sizes | [gpt-tokenizer.md](docs/perf-review/gpt-tokenizer.md) |
| `handlebars` | ~35M | `[PARITY]` `[CALLBACK]` | `handlebars-rust` has documented divergences; helper callbacks across FFI expensive | [handlebars.md](docs/perf-review/handlebars.md) |
| `har-validator` | ~5M | `[DEPRECATED]` | upstream deprecated since 2020; orphaned by `request`'s deprecation | [har-validator.md](docs/perf-review/har-validator.md) |
| `hnswlib-node` | ~50k | `[NATIVE]` | already native C++ `hnswlib`; Rust `hnsw_rs` vs. C++ `hnswlib` ≈ 0.9–1.4× | [hnswlib-node.md](docs/perf-review/hnswlib-node.md) |
| `htmlparser2` | part of ~192M (w/ parse5) | `[PARITY]` | reaching `parse5`-level error-recovery parity plus two adapter APIs is too much | [htmlparser2.md](docs/perf-review/htmlparser2.md) |
| `js-yaml` | ~156M | `[PARITY]` | legacy custom tags + Ruby Psych compat quirks; possible as alternative, not drop-in | [js-yaml.md](docs/perf-review/js-yaml.md) |
| `jsdom` | ~76M | `[SCOPE]` | browser-API surface is gigantic | [jsdom.md](docs/perf-review/jsdom.md) |
| `langchain` / `@langchain/core` | ~4M | `[CALLBACK]` `[IO]` `[PARITY]` | orchestration framework over network-I/O + user callbacks; zero compute surface. Sub-scope `@langchain/textsplitters` is a separate GO candidate | [langchain.md](docs/perf-review/langchain.md) |
| `leven` | ~300k | `[FFI]` | see `string-similarity` | [string-similarity.md](docs/perf-review/string-similarity.md) |
| `levenshtein` | shipped + deprecated 0.2.0 | `[MEASURED]` | 0.13× at 10k chars; UTF-16↔UTF-8 marshalling dominates; SIMD can't offset | [levenshtein.md](docs/perf-review/levenshtein.md), [post-mortem](docs/post-mortems/levenshtein.md) |
| `marked` | ~30M | `[PARITY]` | `marked`'s GFM ≠ `pulldown-cmark`'s GFM; `@amigo-labs/commonmark` shipped as the spec-strict alternative | [marked.md](docs/perf-review/marked.md) |
| `mime` / `mime-types` | combined ~343M | `[FFI]` | pure hashmap lookups in JS; NAPI slower than JS baseline | [mime.md](docs/perf-review/mime.md), [mime-types.md](docs/perf-review/mime-types.md) |
| `moment` | ~15M, declining | `[DEPRECATED]` | upstream "in maintenance mode" since 2020; use `date-fns`/`dayjs`/`Temporal` | [moment.md](docs/perf-review/moment.md) |
| `onnxruntime-node` | ~400k | `[NATIVE]` | already wraps ONNX Runtime C++; Rust `ort` wraps the same library | [onnxruntime-node.md](docs/perf-review/onnxruntime-node.md) |
| `openai` | ~20M | `[IO]` | pure HTTP client; network RTT dominates by orders of magnitude | [openai.md](docs/perf-review/openai.md) |
| `parse5` | part of ~192M (w/ htmlparser2) | `[PARITY]` | `html5ever` is excellent but `parse5`-level error-recovery parity is too much | [parse5.md](docs/perf-review/parse5.md) |
| `remark` / `unified` | ~8M core / ~50M ecosystem | `[CALLBACK]` `[PARITY]` | core mdast parse already covered by `@amigo-labs/commonmark`; plugin-graph value-prop requires AST-marshalling = `xml` antipattern | [remark.md](docs/perf-review/remark.md) |
| `request` | ~8M, declining | `[DEPRECATED]` `[IO]` | formally deprecated Feb 2020 | [request.md](docs/perf-review/request.md) |
| `semver` | ~150M | `[FFI]` | V8-JIT'd parse + range-compare is microsecond work; 109 ns FFI floor eats any Rust gain; no batch ecosystem | [semver.md](docs/perf-review/semver.md) |
| `stopword` | ~1M | `[FFI]` | hashset lookup inside a filter loop; `Vec<String>` marshalling 30× the Rust compute. Integrated into `@amigo-labs/stemmer` instead | [stopword.md](docs/perf-review/stopword.md) |
| `string-similarity` | ~10M | `[FFI]` | short-string-dominant corpus; same failure mode as archived `levenshtein` crate | [string-similarity.md](docs/perf-review/string-similarity.md) |
| `tough-cookie` | ~157M | `[PARITY]` | browser-compat quirks + Public Suffix List + cookie-jar state; easily a month-long project | [tough-cookie.md](docs/perf-review/tough-cookie.md) |
| `ws` | ~204M | `[SCOPE]` | integrating a WebSocket impl into the NAPI event loop is hard | [ws.md](docs/perf-review/ws.md) |
| `@xenova/transformers` | ~500k | `[NATIVE]` `[PARITY]` | ORT-WASM abstraction layer; compute is ORT's, parity surface is Python HF Transformers | [xenova-transformers.md](docs/perf-review/xenova-transformers.md) |
| `xml` | never published, archived 2026-04-19 | `[MEASURED]` | 0.72× `sax` at 10 MB SOAP; AST-over-FFI → V8 `JSON.parse` dominates output | [xml.md](docs/perf-review/xml.md), [post-mortem](docs/post-mortems/xml.md) |
