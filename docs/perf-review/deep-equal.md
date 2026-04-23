# Perf review: `@amigo-labs/deep-equal`

> **Status:** 🔴 Red (confirmed) · **Reviewed:** 2026-04-19 · **Version:** 0.2.0 (deprecated)

## Verdict

Re-review confirms the deprecation decision from 0.2.0: there is structurally no lever to beat `fast-deep-equal` with a NAPI binding — the Phase C list is completely inapplicable.

## Classification rationale

Three things make the case clear:

1. **The published "1.3× faster" number doesn't come from the Rust code at all.** `wrapper.js` exports a pure-JS `equal` function by default (lines 9–61) — `native.deepEqualJson` is only an opt-in export for plain-JSON inputs and doesn't appear in the default path. The benches in `__bench__/index.bench.ts` import the default export, so they measure V8 vs. V8. The Rust crate simply isn't involved in the measured hot path.

2. **The FFI baseline structurally excludes every Rust route.** `BASELINE.md` shows: every NAPI call costs at least 109 ns (floor), `serde_json::Value` marshalling of an object with N properties additionally pays the `Vec<T>` element toll of ~43 ns per property. A 7-key object therefore lands at ≥400 ns *before* the first comparison — `fast-deep-equal` is through the whole thing for the same input at ~680 ns. There is no comparison algorithm that can compensate for the FFI portion.

3. **The alternative is V8 JIT code.** `fast-deep-equal` is ~32 lines of monomorphic JS that V8 inline-caches and translates into a handful of machine instructions. Recursive property walk is exactly the workload V8 has been optimizing for a decade. No Rust port with `napi::JsObject::get_named_property` (one FFI hop per property) can match that.

## Evidence

### Measured speedup (from docs/data.json)

| Scenario | `@amigo-labs/deep-equal` (JS wrapper) | `fast-deep-equal` | Ratio |
|---|---:|---:|---:|
| flat 7-key objects | 1,909,263 ops/s | 1,468,804 ops/s | 1.30× |
| deeply nested (20 levels) | 334,890 ops/s | 316,431 ops/s | 1.06× |
| 10k objects in array | 240 ops/s | 236 ops/s | 1.02× |

To put it in context: those are **JS vs. JS** numbers, not Rust vs. JS. Native is never called in `amigoEqual(a, b)`.

### Realistic use-case

Deep-equal calls in practice are short and frequent: React memo comparisons, Redux selector caches, Jest matchers, request diffs. Median ~5–50 properties, high call frequency, no amortization of a setup phase. That's exactly the "tiny work per call, many calls" FFI trap from the post-mortems (mime, dotenv, shallow-clone).

### Benchmark gaps

None relevant for the deprecation decision — the three measured size buckets cover the realistic cases, and all three are ≤1.3× or parity. An additional measurement of the actual `native.deepEqualJson` path against `fast-deep-equal` would show the gap even more clearly, but isn't needed — the FFI baseline already answers it up front.

### API surface

`deep_equal_json(a: Value, b: Value) -> bool` in `src/lib.rs:39`. Two `serde_json::Value` inputs (owned), bool output. The signature is *already* as lean as it can be for NAPI — further input trimming isn't possible without losing the semantics.

### Bundle / binary size

Not the bottleneck. `wrapper.js` lazy-loads the native binary, but the full payload incl. prebuilds is larger than `fast-deep-equal`'s 32-line source. In the "Rust loses already at the floor" scenario, that's just another disadvantage, not the main reason.

### FFI-overhead baseline

`BASELINE.md`:
- Floor: 109 ns/call.
- `sumArray(Vec<u32>)` (closest proxy for property marshalling): 43 ns per element.
- `echoBuffer` stays at ~180 ns even for 10 MB — **but** deep-equal has no buffer-input path, because object identity cannot be reconstructed from bytes (reference cycles, shared refs, NaN semantics, typed arrays, Map/Set).

## Phase C optimization checklist

| # | Lever | Applicable | Notes |
|---|---|---|---|
| C.1 | Input-type minimization (`String` → `&str`, `Vec<T>` → `&[T]`, buffer overload) | ❌ not applicable | `Value` is already the leanest JSON input type. A buffer overload would mean JS would have to canonical-serialize before the call — that alone costs more than fast-deep-equal in total. |
| C.2 | Output-type minimization (`String` → `&str`, `Vec<T>` → Buffer) | ❌ not applicable | Output is `bool`, not optimizable. |
| C.3 | Batch API | ❌ not applicable | Real-world callers invoke one pair per memo/selector tick. `deepEqualMany(pairs)` would only build the (missing) callsites for a synthetic gain. |
| C.4 | Stateful API (reusable setup via NAPI class) | ❌ not applicable | There's no reusable setup step between two ad-hoc values. A "canonicalize-once, compare-many" API would be a different product (hashing/fingerprint) and doesn't solve the semantic problem — NaN, RegExp, Map/Set are not canonicalizable. |
| C.5 | Parallelization (rayon over large inputs) | ❌ not applicable | The 10k array bench shows: both implementations are at ~240 ops/s. The bottleneck is **marshalling**, not compare. Rayon parallelizes the compare — the marshalling phase runs before it and serially. Zero gain. |
| C.6 | Algorithm swap (SIMD / streaming / faster crate) | ❌ not applicable | The algorithm is already trivially optimal (O(n), one pass, early-exit on mismatch). There is no faster structural equality — V8 JIT code beats generated Rust compares over an object graph because it doesn't have the NAPI indirection. |
| C.7 | Allocator tuning (arena, caller-provided output buffer) | ❌ not applicable | `serde_json::Value` doesn't allocate in a hot-path-relevant way — the cost sits in the NAPI bridge code, which is outside our control. |
| C.8 | Bundle size (LTO, features, panic=abort, strip) | ❌ not applicable | The workspace already has those flags set. And bundle size is not the reason for Red here. |

**Zero out of eight** — that's the signal. When the full lever list is non-applicable, the implementation isn't the problem, the package's fit is.

## Action plan

**Plan: continue deprecation, don't revise.**

1. **No optimization-sprint investment.** The Phase C analysis confirms: there is no realistic lever. Every hour invested lands in the one window the FFI floor already closes.
2. **Leave the deprecation schedule unchanged:**
   - 0.2.0 (shipped): `deprecated` field in `package.json`, README warning, `MIGRATION.md` points to `fast-deep-equal` and `fast-deep-equal/es6`. ✅ done.
   - Keep the window open until ~2026-07 so callers can migrate.
   - Then: move to `archived/deep-equal/`, CI skips the crate.
3. **Drop the `docs/packages.json` entries.** The "up to 1.3× faster" number is misleading — it belongs to the JS wrapper, not the Rust crate. Recommendation: remove the entry from the registry at the archive move, so it doesn't slip into the marketing section of the landing page. (The skill only writes this down here — the edit is up to the user.)
4. **Keep the post-mortem as a learning entry.** `docs/post-mortems/deep-equal.md` is good and keeps being cited as a negative reference pattern ("FFI trap shape: tiny-work-per-call, property-walking APIs") for future candidate reviews.

**What we shouldn't do:** open the crate again to give `deepEqualJson` a different algorithm. The question is answered — the algorithm isn't too slow, the call shape is wrong.

## References

- Crate: `crates/deep-equal`
- Bench: `crates/deep-equal/__bench__/index.bench.ts`
- Lib: `crates/deep-equal/src/lib.rs`
- Cargo: `crates/deep-equal/Cargo.toml`
- Wrapper: `crates/deep-equal/wrapper.js` (default export = pure JS!)
- Post-mortem: `docs/post-mortems/deep-equal.md`
- FFI baseline: `docs/BASELINE.md`
- `docs/packages.json` speedup field: `"up to 1.3× faster"` (note: measures the JS wrapper, not the Rust crate)
