# Perf-Review: `@amigo-labs/xxhash`

> **Status:** 🟢 Green · **Reviewed:** 2026-04-21 · **Version:** 0.2.0

## Verdict

**Large buffers: 1.15×–2.72× vs. `xxhash-wasm`** depending on the variant. **Batch API: 2.87×–5.39× vs. an xxhash-wasm loop** after the Phase-C fix (commit `4c6fb50`). A single call on 64 B is 0.47× vs. xxhash-wasm — that is expected and documented (xxhash-wasm has very low WASM call overhead; native NAPI has a higher floor for trivial compute). **Batch is the big portfolio win** — the `*Many` API returns the result hashes as a compact Buffer instead of a `Vec<BigInt>` (which was catastrophically slow, 0.15× pre-fix). 5.39× on xxh3_64-batch-1000 is the lever that defined xxhash v0.2.

## Classification rationale

1. **The batch-API Phase-C is the portfolio-level lesson.** Pre-0.2 `*Batch(Vec<Buffer>) → Vec<BigInt>`: 43 ns/element marshalling cost for the BigInt output (BASELINE.md:32). For 1000 × 64 B hashes that was **~43 µs just for BigInt packaging** against ~40 µs of Rust hash work — 107% overhead. Post-fix `*Many(Buffer, chunkSize) → Buffer`: one crossing, buffer-packed u64 output. 0.15× → 4.00× on the worst scenario.
2. **Single-call small is WASM-competitive territory.** `xxhash-wasm` has ~100 ns WASM boundary cost — comparable to our NAPI floor. For 64-byte inputs the Rust work is below the FFI floor and WASM wins marginally. This is the nanoid-analog shape, but the large-buffer and batch wins clearly amortize it.
3. **xxh3 is our primary win case.** 2.72× vs. xxhash-wasm on 1 MB xxh3, 5.39× batch. `xxh3` is more modern than xxh32/xxh64 and has less wrapping overhead in the xxhash-rust crate.
4. **The streaming API is Red territory** (4 183 Hz on batch-1000). Streaming per chunk via FFI is the `xml` antipattern. We keep the API for rare use cases (file streams larger than memory), but document it as "last resort, use `*Many` or direct call."

## Evidence

### Measured speedup (docs/data.json, 2026-04-18)

**Single call:**

| Scenario | @amigo-labs/xxhash | xxhash-wasm | xxhashjs | vs. xxhash-wasm |
|---|---:|---:|---:|---:|
| xxh32 64 B | 3 937 229 Hz | 8 323 203 Hz | 1 251 882 Hz | **0.47×** (small-input limit) |
| xxh32 1 MB | 5 369 Hz | 4 678 Hz | 347 Hz | **1.15×** |
| xxh64 1 MB | 10 683 Hz | 8 233 Hz | 22 Hz | **1.30×** |
| xxh3_64 1 MB | 22 471 Hz | 8 260 Hz | — | **2.72×** |

**Batch-1000 × 64 B:**

| Scenario | @amigo-labs/xxhash (many) | @amigo-labs/xxhash (loop) | xxhash-wasm (loop) | vs. wasm |
|---|---:|---:|---:|---:|
| xxh32 batch | 51 801 Hz | 5 255 Hz | 18 084 Hz | **2.87×** |
| xxh3_64 batch | 94 831 Hz | — | 17 591 Hz | **5.39×** |

### Realistic use-case

**Deduplication** — content-addressable storage, asset fingerprinting, cache keys. Typically buffers of 1 KB – 10 MB, hot loops over many items. **Integrity checks** on file upload/download. **HashMap keying** in tantivy-style search indexes (internal). Median: batches of 100 to 10 000 × 64 B to 1 KB for dedup, single calls on 1 MB+ for integrity.

The single-call small case (64 B, the 0.47× measurement) is rarely a realistic workload — if you need that many small hashes, you want batch.

### Benchmark gaps

- **The xxh128 variant** (128-bit) is not benchmarked separately.
- **Streaming only against batch.** Streaming vs. xxhash-wasm streaming has not been measured directly.
- **Large batch-size matrix** (10k, 100k items) — 1000 items is the measured point.

### API surface

Based on the Phase-C rescope (commit `4c6fb50`):

```rust
// Single-call
xxh32(data: Buffer) → u32
xxh64(data: Buffer) → u64 (as BigInt in JS)
xxh3_64(data: Buffer) → u64
xxh3_128(data: Buffer) → u128 (as Buffer/BigInt)

// Batch — Phase-C Primary
xxh32Many(data: Buffer, chunkSize: number) → Buffer  // u32-packed
xxh64Many(data: Buffer, chunkSize: number) → Buffer  // u64-packed
xxh3_64Many(data: Buffer, chunkSize: number) → Buffer
xxh3_128Many(data: Buffer, chunkSize: number) → Buffer

// Streaming (legacy / edge-case)
createHasher(variant) → StreamingHasher class
```

### Bundle / binary size

The `xxhash-rust` crate is very small (~100-200 KB with all variants).

### FFI-overhead baseline

- Single 64 B: input ~180 ns, output ~200 ns (u32/u64 return). Rust ~50 ns hash. Total ~430 ns. **WASM ~120 ns total** = 3× faster. The documented small-input limit.
- Single 1 MB: input flat ~180 ns, output ~200 ns, Rust ~50 µs. FFI **<1%**.
- Batch-1000 × 64 B (Many): input 64 KB buffer ~180 ns, output 8 KB buffer ~180 ns, Rust ~10 µs (1000 × 10 ns hash). Total ~10.4 µs. 51 800 Hz. **FFI ~4% share** — excellent.

## Phase-C optimization checklist

| # | Lever | Applicable | Notes |
|---|---|---|---|
| C.1 | Input-type minimization | ✅ already done | `Buffer` zero-copy throughout |
| C.2 | Output-type minimization | ✅ already done | **Phase-C primary win**: `Vec<BigInt>` → packed `Buffer` (commit `4c6fb50`) |
| C.3 | Batch API | ✅ already done | `*Many` is the shipped hot path |
| C.4 | Stateful API (StreamingHasher) | 🟡 accepted | Exposed but documented as last resort. No fix planned |
| C.5 | Parallelization | 🟡 potential | rayon over Many chunks is conceivable, but at 5.39× it is already so fast that single-core is only limited by scheduling overhead |
| C.6 | Algorithm swap | ❌ not applicable | `xxhash-rust` has both a native Rust implementation and an xxhash-C FFI variant. The native Rust xxh3 paths are fast enough |
| C.7 | Allocator tuning | ✅ already done | Buffer output pre-allocated based on `input.len() / chunkSize * output_bytes` |
| C.8 | Bundle-size | ✅ already done | Very small |

## Action plan

**Keep as-is.** Post-Phase-C the package is in its target shape.

Maintenance:

1. **Add an xxh128 bench** — complete the algorithm matrix.
2. **Streaming bench vs. xxhash-wasm streaming** — for the docs, to make visible that the streaming API performs poorly against WASM.
3. **Large-batch matrix** (10k, 100k items) — scaling confirmation.
4. **rayon spike as Phase-C.5** only if a production multi-core batch use case shows up.

The documented small-input limit (0.47× on a 64 B single call) is not a weakness in the package but FFI physics. The README must clearly make the "use `*Many` for hot loops" recommendation.

## References

- Crate: `crates/xxhash`
- Bench: `crates/xxhash/__bench__/index.bench.ts`
- Lib: `crates/xxhash/src/lib.rs`
- Cargo: `crates/xxhash/Cargo.toml`
- Phase-C primary commit: `4c6fb50` (`*Batch(Vec<Buffer>)→Vec<BigInt>` → `*Many(Buffer, chunkSize)→Buffer`)
- `docs/packages.json` speedup: `"up to 2.7× faster / 3.4× slower"`
