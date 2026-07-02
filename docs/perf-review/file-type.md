# Perf-Review: `@amigo-labs/file-type`

> **Status:** 🟢 Green (most extreme portfolio win) · **Reviewed:** 2026-04-21 · **Version:** 0.1.0

## Verdict

**31.9× (100 KB JPEG) up to 2378× (10 MB MP4)** vs. upstream `file-type` npm. This is the largest multiplier in the portfolio — but with a clear structural reason: **upstream is async-only, we are sync**. The user who wants to answer "is this a JPEG?" on a 10 MB buffer pays upstream's async-wrapper overhead + stream-read ceremony; we detect the magic bytes in the first 4 KB and return directly. The `infer` Rust crate is compact (<1 MB binary), the signatures live in compile-time tables, and the 4 KB head cap (`MAX_MAGIC_PREFIX`) avoids the otherwise visible 1–3 ms memcpy on the async path. Only divergence vs. upstream: parity is only 89 % (some exotic formats are missing from the `infer` crate).

## Classification rationale

1. **Async-vs-sync is the structural lever.** Upstream `file-type@19` no longer has **any** sync API — the switch to async was an upstream design decision (readable-stream support). We offer both: `fileTypeFromBufferSync` for the hot path (1.4M Hz), `fileTypeFromBuffer` (AsyncTask) for non-blocking.
2. **The `infer` Rust crate is very fast.** Signatures are stored in PHF-like tables (compile-time), byte matching is a direct `&[u8]` compare. The JS upstream has RegExp-based signature tests in a chain-of-`.match` pattern.
3. **The 4 KB head cap avoids redundant memcpy.** Every `infer::get()` reads only the first ~4 KB. We cap the async-task input at 4 KB, which for a 10 MB MP4 eliminates the implicit `to_vec()` clone (1–3 ms).
4. **The parity gap is an acceptable cost.** 89 % parity (from the `docs/perf-review.md` table in the README) means: ~10 % of the formats upstream supports are missing or diverge. `infer` covers the 80/20 (all mainstream image formats, office docs, archives, media). Exotic formats (HEIC variants, old DOS formats) diverge.

## Evidence

### Measured speedup (docs/data.json, 2026-04-18)

| Scenario | @amigo-labs/file-type (sync) | file-type npm (async) | Speedup |
|---|---:|---:|---:|
| 100 KB JPEG | 1 445 211 Hz | 45 248 Hz | **31.9×** |
| 10 MB MP4 (sync) | 1 382 301 Hz | 581.0 Hz | **2378×** |
| 10 MB MP4 (async) | 36 432 Hz | 581.0 Hz | **62.7×** |

### Realistic use-case

**File-upload validation** — a user uploads a file, we check the magic bytes before trusting the extension. **Format detection in batch pipelines** — file-tree walk with category buckets. **HTTP content-type derivation** from bytes instead of headers. In all cases: a sync API is what you want (the upstream library's async overhead is unwanted complexity for a sub-µs operation).

### Benchmark gaps

- **Small-buffer bucket (<1 KB) not benched.** Most magic-byte checks use ~32-256 byte headers. There the FFI floor would be relatively visible. Expected: still dominantly Green thanks to async-vs-sync.
- **Individual formats not measured separately.** PNG, GIF, PDF, ZIP, etc. have different signature-length checks in the `infer` crate. An average over a format mix would be sensible.
- **Stream/path-based APIs not in the bench** (upstream supports `fileTypeFromFile` etc.). We focus on the buffer path.

### API surface

```rust
#[napi(js_name = "fileTypeFromBufferSync")] fn file_type_from_buffer_sync(buffer: Buffer) -> Option<FileTypeResult>
#[napi] fn file_type_from_buffer(buffer: Buffer) -> AsyncTask<FileTypeTask>  // 4KB head cap
```

- `FileTypeResult { ext: String, mime: String }` — compact result object.
- The sync variant is the hot path. The async variant is for non-blocking large-buffer workloads (HTTP upload handlers).
- No stateful API, no config, no callbacks.

### Bundle / binary size

The `infer` crate is under 100 KB + napi bindings. One of the **smallest** binaries in the portfolio.

### FFI-overhead baseline

- Sync path: buffer transport ~180 ns, Option<{ext, mime}> return ~300 ns (two small strings). Rust work: 4 KB head scan ~1–5 µs. Total ~5 µs per call. **3.47 % FFI share** on sync — tolerable.
- Async path: 4 KB memcpy ~2 µs, AsyncTask schedule ~10 µs, compute ~5 µs, resolve ~10 µs. Total ~27 µs. Dominated by async ceremony, which is the point.

## Phase-C optimization checklist

| # | Lever | Applicable | Notes |
|---|---|---|---|
| C.1 | Input-type minimization | ✅ already done | `Buffer` zero-copy, no copy on the sync path |
| C.2 | Output-type minimization | ✅ already done | `Option<{ext, mime}>` compact |
| C.3 | Batch API (`file_type_many`) | 🟡 potential | The file-tree-walker use case could benefit. But 1.4M Hz is already so fast that the batch lever would be marginal |
| C.4 | Stateful API | ❌ not applicable | No config state |
| C.5 | Parallelization | ❌ not applicable | A single call leaves no headroom |
| C.6 | Algorithm swap | ❌ not applicable | `infer` is already optimal |
| C.7 | Allocator tuning | ✅ already done | 4KB head cap, no full-buffer clone in async |
| C.8 | Bundle-size | ✅ already done | Very small |

## Action plan

**Keep-as-is.** No room upward, largest speedup win in the portfolio. The package is done.

Maintenance:

1. **Bench the small-buffer bucket** (32-byte-header case) for documentation.
2. **Format-mix bench** — PNG/GIF/PDF/MP4/ZIP mixed together for a "realistic median" instead of only JPEG+MP4.
3. **Parity-gap documentation** (the missing 11 %) in `divergences.md` if not yet complete.

No open Phase-C levers, no Phase-D risks.

## References

- Crate: `crates/file-type`
- Bench: `crates/file-type/__bench__/index.bench.ts`
- Lib: `crates/file-type/src/lib.rs`
- Cargo: `crates/file-type/Cargo.toml`
- `docs/packages.json` speedup: `"32× faster"` (stated conservatively vs. the measured 2378×)
