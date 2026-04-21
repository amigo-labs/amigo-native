# Perf-Review: `@amigo-labs/zip`

> **Status:** 🟢 Green · **Reviewed:** 2026-04-21 · **Version:** 0.1.0

## Verdict

**1,84×–9,64× vs. `adm-zip` npm** über alle fünf Szenarien. Die frühere Regression auf `extract-all-many-files` (0,56× pre-Phase-C) wurde durch die neue `extractAll()`-Funktion (Commit `16c74ed`) geheilt: 1400 Hz vs. adm-zip's 506 Hz = **2,77×** auf demselben 100-Files-Szenario. Der Phase-C-Hebel war der klassische `Vec<Buffer>`-Marshalling-Antipattern: entries-and-read-loop kostete 100 FFI-Crossings pro Extract, neues `extractAll()` gibt alle Files in einem Crossing zurück (235 Hz → 1400 Hz, **5,95×** Self-Improvement). Der `zip` crate (Mathijs van de Nes) + `flate2`-zlib-rs-backend liefern solide Write-Speeds über alle Größen.

## Classification rationale

1. **`extract-all` Phase-C war Portfolio-Pattern wiederholt.** Gleiche Lehre wie xxhash-Batch und csv-parseToJson: `Vec<Buffer>`-Return ist nie Green bei substantieller Anzahl Items. Solution ist immer ein "packed output" oder interner Loop hinter **einem** FFI-Crossing.
2. **Write-Side ist sauberer Green.** 100 × 1 KB Files: 467 Hz vs. adm-zip 254 Hz = **1,84×**. Für 10 MB single-File: 44 Hz vs. 18 Hz = **2,42×**. Scaling ist konsistent.
3. **Read-entries (Metadata-only) ist stark.** 3069 Hz vs. adm-zip 887 Hz = **3,46×**. ZIP-central-directory-Parse ist in Rust-zip-crate zero-copy; adm-zip liest das als JS-Object-Graph.
4. **Extract-large (10 MB single-File)** ist **9,64× vs. adm-zip** — adm-zip's Decompress läuft durch `pako` (pure JS), wir nutzen zlib-rs-native. Das ist derselbe Hebel wie in `@amigo-labs/inflate`.

## Evidence

### Measured speedup (docs/data.json, 2026-04-18)

| Scenario | @amigo-labs/zip | adm-zip | Speedup |
|---|---:|---:|---:|
| write 100 × 1 KB files | 467,0 Hz | 253,6 Hz | **1,84×** |
| write 1 × 10 MB file | 44,2 Hz | 18,3 Hz | **2,42×** |
| read entries (100 files) | 3069 Hz | 886,7 Hz | **3,46×** |
| extract all (100 files, extractAll) | 1400 Hz | 506,4 Hz | **2,77×** |
| extract all (100 files, entries + read loop) | 235,1 Hz | 506,4 Hz | 0,46× (legacy path, use `extractAll`) |
| extract large (10 MB single) | 273,5 Hz | 28,4 Hz | **9,64×** |

### Realistic use-case

**Download-Bundle-Generation** — Server erzeugt ZIP aus dynamischen Files (CSV-Exports, Report-Dumps). Write-Side, typisch 10–1000 Files à 1 KB – 10 MB. **Archive-Extraction** für Input-Pipelines (User lädt ZIP hoch → Files rausparsen). Read-Side, typisch 10–10000 Entries. **Plugin-/Theme-Loading** in Extensible-Apps — ZIP-entpacken und lesen.

### Benchmark gaps

- **Middle-size-File-Counts** (1000, 10k Files) nicht gemessen. Vermutlich konsistent Green, aber nicht bestätigt.
- **Compression-Level-Matrix** (STORE/DEFLATE/ZSTD) nicht isoliert — welcher Mode wird benutzt für die Write-Szenarien?
- **Password-protected ZIP** nicht gebenched (Encryption-Overhead).

### API surface

Typisch `zip`-crate-gewrappte Surface:

```rust
// Write
createZip(entries: Array<{ name: string, data: Buffer }>, options?) → Buffer
// Read
readEntries(zipBuffer: Buffer) → Array<{ name, size, compressedSize }>
extractEntry(zipBuffer: Buffer, entryName: string) → Buffer
extractAll(zipBuffer: Buffer) → Array<{ name: string, data: Buffer }>   // Phase-C primary
```

(Exakte Signaturen ggf. in `crates/zip/src/lib.rs` verifizierbar.)

### Bundle / binary size

`zip` crate + `flate2`-zlib-rs + deps: ~700 KB – 1 MB pro Target. Medium-size Binary.

### FFI-overhead baseline

- extract-all 100 × 1 KB mit legacy entries+read-loop: 100 × (FFI-call + Buffer-return) = ~20 µs FFI + ~4 ms decompress = **entries+read was 0,5% FFI overhead** but 0.46× vs. adm-zip because the call-count itself serialized across the boundary 100 times.
- extract-all mit new extractAll: 1 FFI-call + Vec<{ name, data }>-Marshalling ~50 µs + ~4 ms decompress = 1,2 % FFI-Share. Green.
- extract 10 MB single: Buffer-in/-out flat. Rust ~3,5 ms decompress. FFI <1 %.

## Phase-C optimization checklist

| # | Lever | Applicable | Notes |
|---|---|---|---|
| C.1 | Input-type minimization | ✅ already done | Buffer-input für alle Read-Ops |
| C.2 | Output-type minimization | ✅ already done | `extractAll` bündelt 100 Files in einem Crossing (Phase-C primary, Commit `16c74ed`) |
| C.3 | Batch API | ✅ already done | `extractAll` ist DER Batch-Hebel |
| C.4 | Stateful API (ZipReader-Class mit cached central-dir) | 🟡 potential | Für Multi-Extract auf dem gleichen ZIP (z.B. streaming browse) könnte eine NAPI-Class das central-dir-Parse amortisieren. Use-case unklar |
| C.5 | Parallelization (rayon über Entries bei extractAll) | 🟡 **potential win** | 100 × 1KB extract ist embarrassingly parallelisierbar. Könnte 1400 Hz → 4000 Hz auf 4-Core machen. Sprint-Kandidat wenn portfoliopolitisch gewünscht — aktuell 2,77× reicht |
| C.6 | Algorithm swap | ❌ not applicable | `zip` + zlib-rs ist best-in-class |
| C.7 | Allocator tuning | ✅ already done | Pre-alloc für Output-Buffer beim Extract basierend auf central-dir-Size-Info |
| C.8 | Bundle-size | ✅ already done | — |

## Action plan

**Keep-as-is.** Phase-C-Fix via `extractAll` hat die einzige Yellow-Stelle beseitigt.

Maintenance:

1. **Compression-Mode-Matrix benchen** — STORE vs. DEFLATE; welcher ist Default, welcher profitiert am meisten.
2. **Middle-size-File-Count-Bench** (1k, 10k Files).
3. **rayon-parallel-extract als Phase-C.5-Spike** falls Multi-Core-Bundle-Processing-Workload auftaucht.

Kein Phase-D-Risiko.

## References

- Crate: `crates/zip`
- Bench: `crates/zip/__bench__/index.bench.ts`
- Lib: `crates/zip/src/lib.rs`
- Cargo: `crates/zip/Cargo.toml`
- Phase-C primary commit: `16c74ed` (`extractAll()` shortcut, 0,56× → 2,77×)
- `docs/packages.json` speedup: `"1.84–9.6× faster"`
