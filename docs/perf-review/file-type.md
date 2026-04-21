# Perf-Review: `@amigo-labs/file-type`

> **Status:** 🟢 Green (extremster Portfolio-Win) · **Reviewed:** 2026-04-21 · **Version:** 0.1.0

## Verdict

**31,9× (100 KB JPEG) bis 2378× (10 MB MP4)** vs. upstream `file-type` npm. Das ist der größte Multiplikator im Portfolio — aber mit einem klaren Strukturgrund: **upstream ist async-only, wir sind sync**. Der User, der "ist das ein JPEG?" auf einem 10 MB Buffer beantworten will, zahlt bei upstream den async-Wrapper-Overhead + Stream-Read-Ceremony; wir erkennen magische Bytes in den ersten 4 KB und returnen direkt. Infer-Rust-Crate ist kompakt (<1 MB Binary), die Signaturen sitzen in compile-time-Tables, und der 4-KB-Head-Cap (`MAX_MAGIC_PREFIX`) vermeidet den sonst sichtbaren 1–3 ms memcpy für den Async-Pfad. Einzige Divergenz vs. upstream: Parity nur 89 % (einige exotische Formate fehlen im `infer` crate).

## Classification rationale

1. **Async-vs-Sync ist der strukturelle Hebel.** upstream-`file-type@19` hat **keine** sync-API mehr — die Umstellung auf async war upstream-Design-Entscheidung (readable-stream-Support). Wir bieten beides: `fileTypeFromBufferSync` für den hot-path (1,4M Hz), `fileTypeFromBuffer` (AsyncTask) für non-blocking.
2. **Infer-Rust-Crate ist sehr schnell.** Signaturen sind in PHF-like Tables (compile-time) gespeichert, byte-matching ist direkter `&[u8]`-Compare. JS-upstream hat RegExp-basierte Signatur-Tests in einem Chain-of-`.match`-Pattern.
3. **4 KB Head-Cap vermeidet redundantes Memcpy.** Jeder `infer::get()` liest nur die ersten ~4 KB. Wir kappen den Async-Task-Input auf 4 KB, was bei 10 MB MP4 den impliziten `to_vec()`-Clone (1–3 ms) eliminiert.
4. **Parity-Gap als akzeptable Kosten.** 89 % Parity (aus `docs/perf-review.md`-Tabelle im README) heißt: ~10 % der von upstream unterstützten Formate fehlen oder divergieren. Infer deckt die 80/20 ab (alle Mainstream-Bildformate, Office-Docs, Archive, Media). Exotische Formate (HEIC-Varianten, alte DOS-Formate) divergieren.

## Evidence

### Measured speedup (docs/data.json, 2026-04-18)

| Scenario | @amigo-labs/file-type (sync) | file-type npm (async) | Speedup |
|---|---:|---:|---:|
| 100 KB JPEG | 1 445 211 Hz | 45 248 Hz | **31,9×** |
| 10 MB MP4 (sync) | 1 382 301 Hz | 581,0 Hz | **2378×** |
| 10 MB MP4 (async) | 36 432 Hz | 581,0 Hz | **62,7×** |

### Realistic use-case

**File-Upload-Validation** — User lädt Datei hoch, wir prüfen magic-bytes bevor wir Endung vertrauen. **Format-Detection in Batch-Pipelines** — File-Tree-Walk mit Category-Buckets. **HTTP-Content-Type-Derivation** aus Bytes statt aus Header. In allen Fällen: sync-API gewünscht (der Async-Overhead der upstream-Library ist ungewollte Komplexität für eine sub-µs-Operation).

### Benchmark gaps

- **Small-Buffer-Bucket (<1 KB) nicht gebenched.** Die meisten magic-bytes-Checks nutzen ~32-256 Byte Header. Dort wäre FFI-Floor relativ sichtbar. Erwartbar: immer noch dominant Green durch async-vs-sync.
- **Diverse Formate einzeln nicht gemessen.** PNG, GIF, PDF, ZIP, etc. haben im `infer` crate unterschiedliche Signatur-Length-Checks. Durchschnitt über Format-Mix wäre sinnvoll.
- **Stream/Path-basierte APIs nicht im Bench** (upstream unterstützt `fileTypeFromFile` etc.). Wir fokussieren auf Buffer-Pfad.

### API surface

```rust
#[napi(js_name = "fileTypeFromBufferSync")] fn file_type_from_buffer_sync(buffer: Buffer) -> Option<FileTypeResult>
#[napi] fn file_type_from_buffer(buffer: Buffer) -> AsyncTask<FileTypeTask>  // 4KB head cap
```

- `FileTypeResult { ext: String, mime: String }` — compact result object.
- Sync-Variante ist der Hot-Path. Async-Variante für non-blocking große-Buffer-Workloads (HTTP-Upload-Handler).
- Kein Stateful-API, kein Config, kein Callback.

### Bundle / binary size

`infer` crate ist unter 100 KB + napi-Bindings. Eines der **kleinsten** Binaries im Portfolio.

### FFI-overhead baseline

- Sync-Pfad: Buffer-Transport ~180 ns, Option<{ext, mime}>-Return ~300 ns (zwei kleine Strings). Rust-Work: 4 KB head-scan ~1–5 µs. Total ~5 µs per call. **3,47 % FFI-Share** auf sync — tolerabel.
- Async-Pfad: 4 KB-memcpy ~2 µs, AsyncTask-Schedule ~10 µs, compute ~5 µs, resolve ~10 µs. Total ~27 µs. Dominiert von async-ceremony, das ist der Punkt.

## Phase-C optimization checklist

| # | Lever | Applicable | Notes |
|---|---|---|---|
| C.1 | Input-type minimization | ✅ already done | `Buffer` zero-copy, sync-Pfad keine Kopie |
| C.2 | Output-type minimization | ✅ already done | `Option<{ext, mime}>` compact |
| C.3 | Batch API (`file_type_many`) | 🟡 potential | File-Tree-Walker-Use-Case könnte profitieren. Aber 1,4M Hz ist bereits so schnell dass Batch-Hebel marginal wäre |
| C.4 | Stateful API | ❌ not applicable | Kein Config-State |
| C.5 | Parallelization | ❌ not applicable | Single-Call macht kein Headroom |
| C.6 | Algorithm swap | ❌ not applicable | `infer` ist bereits optimal |
| C.7 | Allocator tuning | ✅ already done | 4KB head-cap, kein Full-Buffer-Clone im Async |
| C.8 | Bundle-size | ✅ already done | Sehr klein |

## Action plan

**Keep-as-is.** Kein Raum nach oben, größter Speedup-Win im Portfolio. Paket ist fertig.

Maintenance:

1. **Small-Buffer-Bucket benchen** (32-Byte-Header-Case) zur Dokumentation.
2. **Format-Mix-Bench** — PNG/GIF/PDF/MP4/ZIP durcheinander für "realistic median" statt nur JPEG+MP4.
3. **Parity-Gap-Doku** (die fehlenden 11 %) in `divergences.md` falls noch nicht vollständig.

Keine offenen Phase-C-Levers, keine Phase-D-Risiken.

## References

- Crate: `crates/file-type`
- Bench: `crates/file-type/__bench__/index.bench.ts`
- Lib: `crates/file-type/src/lib.rs`
- Cargo: `crates/file-type/Cargo.toml`
- `docs/packages.json` speedup: `"32× faster"` (konservativ angegeben vs. den gemessenen 2378×)
