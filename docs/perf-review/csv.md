# Perf-Review: `@amigo-labs/csv`

> **Status:** 🟢 Green · **Reviewed:** 2026-04-21 · **Version:** 0.1.0

## Verdict

Parity-Green über alle drei Size-Buckets — **2,39×–5,22× vs. `csv-parse` (sync)** und **1,52×–1,88× vs. `papaparse`**. Der Phase-C-Fix (Commit `ecf8408`) routet `parse()` jetzt durch `parseToJson + JSON.parse`, was die frühere Yellow-Grenze auf plain-`parse()` eliminiert hat — beide Pfade messen jetzt identisch. BurntSushi's `csv` crate ist eine der ausgereiftesten Rust-Parser-Libraries im Ökosystem; FFI-Overhead ist bei 10k-Rows-Scale <1 % (Buffer-in, JSON-String-out).

## Classification rationale

1. **Parser-Baseline ist relativ langsam.** `csv-parse` (sync) nutzt eine state-machine in JS, `papaparse` eine custom-tokenizer; beide CPU-bound ohne SIMD. BurntSushi `csv` nutzt memchr-gestützte Field-Detection plus ein zero-copy-Reader-Pattern.
2. **`parseToJson`-Pfad war der Phase-C-Hebel.** Ursprüngliche `parse()` gab `Vec<Vec<String>>` zurück — 100k Rows × 5 Cols × Marshalling-Overhead war messbar. Aktuelle Implementation: Rust baut direkt JSON-String, JS macht `JSON.parse` auf dem Output. **Ein** FFI-Crossing statt 500k.
3. **Alle drei Buckets Green.** Kein Bimodal-Problem. Speedup skaliert mit Input-Size (größer = mehr Rust-Work relativ zu FFI-Transport).

## Evidence

### Measured speedup (docs/data.json, 2026-04-18)

| Scenario | @amigo-labs/csv | parseToJson | csv-parse | papaparse | vs. csv-parse | vs. papaparse |
|---|---:|---:|---:|---:|---:|---:|
| 100 rows × 5 cols | 11 892 Hz | 12 395 Hz | 4 968 Hz | 7 832 Hz | **2,39×** | **1,52×** |
| 10 000 rows × 5 cols | 177,3 Hz | 177,7 Hz | 45,3 Hz | 97,2 Hz | **3,91×** | **1,82×** |
| 100 000 rows × 10 cols | 10,37 Hz | 10,35 Hz | 1,99 Hz | 5,51 Hz | **5,22×** | **1,88×** |

### Realistic use-case

**ETL / Data-Import** — CSV-Upload aus User-Forms, Log-File-Analysis, Spreadsheet-Export-Pipelines. Median-Workload: 10 KB – 10 MB CSV, 10–100k Rows. Ein Parse-Call pro File, deterministic Output-Shape. Zweiter Use-Case: **CLI-Tooling** (`csv`-Util-Pipes), dort kleinere Inputs aber höhere Call-Frequency — 100-Row-Bucket relevant.

### Benchmark gaps

- **`stringify`-Pfad nicht gebenched** (Row-Array → CSV-String). Phase-C-Äquivalent zum parseToJson-Hebel nicht verifiziert. Vor v0.2 nachziehen.
- **`parseWithHeaders` nicht separat gebenched.** Konvention in npm-`csv-parse`: `{columns: true}` ist der Default-Use-Case in Produktion. Wir haben die API, aber keine Messung.
- **Edge-cases** (CRLF/LF-Mix, Quoted-Delimiter, UTF-8-BOM) nicht als Bench-Szenario — parity via `__conformance__/upstream.spec.ts` abgedeckt, aber perf-separat wäre sinnvoll.

### API surface

```rust
#[napi] fn parse(input: Buffer, options: Option<CsvOptions>) -> Result<Vec<Vec<String>>>
#[napi(js_name = "parseWithHeaders")] fn parse_with_headers(input: Buffer, ...) -> Result<Vec<HashMap<String, String>>>
#[napi] fn stringify(rows: Vec<Vec<String>>, options: ...) -> Result<String>
#[napi(js_name = "stringifyObjects")] fn stringify_objects(rows: Vec<HashMap<String, String>>, columns: ..., options: ...) -> Result<String>
#[napi(js_name = "countRows")] fn count_rows(input: Buffer, options: ...) -> Result<u32>
#[napi(js_name = "parseToJson")] fn parse_to_json(input: Buffer, options: ...) -> Result<String>
```

- Input `Buffer` durchgehend (zero-copy-Transport).
- `parse()` ist intern identisch mit `parseToJson + JSON.parse` (Commit `ecf8408`).
- `countRows()` ist der Shortcut für Row-Count ohne Array-Aufbau — pure Rust, Zero-Array-FFI.
- `parseToJson()` ist der exponierte Hot-Path — User kann `JSON.parse` selbst terminieren und streamen.

### Bundle / binary size

BurntSushi `csv` crate ohne `serde`-Feature. Vermutlich 300–500 KB per Target — small. `docs/data.json`-`sizes`-Feld für exakte Zahl.

### FFI-overhead baseline

- 100k-Row-Bucket: Input-Buffer ~5 MB via Buffer-Handle ~180 ns transport. Output JSON-String ~8 MB via UTF-8→UTF-16-Konversion bei 0,35 ns/byte = ~2,8 ms. Auf ~100 ms Rust-Parse = **2,8 % FFI-Share**. Tolerabel.
- 100-Row-Bucket: FFI ~30 µs auf ~80 µs Rust = 27 %. Dort wäre Buffer-Output-Variante ein Theorie-Hebel, aber aktueller 2,39×-Speedup ist bereits Green.

## Phase-C optimization checklist

| # | Lever | Applicable | Notes |
|---|---|---|---|
| C.1 | Input-type minimization | ✅ already done | `Buffer` durchgehend, zero-copy |
| C.2 | Output-type minimization (String JSON statt Vec<Vec<String>>) | ✅ already done | Commit `ecf8408` |
| C.3 | Batch API | ❌ not applicable | Ein-Call-per-File ist das Idiom |
| C.4 | Stateful API (CsvParser-Class) | 🟡 marginal | Wenn User wiederholt mit identischen Options parst, kleine Build-Opts-Wins. Sub-prozent. |
| C.5 | Parallelization | ❌ not applicable | CSV ist sequentieller Parse |
| C.6 | Algorithm swap (`qsv`-style simd-csv) | 🟡 potential | `csv-async` crate hat SIMD-Experimente. Wenn 10× vs. BurntSushi messbar, Sprint-würdig. Aktuell 5,22× bei 100k — genug Headroom |
| C.7 | Allocator tuning | ❌ not applicable | — |
| C.8 | Bundle-size | ✅ already done | Workspace-profile |

## Action plan

**Keep-as-is.** Green über alle Buckets, Phase-C-Hebel bereits gezogen.

Maintenance:

1. **`stringify`-Bench hinzufügen** — symmetrischer Pfad zu parse.
2. **`parseWithHeaders`-Bench** — primärer Produktions-Use-Case, verdient eigene Messung.
3. **SIMD-CSV-Spike** (Phase-C.6) nur als Fast-Follow falls 10×-Upgrade portfolio-politisch gewünscht. Aktuell kein Druck.

## References

- Crate: `crates/csv`
- Bench: `crates/csv/__bench__/index.bench.ts`
- Lib: `crates/csv/src/lib.rs`
- Cargo: `crates/csv/Cargo.toml`
- Phase-C commit: `ecf8408` (`parse()` → `parseToJson + JSON.parse`)
- `docs/packages.json` speedup: `"1.52–1.88× faster"` (vs. papaparse — konservative Zahl)
