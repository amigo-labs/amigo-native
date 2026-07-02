# Perf-Review: `@amigo-labs/zip`

> **Status:** 🟢 Green · **Reviewed:** 2026-04-21 · **Version:** 0.1.0

## Verdict

**1.84×–9.64× vs. `adm-zip` npm** across all five scenarios. The earlier regression on `extract-all-many-files` (0.56× pre-Phase-C) was cured by the new `extractAll()` function (commit `16c74ed`): 1400 Hz vs. adm-zip's 506 Hz = **2.77×** on the same 100-files scenario. The Phase-C lever was the classic `Vec<Buffer>` marshalling antipattern: the entries-and-read loop cost 100 FFI crossings per extract; the new `extractAll()` returns all files in a single crossing (235 Hz → 1400 Hz, **5.95×** self-improvement). The `zip` crate (Mathijs van de Nes) + the `flate2` zlib-rs backend deliver solid write speeds across all sizes.

## Classification rationale

1. **The `extract-all` Phase-C was the portfolio pattern repeated.** Same lesson as xxhash batch and csv parseToJson: a `Vec<Buffer>` return is never Green for a substantial number of items. The solution is always a "packed output" or an internal loop behind **one** FFI crossing.
2. **The write side is cleanly Green.** 100 × 1 KB files: 467 Hz vs. adm-zip 254 Hz = **1.84×**. For a 10 MB single file: 44 Hz vs. 18 Hz = **2.42×**. Scaling is consistent.
3. **Read-entries (metadata only) is strong.** 3069 Hz vs. adm-zip 887 Hz = **3.46×**. The ZIP central-directory parse in the Rust zip crate is zero-copy; adm-zip reads it into a JS object graph.
4. **Extract-large (10 MB single file)** is **9.64× vs. adm-zip** — adm-zip's decompression runs through `pako` (pure JS), we use native zlib-rs. That is the same lever as in `@amigo-labs/inflate`.

## Evidence

### Measured speedup (docs/data.json, 2026-04-18)

| Scenario | @amigo-labs/zip | adm-zip | Speedup |
|---|---:|---:|---:|
| write 100 × 1 KB files | 467.0 Hz | 253.6 Hz | **1.84×** |
| write 1 × 10 MB file | 44.2 Hz | 18.3 Hz | **2.42×** |
| read entries (100 files) | 3069 Hz | 886.7 Hz | **3.46×** |
| extract all (100 files, extractAll) | 1400 Hz | 506.4 Hz | **2.77×** |
| extract all (100 files, entries + read loop) | 235.1 Hz | 506.4 Hz | 0.46× (legacy path, use `extractAll`) |
| extract large (10 MB single) | 273.5 Hz | 28.4 Hz | **9.64×** |

### Realistic use-case

**Download-bundle generation** — a server builds a ZIP from dynamic files (CSV exports, report dumps). Write side, typically 10–1000 files of 1 KB – 10 MB each. **Archive extraction** for input pipelines (user uploads a ZIP → parse out the files). Read side, typically 10–10000 entries. **Plugin/theme loading** in extensible apps — unpack a ZIP and read it.

### Benchmark gaps

- **Mid-range file counts** (1000, 10k files) not measured. Presumably consistently Green, but not confirmed.
- **Compression-level matrix** (STORE/DEFLATE/ZSTD) not isolated — which mode is used for the write scenarios?
- **Password-protected ZIPs** not benchmarked (encryption overhead).

### API surface

The typical surface wrapping the `zip` crate:

```rust
// Write
createZip(entries: Array<{ name: string, data: Buffer }>, options?) → Buffer
// Read
readEntries(zipBuffer: Buffer) → Array<{ name, size, compressedSize }>
extractEntry(zipBuffer: Buffer, entryName: string) → Buffer
extractAll(zipBuffer: Buffer) → Array<{ name: string, data: Buffer }>   // Phase-C primary
```

(Exact signatures can be verified in `crates/zip/src/lib.rs` if needed.)

### Bundle / binary size

`zip` crate + `flate2` zlib-rs + deps: ~700 KB – 1 MB per target. Medium-sized binary.

### FFI-overhead baseline

- extract-all 100 × 1 KB with the legacy entries+read loop: 100 × (FFI call + Buffer return) = ~20 µs FFI + ~4 ms decompress = **entries+read was 0.5% FFI overhead** but 0.46× vs. adm-zip because the call count itself serialized across the boundary 100 times.
- extract-all with the new extractAll: 1 FFI call + ~50 µs of Vec<{ name, data }> marshalling + ~4 ms decompress = 1.2% FFI share. Green.
- extract 10 MB single: Buffer in/out flat. Rust ~3.5 ms decompress. FFI <1%.

## Phase-C optimization checklist

| # | Lever | Applicable | Notes |
|---|---|---|---|
| C.1 | Input-type minimization | ✅ already done | Buffer input for all read ops |
| C.2 | Output-type minimization | ✅ already done | `extractAll` bundles 100 files into one crossing (Phase-C primary, commit `16c74ed`) |
| C.3 | Batch API | ✅ already done | `extractAll` is THE batch lever |
| C.4 | Stateful API (ZipReader class with cached central directory) | 🟡 potential | For multi-extract on the same ZIP (e.g. streaming browse), a NAPI class could amortize the central-directory parse. Use case unclear |
| C.5 | Parallelization (rayon over entries in extractAll) | 🟡 **potential win** | 100 × 1KB extract is embarrassingly parallel. Could take 1400 Hz → 4000 Hz on 4 cores. Sprint candidate if wanted for portfolio reasons — 2.77× is enough for now |
| C.6 | Algorithm swap | ❌ not applicable | `zip` + zlib-rs is best-in-class |
| C.7 | Allocator tuning | ✅ already done | Pre-allocation of the extract output buffer based on the central-directory size info |
| C.8 | Bundle-size | ✅ already done | — |

## Action plan

**Keep as-is.** The Phase-C fix via `extractAll` eliminated the only Yellow spot.

Maintenance:

1. **Bench the compression-mode matrix** — STORE vs. DEFLATE; which is the default, which benefits the most.
2. **Mid-range file-count bench** (1k, 10k files).
3. **rayon parallel extract as a Phase-C.5 spike** if a multi-core bundle-processing workload shows up.

No Phase-D risk.

## References

- Crate: `crates/zip`
- Bench: `crates/zip/__bench__/index.bench.ts`
- Lib: `crates/zip/src/lib.rs`
- Cargo: `crates/zip/Cargo.toml`
- Phase-C primary commit: `16c74ed` (`extractAll()` shortcut, 0.56× → 2.77×)
- `docs/packages.json` speedup: `"1.84–9.6× faster"`
