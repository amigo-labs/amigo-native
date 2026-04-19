# Perf-Review: `@amigo-labs/levenshtein`

> **Status:** 🔴 Red · **Reviewed:** 2026-04-19 · **Version:** 0.2.0 (deprecated)

## Verdict

Current `String`-in / `u32`-out shape is structurally dominated by FFI conversion cost on the dominant (large-string) use case — deprecation stands, but **one untried lever (`Uint16Array` input) is worth a 1–2 day spike before final archival**, because the post-mortem explicitly records zero optimization experiments.

## Classification rationale

Measured regression on 3 of 4 size tiers vs. `fast-levenshtein` (0,52× / 1,70× / 0,32× / 0,22×). The only win is at 100 chars, which is not a realistic median for edit-distance use cases (fuzzy dictionary search typically runs short-vs-long or long-vs-long). Advertised speedup in `docs/packages.json` already reads "up to 1.7× faster / 4.6× slower", i.e. the registry-facing messaging matches the Red classification.

Algorithmic compute per byte is ~1–2 ns with SIMD banding (triple_accel). FFI-string-conversion costs 0,35 ns/byte × 2 directions = 0,7 ns/byte. The overhead is ≥35 % of the compute budget at every input size, and the ratio gets **worse** as strings grow — the opposite of the porting hypothesis.

## Evidence

### Measured speedup (from docs/data.json)

| Size | `@amigo-labs/levenshtein` (Hz) | `fast-levenshtein` (Hz) | `leven` (Hz) | Ratio vs. fast-levenshtein |
|---|---:|---:|---:|---:|
| 10 chars | 1.304.091 | 2.489.311 | 1.051.370 | **0,52× slower** |
| 100 chars | 285.657 | 167.767 | 23.575 | 1,70× faster |
| 1.000 chars | 1.035 | 3.230 | 258 | **0,32× slower** |
| 10.000 chars | 6,9 | 31,5 | 2,6 | **0,22× slower** |

Raw data: `docs/benchmarks/levenshtein.json`. Bench file: `crates/levenshtein/__bench__/index.bench.ts`.

### Realistic use-case

Edit distance is most commonly called in **batched fuzzy-match loops** against a dictionary (typo suggestions, search autocomplete, deduplication). The median call therefore compares one query string against hundreds to thousands of candidates, often with a `maxDistance` threshold. The current single-pair-String API is the worst shape for that pattern: every comparison pays the 109 ns NAPI floor plus two fresh UTF-16 → UTF-8 conversions, with no opportunity to amortize the query-side encoding.

The bench suite only covers uniform-length synthetic ASCII pairs across {10, 100, 1.000, 10.000} chars. That grid misses: (a) the asymmetric short-vs-long shape typical of query-vs-dictionary, (b) Unicode corpora where `triple_accel`'s byte-level distance silently diverges from JS char-level distance, (c) the common `distance ≤ k` early-termination pattern.

### Benchmark gaps

- **Asymmetric sizes** (query 10, candidates 50–500): no coverage — this is the dictionary-lookup median.
- **Batch-API numbers**: `distance_batch` is exported in `src/lib.rs:53–72` but **no bench entry exercises it**. The Vec<u32> output marshalling cost (43 ns/elem per `docs/BASELINE.md`) is unmeasured.
- **Bounded-distance pattern**: no `distance ≤ k` variant measured; this is where a Rust port could credibly win against pure-JS.
- **Unicode parity**: bench corpus is ASCII only. The byte-level DP in triple_accel would diverge from char-level on multi-byte text (`'café' vs 'cafe'` = 2 bytes, 1 char).

### API surface

`crates/levenshtein/src/lib.rs` exports three functions plus an options struct:

- `fn get(a: String, b: String, options: Option<LevenshteinOptions>) -> u32` — fast-levenshtein-compatible (`src/lib.rs:36`).
- `fn distance(a: String, b: String, options: Option<LevenshteinOptions>) -> u32` — alias (`src/lib.rs:43`).
- `fn distance_batch(a_list: Vec<String>, b_list: Vec<String>, options: Option<LevenshteinOptions>) -> Vec<u32>` — batch, Vec output (`src/lib.rs:53`).
- `LevenshteinOptions { use_collator: Option<bool> }` — lowercases both inputs via `to_lowercase()`, allocating twice.

Algorithm-selection at `src/lib.rs:22`: `triple_accel::levenshtein` for inputs ≥ 16 bytes, `strsim::levenshtein` below. Threshold is hardcoded, never benchmarked.

### Bundle / binary size

Workspace release profile (`Cargo.toml:[profile.release]`) already applies `lto = true`, `codegen-units = 1`, `strip = "symbols"`, `panic = "abort"`. Default features on both `triple_accel` and `strsim` — no runtime-feature pruning tried but marginal here.

### FFI-overhead baseline

`docs/BASELINE.md` is present and measured. Key per-call numbers from that baseline:

- NAPI floor: **109 ns** (`noop()`).
- String crossing: **~0,35 ns/byte** (100 KB echoString → 34,7 µs).
- Buffer crossing: **~180 ns flat** (10 MB still 180 ns — V8 handle, no copy).
- `Vec<u32>` output: **~43 ns/element** (1000 elements → 43,4 µs).

Applied to a 10k-char levenshtein call: 2 × 10.000 × 0,35 ns = **7 µs just in input conversion**. The Rust-side SIMD DP is ~20 µs. Total ~27 µs. `fast-levenshtein` measures ~32 µs directly in V8 — at this size the conversion tax alone eats our entire algorithmic lead.

## Phase-C optimization checklist

| # | Lever | Applicable | Notes |
|---|---|---|---|
| C.1 | Input-type minimization (`String` → `&str`, `Vec<T>` → `&[T]`, Buffer-overload) | **applicable, untried** | `Uint16Array` overload (V8-string code units, zero-copy crossing ~180 ns flat). Rust side operates on `&[u16]`. Avoids UTF-16 → UTF-8 conversion entirely. Expected flip to ≥1,5× faster at 10k chars if algorithmic DP stays at ~20 µs. Caller must build the Uint16Array once; amortizes heavily in dictionary-search loops. |
| C.2 | Output-type minimization (`String` → `&str`, `Vec<T>` → Buffer) | **applicable, untried** | `distance_batch` returns `Vec<u32>` (43 ns/elem). Packed `Buffer` of u32 LE cuts output marshalling from 43 µs to 180 ns flat on 1000-item batches. `crates/xxhash/src/lib.rs:40–80` is the reference for the pattern. |
| C.3 | Batch API | **exists but unbenched & miscosted** | `distance_batch` ships but output-type bug (C.2) negates batching benefit. No bench entry exercises it. |
| C.4 | Stateful API (reusable setup via NAPI class) | **not applicable** | Edit distance has no reusable per-query state (unlike regex compile or JWT key). Both strings must be fully present at call time. |
| C.5 | Parallelization (rayon over large inputs) | **not applicable at current sizes** | FFI dominates below ~100k chars; rayon overhead would erase wins. Only relevant if a single-pair call crossed ~1 MB strings, which isn't the use case. |
| C.6 | Algorithm swap (SIMD variant, streaming parser, etc.) | **applicable, untried** | Myers bit-parallel algorithm fits a DP column in a u64 register — 10–20× faster than scalar DP for strings ≤ 64 chars. Addresses the 0,52× regression at 10 chars where `strsim` fallback currently runs. Hand-port is ~30 lines, or use the `distance` crate. |
| C.7 | Allocator tuning (arena, caller-provided output buffer) | **marginal** | `to_lowercase()` in `src/lib.rs:15–18` allocates two owned strings per call when collator is on. Inline-lowercasing during DP would save the allocation, but impact is small (<1 µs). |
| C.8 | Bundle-size (LTO, features, panic=abort, strip) | **already done** | Workspace profile already applies all four. No further win available. |

Additional lever not in the standard table:

- **Bounded-distance API** (`distance_bounded(a, b, max) -> Option<u32>`): early-terminate when DP diagonal exceeds `max`. O(k·n) instead of O(n²) for small k. Common real-world shape ("distance ≤ 3?"). Could credibly win >10× on dictionary-search loads even with String input, because JS competitors also have to compute full distance.

## Action plan

**Default path: Phase-D (deprecation stands).** The 0.2.0 deprecation message and `deprecated: true` in `docs/packages.json` are correct given measured evidence. Three-month window continues; archive after expiry.

**Override path: Phase-C spike (1–2 days) before final archival.** The post-mortem records "What was tried: None." — we should not archive a Red without having measured at least one of the untried levers. Recommended spike:

1. Add `distance_u16(a: Uint16Array, b: Uint16Array) -> u32` to `src/lib.rs`. Port the inner DP from byte-slice to u16-slice (triple_accel internals are generic enough to fork, or hand-roll banded DP — ~60 lines).
2. Add bench entries for the new API at the same 4 size tiers, plus the asymmetric (10 × 500, 100 × 5000) dictionary-lookup shape that's missing today.
3. **Gate:** if the 10k-char case flips to ≥1,5× faster than `fast-levenshtein`, reclassify to Yellow and un-deprecate with README guidance: *"Use `distanceU16` for hot loops; String API remains deprecated."* If it doesn't flip, append the anti-result to `docs/post-mortems/levenshtein.md` and proceed with archival.
4. **Stretch goals** if the spike succeeds: (a) packed-Buffer output for `distance_batch` per C.2, (b) `distance_bounded` API for early-termination, (c) Myers bit-parallel for ≤ 64 chars per C.6. Combined, these could plausibly push the package into Green territory for the dictionary-search use case.

Either way, add the asymmetric-sizes and batch-API benches **first** — the existing bench grid understates the shape that matters most.

## References

- Crate: `crates/levenshtein`
- Bench: `crates/levenshtein/__bench__/index.bench.ts`
- Lib: `crates/levenshtein/src/lib.rs`
- Cargo: `crates/levenshtein/Cargo.toml`
- `docs/packages.json` speedup field: `up to 1.7× faster / 4.6× slower`
- Post-mortem: `docs/post-mortems/levenshtein.md`
- FFI baseline: `docs/BASELINE.md`
- Reference pattern for C.2: `crates/xxhash/src/lib.rs:40–80`
