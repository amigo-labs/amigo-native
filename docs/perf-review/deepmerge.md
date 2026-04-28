# Perf-Review: `@amigo-labs/deepmerge`

> **Status:** 🟢 Green · **Reviewed:** 2026-04-21 · **Version:** 0.1.0

## Verdict

**3.38×–5.55× vs. `deepmerge` npm** across all three scenarios (flat / deep / large-arrays). One of the more surprising Green verdicts in the portfolio — deepmerge looks superficially like a `deep-equal` antipattern (two JS objects in, one JS object out), but the object traversal + allocation work is significantly faster in Rust than V8's object-prototype walking, even after FFI overhead from `serde_json::Value` marshalling.

## Classification rationale

1. **Object allocation is the real bottleneck in JS.** V8 allocates every `{...}` spread copy as a new shape descriptor. Deeply-nested objects trigger hidden-class transitions per level. Rust `serde_json::Map` is a flat HashMap-backed structure — insert cost is constant.
2. **Array-concat scaling** (1000 items) is the biggest win (4.91×). deepmerge-npm calls `Array.prototype.concat` in a loop over keys = repeated array allocation.
3. **FFI transport is the cost driver, but amortised.** We marshal two JS objects in via `serde_json::Value` and one out. That's `Vec<Object>`-style FFI cost (see `docs/post-mortems/xml.md`), but once per call — Rust merge work dominates.
4. **Prototype-pollution protection as a side-effect.** Rust-side `__proto__` / `constructor` / `prototype` filtering is security-relevant and a recurring CVE target in deepmerge-npm.

## Evidence

### Measured speedup (docs/data.json, 2026-04-18)

| Scenario | @amigo-labs/deepmerge | deepmerge npm | Speedup |
|---|---:|---:|---:|
| flat 4-key objects | 3 353 331 Hz | 992 663 Hz | **3.38×** |
| deep (10 levels) | 210 618 Hz | 37 983 Hz | **5.55×** |
| 1000-item arrays | 3 564 Hz | 725 Hz | **4.91×** |

### Realistic use case

**Config merging** — CLI defaults + user config + project config + env overrides. Typical object size: 5–50 keys, 2–5 levels deep. Called multiple times per process start. Second use case: **deep clone via `merge(target={}, source)`** — idiomatic in Vue / React state management and vanilla JS.

### Benchmark gaps

- **`mergeAll` path** (variadic merge) not benched. The API exposes `merge_all_json(values: Vec<Value>)` but no bench slot.
- **Extreme-deep (50+ levels) not tested.** Mostly artificial, but testable for stack depth.
- **Rich-type handling** (Date, RegExp via JS wrapper) not in the perf bench (it's a `__conformance__` topic).

### API surface

```rust
#[napi] fn merge_json(target: Value, source: Value, options: Option<DeepmergeOptions>) -> Value
#[napi] fn merge_all_json(values: Vec<Value>, options: Option<DeepmergeOptions>) -> Value
```

- `Value` = `serde_json::Value` — objects / arrays / primitives. Rich types (Date, RegExp, Map, Set) are intercepted in the JS wrapper layer (documented in the README).
- `DeepmergeOptions.array_merge`: `'concat'` (default) or `'overwrite'`.
- Prototype-pollution filter is hard-built-in: `FORBIDDEN = ["__proto__", "constructor", "prototype"]` are ignored during merge.

### Bundle / binary size

`serde_json` is the only notable dep. ~400–600 KB per target.

### FFI-overhead baseline

- Flat 4-key object: 2× input marshalling + 1× output ≈ 1–3 µs on 100-byte objects. On 300 ns of Rust merge work = ~5×. But the JS equivalent (deepmerge-npm) itself takes ~1 µs for the same objects. Net: 3.38× win.
- Deep 10-level: input ~2 KB JSON + output ~2 KB. FFI ~10 µs on ~5 ms of Rust work = 0.2 %. Rust dominates.
- 1000-array: input 2× 8 KB, output 16 KB. FFI ~50 µs on 300 µs Rust. ~17 %. Borderline, but the 4.91× margin holds.

## Phase-C optimization checklist

| # | Lever | Applicable | Notes |
|---|---|---|---|
| C.1 | Input-type minimisation (Buffer instead of Value?) | ❌ not applicable | User API is JS object native; a Buffer overload would mean JSON.stringify on the caller side — that just shifts the work |
| C.2 | Output-type minimisation | ❌ not applicable | — |
| C.3 | Batch API (`merge_all_json`) | ✅ already done | Exposed, not benched but the API exists |
| C.4 | Stateful API | ❌ not applicable | — |
| C.5 | Parallelisation | ❌ not applicable | Merge is sequential |
| C.6 | Algorithm swap (simd-json instead of serde_json) | 🟡 potential | `simd-json` for input parse would lower the FFI share, but parsing already happens V8-side (NAPI hands us a deserialised `Value`). Not directly applicable. |
| C.7 | Allocator tuning (bumpalo for merge allocs) | 🟡 marginal | `serde_json::Map` is BTreeMap-backed. Swapping in a bump arena would speed up merge intermediates. Unknown gain. |
| C.8 | Bundle size | ✅ already done | Workspace profile |

## Action plan

**Keep-as-is.** Green across every scenario, no open front.

Maintenance:

1. **Add a `mergeAll` bench** — API exposed but not measured.
2. **Document rich-type wrapper tests** (Date / RegExp in the JS layer) — partially in the README, but edge cases could be expanded.
3. **bumpalo spike as fast-follow** if size regressions appear in later Node versions.

## References

- Crate: `crates/deepmerge`
- Bench: `crates/deepmerge/__bench__/index.bench.ts`
- Lib: `crates/deepmerge/src/lib.rs`
- Cargo: `crates/deepmerge/Cargo.toml`
- `docs/packages.json` speedup: `"3.4–5.5× faster"`
