# Perf-Review: `@amigo-labs/argon2`

> **Status:** 🟡 Yellow · **Reviewed:** 2026-04-21 · **Version:** 0.1.0 ·
> **Targets:** `node` (Node.js server-only group)

## WASM-target exclusion

`argon2` is part of the **Node.js server-only tier** documented in
[`docs/specs/expansion-2026.md`](../specs/expansion-2026.md#nodejs-server-only-tier).
It does not ship a WASM binding, deliberately:

- **Performance:** Argon2 is memory-hard by design (default 64 MiB, t=3,
  p=4). WASM is ~2× slower than native for the inner blake2b loop, so
  the same security target costs roughly twice the CPU budget per hash.
- **Threat model:** Client-side password hashing is an anti-pattern.
  Salts and hashes belong on the server. There is no use case for
  shipping the algorithm to the browser that improves on simply sending
  the password over TLS to a server endpoint.

If a concrete edge/serverless use case appears, revisit. Until then this
package stays napi-only with `targets: ["node"]` in the registry.



## Verdict

CPU-bound password hashing — **1.37× vs. upstream `argon2` (C bindings via node-gyp)**, **2.33× vs. `hash-wasm` WASM build**. Upstream is already natively compiled (argon2-C via node-gyp), so this margin represents the entire Phase-C/D ceiling for this package: the algorithm is the Argon2-2015 spec, both sides drive `blake2b` core loops over the same algorithm — no order-of-magnitude headroom is available. Keep-as-is; no optimization sprint in sight that would clear measurement noise.

## Classification rationale

Argon2 is the definitive **algorithm-ceiling-bound** case in the portfolio:

1. **Upstream is also native.** The `argon2` npm package is `node-gyp`-compiled C bindings to libargon2. We're pitting Rust-native against C-native on the same spec. The inner loop is `blake2b` compress over 128-byte blocks, identically vectorised on both sides.
2. **The default config is deliberately slow.** Memory cost 64 MiB, time cost 3, parallelism 4 — Argon2 is meant to take 100–500 ms per hash. FFI floor (109 ns) vs. 300 ms compute = **0.00004 %** share. No FFI lever to pull.
3. **hash-wasm is the real alternative.** A 2.33× speedup vs. WASM builds justifies the package portfolio-wide. WASM has ~1.5× overhead per blake2b round vs. native.
4. **Yellow rather than Green** because the 1.37× margin against the primary drop-in alternative (`argon2` npm) sits below the 2× gate. Not Red, because the margin is unambiguously positive and the WASM case is Green.

## Evidence

### Measured speedup (docs/data.json, 2026-04-18)

| Scenario | @amigo-labs/argon2 | argon2 (npm, C) | hash-wasm | vs. argon2 | vs. hash-wasm |
|---|---:|---:|---:|---:|---:|
| hash (low-cost params) | 320.93 Hz | 234.39 Hz | 137.48 Hz | **1.37×** | **2.33×** |
| verify | 321.38 Hz | — | — | (baseline) | — |

### Realistic use case

Password hashing in authentication flows. One hash operation per user registration / login, not a hot loop. Default params (memory=64 MiB, time=3, parallelism=4) ≈ 300 ms. Server-side, not latency-critical below the default-cost configuration. The async API (`hash()` returns an `AsyncTask`) keeps the event loop free — that's the actual value vs. sync-only upstream.

### Benchmark gaps

- **Verify cross-bench is missing.** Only `@amigo-labs/argon2.verify_sync` is benched — no numbers vs. `argon2.verify` npm. Catch up before v0.2.
- **High-cost params not tested.** `memory=256 MiB, time=10` (paranoid server config) would clarify the CPU margin. Expected ≈1.3× there because blake2b dominates.
- **Async path not directly measured** (only sync in the bench). The async overhead is `AsyncTask` = thread hop + join — sub-millisecond, negligible against 300 ms compute.

### API surface

```rust
#[napi] fn hash_sync(password: String, options: Option<Argon2Options>) -> Result<String>
#[napi] fn hash(password: String, options: Option<Argon2Options>) -> AsyncTask<HashTask>
#[napi] fn verify_sync(hash: String, password: String) -> Result<bool>
#[napi] fn verify(hash: String, password: String) -> AsyncTask<VerifyTask>
```

- Inputs: `String` (password) and `Option<Argon2Options>` (memory_cost, time_cost, parallelism, output_len). Output: PHC string.
- The `AsyncTask` variant is the default hot path — offloaded to the worker pool.
- No stateful class. No callback boundary. Clean.

### Bundle / binary size

The `sizes` field in `docs/data.json` for argon2 is roughly portfolio-median (600–800 KB per target). `argon2 = { version = "0.5", features = ["std"] }` is compact, no SIMD features.

### FFI overhead baseline

Irrelevant — 300 ms of compute per call absorbs every FFI boundary. Reference: `docs/BASELINE.md:24` (noop = 109 ns).

## Phase-C optimization checklist

| # | Lever | Applicable | Notes |
|---|---|---|---|
| C.1 | Input-type minimisation (`String` → `&str`, `Buffer` overload) | ❌ not applicable | Password is string-native; FFI share <0.001 % |
| C.2 | Output-type minimisation | ❌ not applicable | Output is a short PHC string |
| C.3 | Batch API | ❌ not applicable | Nobody hashes passwords in batches — use-case mismatch |
| C.4 | Stateful API (NAPI class with reused Argon2 config) | 🟡 marginal | `build_argon2()` costs sub-µs; reuse doesn't pay |
| C.5 | Parallelisation (rayon over multiple inputs) | ❌ not applicable | Argon2 is itself internally parallelised (`parallelism=4`) |
| C.6 | Algorithm swap (SIMD blake2b) | 🟡 **potential**, uncertain | The `blake2b_simd` crate has AVX2/NEON variants. `argon2` v0.5 uses the `blake2b` crate (scalar default). Upgrading to the SIMD variant could buy 10–20 % — not enough for a Green upgrade, but measurable. |
| C.7 | Allocator tuning | ❌ not applicable | Argon2 memory allocation is user-controlled via `memory_cost` |
| C.8 | Bundle size (LTO, features) | ✅ already done | Workspace profile with lto=true, strip=symbols |

## Action plan

**Keep-as-is.** Yellow stays Yellow, algorithmically ceiling-limited. Three small maintenance items:

1. **Add a verify cross-bench** (`argon2.verify` vs. `@amigo-labs/argon2.verify_sync`) — doc hygiene before v0.2.
2. **High-cost-param bench** as a second scenario — sharpens the CPU-vs-FFI story for users running paranoid configs.
3. **`blake2b_simd` spike as fast-follow** (not sprint priority). Expect 1.37× → 1.5–1.6×, still Yellow, but a sign of life for ongoing maintenance.

No Phase-C sprint scheduled. No Phase-D risk (no Red drift conceivable absent a V8 / libargon2 change).

## References

- Crate: `crates/argon2`
- Bench: `crates/argon2/__bench__/index.bench.ts`
- Lib: `crates/argon2/src/lib.rs`
- Cargo: `crates/argon2/Cargo.toml`
- `docs/packages.json` speedup field: `"1.37× faster"`
- Summary row: `docs/perf-review.md` (Yellow, post-sprint table)
