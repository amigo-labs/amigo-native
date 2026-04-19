# Perf-Review: `@amigo-labs/levenshtein`

> **Status:** 🔴 Red (spike measured 2026-04-19, gate failed) · **Version:** 0.2.0 (deprecated → proceeding to archive)

## Verdict

Spiked the one remaining untried lever (`Uint16Array` input to bypass UTF-16 → UTF-8 conversion) and measured the result. **Gate failed**: at 10k chars the Uint16Array path is 6,7× slower than `fast-levenshtein`, not the 1,5× faster required to un-deprecate. The spike additionally disproved the original post-mortem's theory that FFI conversion was the dominant cost — the real bottleneck is that V8-JIT on UTF-16 `charCodeAt` is structurally competitive with scalar Rust DP, and `triple_accel`'s SIMD banded path degenerates for random-string pairs where edit distance approaches n. Deprecation stands; archival proceeds as planned.

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

| # | Lever | Status | Notes |
|---|---|---|---|
| C.1 | Input-type minimization (`String` → `&str`, `Vec<T>` → `&[T]`, Buffer-overload) | **tried, no win** | `distanceU16(Uint16Array, Uint16Array)` spike (2026-04-19) measured slower than the `String`-input path at every symmetric size tier. Reverted. Details below. |
| C.2 | Output-type minimization (`String` → `&str`, `Vec<T>` → Buffer) | **applicable, not pursued** | `distance_batch` still returns `Vec<u32>` (43 ns/elem). Would reduce output marshalling but the per-call compute already loses to `fast-levenshtein`, so a cheaper batch envelope doesn't change the outcome. |
| C.3 | Batch API | **exists but unbenched & miscosted** | `distance_batch` ships. Not worth benching since the per-call arithmetic already fails the gate. |
| C.4 | Stateful API (reusable setup via NAPI class) | **not applicable** | Edit distance has no reusable per-query state. Both strings must be fully present at call time. |
| C.5 | Parallelization (rayon over large inputs) | **not applicable at current sizes** | FFI dominates below ~100k chars; rayon overhead would erase wins. |
| C.6 | Algorithm swap (SIMD variant, streaming parser, etc.) | **not pursued** | Myers bit-parallel would help ≤ 64 chars but the 10-char tier only loses 1,6×, and a faster small-string path doesn't rescue the 6,7× 10k-loss. |
| C.7 | Allocator tuning (arena, caller-provided output buffer) | **marginal** | `to_lowercase()` allocation is <1 µs, irrelevant at this scale. |
| C.8 | Bundle-size (LTO, features, panic=abort, strip) | **already done** | Workspace profile already applies all four. |

## Spike result (2026-04-19)

Added `distanceU16(Uint16Array, Uint16Array) -> u32` with a scalar Wagner-Fischer row-swap DP on `&[u16]` (~30 LOC). Built, unit-tested, benchmarked against the existing `get(String, String)` path and `fast-levenshtein`.

| Scenario | `get(String)` (Hz) | `distanceU16(Uint16Array)` (Hz) | `fast-levenshtein` (Hz) | Gate |
|---|---:|---:|---:|:---:|
| 10 chars | 1.505.530 | 1.282.693 | 2.451.414 | ✗ |
| 100 chars | 271.992 | 53.427 | 195.135 | ✗ |
| 1.000 chars | 966 | 570 | 3.554 | ✗ |
| 10.000 chars | 6,98 | 5,74 | 38,4 | **✗** (gate target) |
| 10 × 500 (asym) | 116.290 | 97.912 | 187.960 | ✗ |
| 100 × 5.000 (asym) | 56,7 | 1.097 | 6.158 | — |

**Gate:** "≥1,5× faster than `fast-levenshtein` at 10k chars." Measured distanceU16 at 10k is **6,7× slower** than `fast-levenshtein`. Gate failed. Spike reverted in the same branch.

**Unexpected finding from the asymmetric row:** `triple_accel`'s SIMD banded path is **19× slower than scalar u16 DP** on 100 × 5.000 (56,7 Hz vs. 1.097 Hz). The adaptive-band expansion hits a pathological case when one input dominates. Documented in the post-mortem but not actionable for the deprecation decision — `fast-levenshtein` still wins this case at 6.158 Hz.

**Why the original theory was wrong:** The post-mortem estimated Rust-core ~20 µs + FFI conversion ~7 µs for 10k chars. Actual measurement is ~143 ms for `get` and ~174 ms for `distanceU16`. The FFI conversion is a tiny fraction of total time; the real cost is that (a) V8-JIT on `charCodeAt` is as fast as scalar Rust on `u16`, and (b) `triple_accel` degenerates for random inputs where distance ≈ n. Neither is fixable without rewriting the DP in SIMD-u16 or replacing the algorithm entirely, and neither justifies un-deprecating a drop-in replacement that users can swap out with a single import change.

## Final action

Proceed with Phase-D per the 0.2.0 plan: three-month deprecation window continues, archive `crates/levenshtein/` after expiry, decrement `PACKAGES` count in `docs/packages.json:33`. The asymmetric benchmarks added during the spike are preserved in git history — the `__bench__/` directory was removed with the archived-bench cleanup, since deprecated packages no longer run benchmarks.

## References

- Crate: `crates/levenshtein`
- Bench: `crates/levenshtein/__bench__/index.bench.ts`
- Lib: `crates/levenshtein/src/lib.rs`
- Cargo: `crates/levenshtein/Cargo.toml`
- `docs/packages.json` speedup field: `up to 1.7× faster / 4.6× slower`
- Post-mortem: `docs/post-mortems/levenshtein.md`
- FFI baseline: `docs/BASELINE.md`
- Reference pattern for C.2: `crates/xxhash/src/lib.rs:40–80`
