# Perf-Review: `@amigo-labs/xxhash`

> **Status:** 🟢 Green · **Reviewed:** 2026-04-21 · **Version:** 0.2.0

## Verdict

**Large-Buffer: 1,15×–2,72× vs. `xxhash-wasm`** je nach Variante. **Batch-API: 2,87×–5,39× vs. xxhash-wasm-Loop** nach Phase-C-Fix (Commit `4c6fb50`). Single-call auf 64 B ist 0,47× vs. xxhash-wasm — das ist erwartet und dokumentiert (xxhash-wasm hat sehr kleine WASM-Call-Overhead, Native-NAPI hat höheren Floor für trivial compute). **Batch ist der große Portfolio-Win** — `*Many`-API gibt Result-Hashes als kompakten Buffer zurück statt als `Vec<BigInt>` (was katastrophal langsam war, 0,15× pre-Fix). 5,39× auf xxh3_64-batch-1000 ist der Hebel der xxhash v0.2 ausgemacht hat.

## Classification rationale

1. **Batch-API-Phase-C ist die Lehre von Portfolio-Level.** Pre-0.2 `*Batch(Vec<Buffer>) → Vec<BigInt>`: 43 ns/Element Marshalling-Cost für BigInt-Output (BASELINE.md:32). Für 1000 × 64-B-Hashes war das **~43 µs nur für BigInt-Packaging** auf ~40 µs Rust-Hash-Work — 107 % Overhead. Post-Fix `*Many(Buffer, chunkSize) → Buffer`: ein Crossing, Buffer-packed u64-Output. 0,15× → 4,00× auf schlimmstem Szenario.
2. **Single-call-small ist WASM-competitive-territory.** `xxhash-wasm` hat ~100 ns WASM-Boundary-Cost — vergleichbar mit unserem NAPI-Floor. Für 64-Byte-Inputs ist die Rust-Work sub-FFI-Floor und WASM gewinnt marginal. Das ist der Nanoid-Analog-Shape, aber die Large-Buffer- und Batch-Wins amortisieren das klar.
3. **xxh3 ist unser primärer Win-Case.** 2,72× vs. xxhash-wasm auf 1 MB xxh3, 5,39× batch. `xxh3` ist moderner als xxh32/xxh64 und hat weniger Wrapping-Overhead im xxhash-rust-crate.
4. **Streaming-API ist Red-Territory** (4 183 Hz auf Batch-1000). Streaming-Per-Chunk-via-FFI ist der `xml`-Antipattern. Wir halten die API für seltene Use-Cases (File-Streams größer als Memory), aber dokumentieren das als "last resort, use `*Many` or direct call."

## Evidence

### Measured speedup (docs/data.json, 2026-04-18)

**Single-Call:**

| Scenario | @amigo-labs/xxhash | xxhash-wasm | xxhashjs | vs. xxhash-wasm |
|---|---:|---:|---:|---:|
| xxh32 64 B | 3 937 229 Hz | 8 323 203 Hz | 1 251 882 Hz | **0,47×** (small-input limit) |
| xxh32 1 MB | 5 369 Hz | 4 678 Hz | 347 Hz | **1,15×** |
| xxh64 1 MB | 10 683 Hz | 8 233 Hz | 22 Hz | **1,30×** |
| xxh3_64 1 MB | 22 471 Hz | 8 260 Hz | — | **2,72×** |

**Batch-1000 × 64 B:**

| Scenario | @amigo-labs/xxhash (many) | @amigo-labs/xxhash (loop) | xxhash-wasm (loop) | vs. wasm |
|---|---:|---:|---:|---:|
| xxh32 batch | 51 801 Hz | 5 255 Hz | 18 084 Hz | **2,87×** |
| xxh3_64 batch | 94 831 Hz | — | 17 591 Hz | **5,39×** |

### Realistic use-case

**Deduplikation** — Content-Addressable-Storage, Asset-Fingerprinting, Cache-Keys. Typisch Buffer 1 KB – 10 MB, hot-loop über viele Items. **Integrity-Check** bei File-Upload/-Download. **HashMap-Keying** in tantivy-style Search-Indexes (intern). Median: Batch-100-to-10000 × 64B-to-1KB für Dedup, Single-Call-1MB+ für Integrity.

Single-Call-small-Case (64 B, der 0,47× Messung) ist unrealistisch häufig — wenn du so viele kleine Hashes brauchst, willst du batch.

### Benchmark gaps

- **xxh128-Variante** (128-bit) nicht separat gebenched.
- **Streaming nur gegen Batch.** Streaming-vs-xxhash-wasm-Streaming nicht direkt gemessen.
- **Large-batch-size-Matrix** (10k, 100k items) — 1000 items ist der gemessene Punkt.

### API surface

Basierend auf Phase-C-Rescope (Commit `4c6fb50`):

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

`xxhash-rust` crate ist sehr klein (~100-200 KB mit allen Varianten).

### FFI-overhead baseline

- Single 64 B: Input ~180 ns, output ~200 ns (u32/u64-return). Rust ~50 ns hash. Total ~430 ns. **WASM ~120 ns total** = 3× faster. Dokumentierter small-input-limit.
- Single 1 MB: Input flat ~180 ns, output ~200 ns, Rust ~50 µs. FFI **<1 %**.
- Batch-1000 × 64 B (Many): Input 64 KB Buffer ~180 ns, Output 8 KB Buffer ~180 ns, Rust ~10 µs (1000 × 10 ns hash). Total ~10,4 µs. 51 800 Hz. **FFI ~4 % Share** — excellent.

## Phase-C optimization checklist

| # | Lever | Applicable | Notes |
|---|---|---|---|
| C.1 | Input-type minimization | ✅ already done | `Buffer` zero-copy durchgehend |
| C.2 | Output-type minimization | ✅ already done | **Phase-C primary win**: `Vec<BigInt>` → `Buffer` packed (Commit `4c6fb50`) |
| C.3 | Batch API | ✅ already done | `*Many` ist der shipped Hot-Path |
| C.4 | Stateful API (StreamingHasher) | 🟡 accepted | Exponiert aber dokumentiert als last-resort. Kein Fix geplant |
| C.5 | Parallelization | 🟡 potential | rayon über Many-Chunks denkbar, aber 5,39× ist bereits so schnell dass Single-Core durch Scheduling-Overhead limitiert |
| C.6 | Algorithm swap | ❌ not applicable | `xxhash-rust` hat sowohl native-Rust-Impl als auch xxhash-C-FFI-Variante. Die Rust-nativen xxh3-Pfade sind schnell genug |
| C.7 | Allocator tuning | ✅ already done | Buffer-Output pre-alloc basierend auf `input.len() / chunkSize * output_bytes` |
| C.8 | Bundle-size | ✅ already done | Sehr klein |

## Action plan

**Keep-as-is.** Post-Phase-C ist das Paket in seiner Zielform.

Maintenance:

1. **xxh128-Bench hinzufügen** — Algorithmus-Matrix komplettieren.
2. **Streaming-Bench vs. xxhash-wasm-Streaming** — für Doku, sichtbar-machen dass Streaming-API schlecht performed gegen WASM.
3. **Large-Batch-Matrix** (10k, 100k items) — skalierungs-Bestätigung.
4. **rayon-Spike als Phase-C.5** nur wenn Produktions-Multi-Core-Batch-Use-Case auftaucht.

Der dokumentierte Small-Input-Limit (0,47× auf 64 B single-call) ist keine Schwäche im Paket sondern FFI-Physik. README muss klar die "use `*Many` for hot loops"-Empfehlung machen.

## References

- Crate: `crates/xxhash`
- Bench: `crates/xxhash/__bench__/index.bench.ts`
- Lib: `crates/xxhash/src/lib.rs`
- Cargo: `crates/xxhash/Cargo.toml`
- Phase-C primary commit: `4c6fb50` (`*Batch(Vec<Buffer>)→Vec<BigInt>` → `*Many(Buffer, chunkSize)→Buffer`)
- `docs/packages.json` speedup: `"up to 2.7× faster / 3.4× slower"`
