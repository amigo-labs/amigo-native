# Perf-Review: `@amigo-labs/inflate`

> **Status:** 🟡 Yellow (perf-review.md label) / 🟢 Green-likely post-Phase-C (measured) · **Reviewed:** 2026-04-21 · **Version:** 0.1.0

## Verdict

Phase-C `decompress_bulk` + uninit-output-buffer-Fix (Commit `32d7dfa`) hat die Inflate-Regression aus der ursprünglichen Klassifikation (0,46×–0,49× vs. node:zlib) behoben. **Aktuelle Messung:** inflate 100KB ist **1,12× vs. node:zlib** und **5,6× vs. pako**, inflate 10MB ist **1,34× vs. node:zlib** und **6,5× vs. pako**. Deflate-Seite ist sauber Green über alle Größen (5,5×–7,1× vs. node:zlib, 19×–35× vs. pako). Die `perf-review.md`-Klassifikation "Yellow" stammt aus pre-Phase-C-Messung und ist nicht mehr aktuell — **Re-Klassifikation auf Green vorschlagen**. pako ist überall klar geschlagen; node:zlib bleibt die schwerere Baseline für Inflate (beide nutzen zlib-backend-Familie; gegen node:zlib ist >1× aber kein 2×-Gap möglich).

## Classification rationale

Inflate ist ein **asymmetrischer Shape**:

1. **Deflate-Seite: unambiguously Green.** 7,1× vs. node:zlib @ 10 MB ist der größte Win im Portfolio nach file-type. zlib-rs ist eine Rewriter-Library mit aggressiveren Optimierungen als upstream-zlib; deflate profitiert am meisten weil LZ77-Match-Search SIMD-geeignet ist.
2. **Inflate-Seite: Green gegen pako, marginal Green gegen node:zlib.** Dekompression ist sequentieller, weniger SIMD-Raum. node:zlib ist selbst auch zlib-C; wir kämpfen zlib-rs-Rust vs. zlib-C. Phase-C `decompress_bulk` + `set_len`-uninit-Trick holt die letzten 30 % auf 10 MB.
3. **Klassifikation ist messungs-bedingt veraltet.** `docs/perf-review.md:42` sagt "inflate 0,46×–0,49×" — das stammt aus pre-Phase-C. Aktuelle `docs/data.json` zeigt 1,12×–1,67× über alle Size-Buckets. Die Label-Aktualisierung steht offen.

## Evidence

### Measured speedup (docs/data.json, 2026-04-18)

| Scenario | @amigo-labs/inflate | pako | node:zlib | vs. pako | vs. node:zlib |
|---|---:|---:|---:|---:|---:|
| deflate 1KB text | 76 581 Hz | 9 659 Hz | 74 856 Hz | **7,93×** | **1,02×** |
| deflate 100KB text | 26 057 Hz | 994 Hz | 4 703 Hz | **26,2×** | **5,54×** |
| deflate 100KB random | 18 402 Hz | 956 Hz | 4 293 Hz | **19,3×** | **4,29×** |
| deflate 10MB text | 320,9 Hz | 9,27 Hz | 45,28 Hz | **34,6×** | **7,09×** |
| inflate 1KB | 301 966 Hz | 47 776 Hz | 180 771 Hz | **6,32×** | **1,67×** |
| inflate 100KB | 19 867 Hz | 3 525 Hz | 17 765 Hz | **5,64×** | **1,12×** |
| inflate 10MB | 252,0 Hz | 38,96 Hz | 187,7 Hz | **6,47×** | **1,34×** |

### Realistic use-case

**Compression:** HTTP-Response-Gzip (Server-Output), Asset-Pipeline-Build (CI), Log-File-Archivierung. 100 KB – 10 MB ist Median. **Decompression:** HTTP-Body-Decompression (Client), Zip-Entry-Read (intern via `@amigo-labs/zip`), Asset-Loading. 1 KB – 100 KB Median; 10 MB ist Batch-Workload.

Beide Pfade sind **Buffer-in/Buffer-out**, ein Call pro Operation, keine Streaming-API im NAPI-Surface (Streaming wäre Event-per-Chunk → FFI-Antipattern, siehe `docs/post-mortems/xml.md`).

### Benchmark gaps

- **Deflate-Compression-Level-Matrix fehlt.** Nur `level=6` (default) getestet. `level=1` (fast) und `level=9` (max) würden zeigen, wie sich die Margin mit Trade-offs verschiebt.
- **Gzip-Pfad (gzip/ungzip) nicht separat gebenched.** Nur deflate/inflate. Format-Overhead ist minimal (gzip = zlib + ~20 B Header/Trailer), aber formale Messung für v0.2 sinnvoll.
- **`level=0` (no-compression) fehlt.** Edge-Case — zlib mit Store-only. Nicht prioritär.

### API surface

```rust
#[napi] fn deflate(data: Buffer, options: Option<InflateOptions>) -> Result<Buffer>
#[napi] fn inflate(data: Buffer) -> Result<Buffer>
#[napi] fn deflate_raw(data: Buffer, options: Option<InflateOptions>) -> Result<Buffer>
#[napi] fn inflate_raw(data: Buffer) -> Result<Buffer>
#[napi] fn gzip(data: Buffer, options: Option<InflateOptions>) -> Result<Buffer>
#[napi] fn ungzip(data: Buffer) -> Result<Buffer>
```

- Buffer-in/Buffer-out durchgehend. Zero-copy-Transport über V8-Buffer-Handle (BASELINE.md:30 = ~180 ns flat bis 10 MB).
- `InflateOptions { level: Option<u32> }` — kompakt, alles per-call parametrisierbar.
- Kein Streaming, kein Callback, kein Stateful-Object. Drei Pfade (zlib/raw/gzip) × 2 Richtungen = 6 Functions, flache Surface.

### Bundle / binary size

`flate2 = { default-features = false, features = ["zlib-rs"] }` — explizit nur zlib-rs-Backend, kein libz/miniz/cloudflare-zlib gelinkt. Das ist ein Phase-C-Commitment (Commit `32d7dfa`). Binary vermutlich 400–700 KB pro Target (zlib-rs ist kompakt).

### FFI-overhead baseline

- Input-Buffer 10 MB: ~180 ns Transport (flat, V8-Handle, `docs/BASELINE.md:30`).
- Output-Buffer 60 MB (10 MB × 6× expected-inflate-ratio): ~180 ns return.
- Total FFI: ~360 ns auf typisch 4 ms Rust-Work bei 10 MB inflate = **0,01 % Share**. Irrelevant.

## Phase-C optimization checklist

| # | Lever | Applicable | Notes |
|---|---|---|---|
| C.1 | Input-type minimization (`String` → `&str`, `Buffer`) | ✅ already done | `Buffer` durchgehend, zero-copy-in |
| C.2 | Output-type minimization (`Buffer` statt `Vec<u8>`) | ✅ already done | `Buffer` durchgehend, plus pre-alloc-Heuristik `estimated_inflate_size` |
| C.3 | Batch API (`inflateMany(buffers: Buffer[])`) | 🟡 potential | Use-Case unklar — HTTP-Decompress ist pro-Response. Zip-Extract-many läuft über `@amigo-labs/zip.extractAll`. Kein klares Batch-Idiom im Ökosystem |
| C.4 | Stateful API (reusable Decompressor-Class) | 🟡 potential | Für Stream-Resumption relevant, aber NAPI-Event-Grenze ist der xml-Antipattern. Skip |
| C.5 | Parallelization (rayon über Chunks für 10 MB+) | ❌ not applicable | zlib ist sequentiell, keine parallele Decompress möglich |
| C.6 | Algorithm swap (`cloudflare-zlib`, `isa-l`) | 🟡 **open** | Siehe `docs/perf-review/inflate-backend-spike.md` — Phase-C-Spike dokumentiert, aber abgeschlossen ohne Backend-Wechsel. zlib-rs vs. cloudflare-zlib-Benchmark wäre der nächste Schritt wenn Green-Upgrade auf 2×+ gefragt |
| C.7 | Allocator tuning (caller-provided output buffer) | 🟡 **not done** | `inflateInto(data, out: Buffer) → number` wäre ein neuer Hot-Path für Reuse-Heavy-Callers. Nicht trivial wegen Resize-Fall. Potential-Follow-up |
| C.8 | Bundle-size (LTO, features off) | ✅ already done | `default-features = false, features = ["zlib-rs"]` |

## Action plan

1. **Re-Klassifikation auf Green vorschlagen.** `docs/perf-review.md`-Zeile 42 aktualisieren — aktuelle Messung zeigt 1,12×–1,67× vs. node:zlib, 5,6×–26× vs. pako. Kein Scenario unter 1×.
2. **`gzip`/`ungzip`-Bench hinzufügen** vor v0.2 — aktuelle Lücke.
3. **Compression-Level-Matrix als Bench-Enhancement** — 1/6/9 Szenarien dokumentieren die Trade-off-Kurve.
4. **`inflateInto(data, out)`-Spike als Fast-Follow** (Phase-C.7). Erwartbar +5–15 % auf Reuse-Heavy-Workloads.
5. **cloudflare-zlib-Backend-Spike als Phase-C.6-Follow-up** nur falls Green-auf-Green-Upgrade (1,12× → 2× vs. node:zlib) portfoliopolitisch gewünscht. Aktuell kein Sprint-Druck weil Green-likely-tier bereits erreicht.

## References

- Crate: `crates/inflate`
- Bench: `crates/inflate/__bench__/index.bench.ts`
- Lib: `crates/inflate/src/lib.rs`
- Cargo: `crates/inflate/Cargo.toml`
- Phase-C Spike: `docs/perf-review/inflate-backend-spike.md`
- Commit für Phase-C-Fix: `32d7dfa` (`decompress_bulk` + uninit-output-buffer)
- `docs/packages.json` speedup field: `"up to 7.1× faster"`
- Summary row: `docs/perf-review.md` (Yellow label — outdated post-Phase-C)
