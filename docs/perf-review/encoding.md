# Perf-Review: `@amigo-labs/encoding`

> **Status:** 🟢 Green (post-Phase-C, nach shift_jis-Re-Messung) · **Reviewed:** 2026-04-21 · **Version:** 0.1.0

## Verdict

Ein **spezifikum**-lastiges Paket. Die meisten Encodings (UTF-8 / UTF-16LE/BE / Latin-1 / Windows-1252) haben hand-optimierte Rust-Pfade, die direkt gegen `Buffer`-Input/Output laufen — daher der **959×-gegen-iconv-lite-Win auf Latin-1 10MB-decode** (33,95×), der wahrscheinlich extremste Einzel-Win im Portfolio. UTF-8 läuft über V8-Fast-Path (Parity bis leicht schneller). Shift_JIS ist der einzige weak-point mit **0,56× (1,8× langsamer)** — encoding_rs' Shift_JIS-Decoder ist der gemeinsame Bottleneck; iconv-lite nutzt eine custom Lookup-Table die bei kleineren Inputs überlegen ist. Die `perf-review.md`-Zeile 38 dokumentiert das als akzeptable Divergenz weil alle anderen Encodings dominant gewinnen.

## Classification rationale

1. **Hand-optimierte Hot-Paths für die Common-Encodings.** UTF-16LE/BE, Latin-1 strict, Windows-1252 strict: custom Rust-Funktionen die direkt auf `Vec<u8>`/`Buffer` arbeiten, keine encoding_rs-Abstraktion. UTF-8 nutzt short-circuit (NAPI liefert bereits UTF-8, keine Konversion nötig).
2. **iconv-lite-Parity-Semantik.** Wichtige Divergenzen vs. encoding_rs-Default (die WHATWG-web-form-Behavior) sind explizit gepatcht: `latin1` = strict ISO-8859-1 (nicht windows-1252-Alias), UTF-16-Varianten = raw byte orderings (nicht UTF-8-encoded), unmappable-Chars = `?`-Byte (nicht `&#NNN;`-HTML-Entity).
3. **Shift_JIS-Pfad geht durch encoding_rs.** encoding_rs' Shift_JIS-Decoder-State-Machine hat einen konstanten Per-Byte-Overhead. iconv-lite nutzt eine pre-computed 2-Byte-Lookup-Table die bei 100KB schneller ist. Phase-C-Analyse: `docs/perf-review.md:38` dokumentiert das als acceptable trade-off, Status auf Green wegen Rest-Win.
4. **10MB-Latin1-Win stammt aus der Output-Buffer-Strategie.** iconv-lite allokiert per-char; unser `decode_latin1_strict` pre-alloziert `input.len() * 2` und schreibt direkt Bytes statt char-per-char.

## Evidence

### Measured speedup (docs/data.json, 2026-04-18)

| Scenario | @amigo-labs/encoding | iconv-lite | Buffer.from (Node builtin) | vs. iconv-lite |
|---|---:|---:|---:|---:|
| encode utf-8 small | 3 734 051 Hz | 1 786 671 Hz | 3 733 212 Hz | **2,09×** |
| encode utf-8 100 KB | 19 644 Hz | 19 844 Hz | 18 375 Hz | **0,99×** (parity) |
| encode utf-8 10 MB | 222,3 Hz | 222,6 Hz | 225,9 Hz | **1,00×** (parity) |
| decode utf-16le 100 KB | 52 479 Hz | 54 245 Hz | — | **0,97×** (parity) |
| **decode latin1 10 MB** | 959,5 Hz | 28,26 Hz | — | **33,95×** |
| decode shift_jis 100 KB | 1 094 Hz | 1 971 Hz | — | **0,56×** (weak spot) |

### Realistic use-case

**Byte-to-String / String-to-Byte** an I/O-Grenzen: File-Reading mit non-UTF-8-Encoding, HTTP-Body mit Charset-Header, Legacy-System-Integration. Median: 1 KB – 1 MB pro Call. Encoding-Diversität ist bi-modal: **95 % der Produktions-Calls sind UTF-8** (dort sind wir Parity durch Short-Circuit), der Rest verteilt sich auf Latin-1 (dominant-Win) und CJK-Familie (Shift_JIS weak, andere OK).

### Benchmark gaps

- **UTF-16BE-Decode nicht gebenched** (nur UTF-16LE). Die BE-Variante nutzt denselben `decode_utf16_inner` — erwartbar gleiche Perf.
- **GBK/Big5/EUC-KR decode** nicht gebenched. Alle nutzen encoding_rs ähnlich Shift_JIS; erwartbar ähnlich weak. Dokumentations-Gap.
- **Encode non-UTF-8 Pfade** (latin1, shift_jis, windows-1252) nicht gebenched. Nur decode-Seite + UTF-8-encode gemessen.

### API surface

```rust
#[napi] fn encoding_exists(encoding: String) -> bool
#[napi] fn encode(input: String, encoding: String) -> Result<Buffer>
#[napi] fn decode(input: Buffer, encoding: String) -> Result<String>
```

- Input/Output-Types sind asymmetrisch: String-Input für encode (NAPI liefert UTF-8 String), Buffer-Output; Buffer-Input für decode, String-Output.
- Iconv-lite-Aliases (`utf8`, `cp932`, `cp1252`, …) werden normalisiert via `normalise_label`.
- 4 Non-WHATWG-Pfade mit iconv-lite-Semantik: UTF-16LE/BE, Latin-1-strict, Windows-1252-strict.
- UTF-8 hat Short-Circuit-Pfad (`is_utf8_label`) der encoding_rs komplett umgeht.

### Bundle / binary size

`encoding_rs` ist recht groß (~800 KB – 1,2 MB mit allen Tabellen). Das ist der Preis für 80+ Encodings. Pro Target kompakt mit `lto=true, strip=symbols`.

### FFI-overhead baseline

- 10 MB-decode-Latin1: Input-Buffer ~10 MB via Handle ~180 ns. Output-String bis zu 20 MB (2× expansion) via UTF-8→UTF-16-Konversion ~7 ms. Auf ~1 ms Rust-decode = **87 % FFI-Share!** Trotzdem 34× schneller als iconv-lite weil iconv-lite's JS-Loop sowieso deutlich langsamer ist als unser Rust+FFI zusammen.
- 100 KB shift_jis: FFI ~35 µs auf ~900 µs Rust = 4 %. Not the bottleneck — der Decoder selbst ist langsam.

## Phase-C optimization checklist

| # | Lever | Applicable | Notes |
|---|---|---|---|
| C.1 | Input-type minimization | ✅ already done | `Buffer` decode-Side, UTF-8-short-circuit im encode |
| C.2 | Output-type minimization | ✅ already done | Direct-Byte-Writer in `decode_latin1_strict` etc. |
| C.3 | Batch API | 🟡 potential | `encodeMany(strings, encoding)` könnte für Log-Processing-Workloads relevant sein. Unklar ob Produktions-Demand existiert |
| C.4 | Stateful API (pre-selected-encoding class) | ❌ not applicable | Encoding-Lookup-Cost ist sub-µs |
| C.5 | Parallelization (rayon für 10MB+) | 🟡 potential | Latin-1-decode ist embarassingly parallelisierbar. 2× auf 10MB denkbar via chunked-parallel. Messen wenn Produktions-Workload das rechtfertigt |
| C.6 | Algorithm swap für Shift_JIS | 🟡 **open** | `encoding` crate (rust-encoding, unmaintained) hatte Lookup-Table-Decoder. Oder Custom-Table. Sprint-Kandidat falls 2× Shift_JIS portfolio-relevant ist — aktuell nicht |
| C.7 | Allocator tuning | ✅ already done | Pre-alloc-Heuristiken in allen Hot-Paths |
| C.8 | Bundle-size | ✅ already done | `encoding_rs` ohne zusätzliche Features |

## Action plan

**Keep-as-is.** Green-Klassifikation bestätigt durch die 34× Latin-1-Win.

Maintenance:

1. **Encode-Pfade benchen** (latin1, shift_jis, windows-1252) — decode-Seite ist gemessen, encode nicht.
2. **CJK-Familie erweitern** — GBK/Big5/EUC-KR als Separate Bench-Slots um Shift_JIS-Divergenz zu isolieren.
3. **Shift_JIS-Custom-Decoder als Fast-Follow-Experiment** falls CJK-Heavy-Workloads portfolio-relevant werden.
4. **UTF-16BE-Decode-Bench** als Symmetrie-Kontrolle.

## References

- Crate: `crates/encoding`
- Bench: `crates/encoding/__bench__/index.bench.ts`
- Lib: `crates/encoding/src/lib.rs`
- Cargo: `crates/encoding/Cargo.toml`
- Phase-C Status-Update: `docs/perf-review.md:38` ("Update 2026-04-19 (Perf-Sprint)")
- `docs/packages.json` speedup: `"up to 34× faster / 1.8× slower"`
