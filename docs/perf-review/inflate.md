# Perf-Review: `@amigo-labs/inflate`

> **Status:** 🟡 Yellow (perf-review.md label) / 🟢 Green-likely post-Phase-C (measured) · **Reviewed:** 2026-04-21 · **Version:** 0.1.0

## Verdict

Phase-C `decompress_bulk` + the uninit-output-buffer fix (commit `32d7dfa`) resolved the inflate regression from the original classification (0.46×–0.49× vs. node:zlib). **Current measurements:** inflate 100KB is **1.12× vs. node:zlib** and **5.6× vs. pako**; inflate 10MB is **1.34× vs. node:zlib** and **6.5× vs. pako**. The deflate side is cleanly Green across all sizes (5.5×–7.1× vs. node:zlib, 19×–35× vs. pako). The "Yellow" classification in `perf-review.md` stems from a pre-Phase-C measurement and is no longer current — **propose reclassification to Green**. pako is clearly beaten everywhere; node:zlib remains the tougher baseline for inflate (both use the zlib backend family; against node:zlib >1× is achievable but a 2× gap is not).

## Classification rationale

Inflate has an **asymmetric shape**:

1. **Deflate side: unambiguously Green.** 7.1× vs. node:zlib @ 10 MB is the biggest win in the portfolio after file-type. zlib-rs is a rewrite library with more aggressive optimizations than upstream zlib; deflate benefits the most because LZ77 match search is well suited to SIMD.
2. **Inflate side: Green against pako, marginally Green against node:zlib.** Decompression is more sequential, with less SIMD headroom. node:zlib is itself zlib-C; we are pitting zlib-rs Rust against zlib C. Phase-C `decompress_bulk` + the `set_len` uninit trick recovers the last 30% on 10 MB.
3. **The classification is outdated due to stale measurements.** `docs/perf-review.md:42` says "inflate 0.46×–0.49×" — that stems from pre-Phase-C. Current `docs/data.json` shows 1.12×–1.67× across all size buckets. The label update is still open.

## Evidence

### Measured speedup (docs/data.json, 2026-04-18)

| Scenario | @amigo-labs/inflate | pako | node:zlib | vs. pako | vs. node:zlib |
|---|---:|---:|---:|---:|---:|
| deflate 1KB text | 76 581 Hz | 9 659 Hz | 74 856 Hz | **7.93×** | **1.02×** |
| deflate 100KB text | 26 057 Hz | 994 Hz | 4 703 Hz | **26.2×** | **5.54×** |
| deflate 100KB random | 18 402 Hz | 956 Hz | 4 293 Hz | **19.3×** | **4.29×** |
| deflate 10MB text | 320.9 Hz | 9.27 Hz | 45.28 Hz | **34.6×** | **7.09×** |
| inflate 1KB | 301 966 Hz | 47 776 Hz | 180 771 Hz | **6.32×** | **1.67×** |
| inflate 100KB | 19 867 Hz | 3 525 Hz | 17 765 Hz | **5.64×** | **1.12×** |
| inflate 10MB | 252.0 Hz | 38.96 Hz | 187.7 Hz | **6.47×** | **1.34×** |

### Realistic use-case

**Compression:** HTTP response gzip (server output), asset-pipeline builds (CI), log-file archiving. 100 KB – 10 MB is the median. **Decompression:** HTTP body decompression (client), zip-entry reads (internally via `@amigo-labs/zip`), asset loading. 1 KB – 100 KB median; 10 MB is a batch workload.

Both paths are **Buffer in/Buffer out**, one call per operation, no streaming API in the NAPI surface (streaming would be event-per-chunk → FFI antipattern, see `docs/post-mortems/xml.md`).

### Benchmark gaps

- **Deflate compression-level matrix is missing.** Only `level=6` (default) tested. `level=1` (fast) and `level=9` (max) would show how the margin shifts with the trade-offs.
- **Gzip path (gzip/ungzip) not benchmarked separately.** Only deflate/inflate. Format overhead is minimal (gzip = zlib + ~20 B header/trailer), but a formal measurement makes sense for v0.2.
- **`level=0` (no compression) is missing.** Edge case — zlib in store-only mode. Not a priority.

### API surface

```rust
#[napi] fn deflate(data: Buffer, options: Option<InflateOptions>) -> Result<Buffer>
#[napi] fn inflate(data: Buffer) -> Result<Buffer>
#[napi] fn deflate_raw(data: Buffer, options: Option<InflateOptions>) -> Result<Buffer>
#[napi] fn inflate_raw(data: Buffer) -> Result<Buffer>
#[napi] fn gzip(data: Buffer, options: Option<InflateOptions>) -> Result<Buffer>
#[napi] fn ungzip(data: Buffer) -> Result<Buffer>
```

- Buffer in/Buffer out throughout. Zero-copy transport via V8 buffer handle (BASELINE.md:30 = ~180 ns flat up to 10 MB).
- `InflateOptions { level: Option<u32> }` — compact, everything parameterizable per call.
- No streaming, no callbacks, no stateful objects. Three paths (zlib/raw/gzip) × 2 directions = 6 functions, a flat surface.

### Bundle / binary size

`flate2 = { default-features = false, features = ["zlib-rs"] }` — explicitly only the zlib-rs backend, no libz/miniz/cloudflare-zlib linked. This is a Phase-C commitment (commit `32d7dfa`). Binary presumably 400–700 KB per target (zlib-rs is compact).

### FFI-overhead baseline

- Input buffer 10 MB: ~180 ns transport (flat, V8 handle, `docs/BASELINE.md:30`).
- Output buffer 60 MB (10 MB × 6× expected inflate ratio): ~180 ns return.
- Total FFI: ~360 ns against a typical 4 ms of Rust work for a 10 MB inflate = **0.01% share**. Irrelevant.

## Phase-C optimization checklist

| # | Lever | Applicable | Notes |
|---|---|---|---|
| C.1 | Input-type minimization (`String` → `&str`, `Buffer`) | ✅ already done | `Buffer` throughout, zero-copy in |
| C.2 | Output-type minimization (`Buffer` instead of `Vec<u8>`) | ✅ already done | `Buffer` throughout, plus the `estimated_inflate_size` pre-allocation heuristic |
| C.3 | Batch API (`inflateMany(buffers: Buffer[])`) | 🟡 potential | Use case unclear — HTTP decompression is per-response. Zip-extract-many runs through `@amigo-labs/zip.extractAll`. No clear batch idiom in the ecosystem |
| C.4 | Stateful API (reusable Decompressor class) | 🟡 potential | Relevant for stream resumption, but the NAPI event boundary is the xml antipattern. Skip |
| C.5 | Parallelization (rayon over chunks for 10 MB+) | ❌ not applicable | zlib is sequential; no parallel decompression possible |
| C.6 | Algorithm swap (`cloudflare-zlib`, `isa-l`) | 🟡 **open** | See `docs/perf-review/inflate-backend-spike.md` — Phase-C spike documented, but concluded without a backend switch. A zlib-rs vs. cloudflare-zlib benchmark would be the next step if a Green upgrade to 2×+ is wanted |
| C.7 | Allocator tuning (caller-provided output buffer) | 🟡 **not done** | `inflateInto(data, out: Buffer) → number` would be a new hot path for reuse-heavy callers. Not trivial because of the resize case. Potential follow-up |
| C.8 | Bundle-size (LTO, features off) | ✅ already done | `default-features = false, features = ["zlib-rs"]` |

## Action plan

1. **Propose reclassification to Green.** Update `docs/perf-review.md` line 42 — current measurements show 1.12×–1.67× vs. node:zlib, 5.6×–26× vs. pako. No scenario below 1×.
2. **Add a `gzip`/`ungzip` bench** before v0.2 — a current gap.
3. **Compression-level matrix as a bench enhancement** — 1/6/9 scenarios document the trade-off curve.
4. **`inflateInto(data, out)` spike as a fast follow** (Phase-C.7). Expected +5–15% on reuse-heavy workloads.
5. **cloudflare-zlib backend spike as a Phase-C.6 follow-up** only if a Green-on-Green upgrade (1.12× → 2× vs. node:zlib) is wanted for portfolio reasons. No sprint pressure at the moment because the Green-likely tier has already been reached.

## References

- Crate: `crates/inflate`
- Bench: `crates/inflate/__bench__/index.bench.ts`
- Lib: `crates/inflate/src/lib.rs`
- Cargo: `crates/inflate/Cargo.toml`
- Phase-C spike: `docs/perf-review/inflate-backend-spike.md`
- Commit for the Phase-C fix: `32d7dfa` (`decompress_bulk` + uninit output buffer)
- `docs/packages.json` speedup field: `"up to 7.1× faster"`
- Summary row: `docs/perf-review.md` (Yellow label — outdated post-Phase-C)
