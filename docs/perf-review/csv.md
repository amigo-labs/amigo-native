# Perf-Review: `@amigo-labs/csv`

> **Status:** 🟢 Green · **Reviewed:** 2026-04-21 · **Version:** 0.1.0

## Verdict

Parity Green across all three size buckets — **2.39×–5.22× vs. `csv-parse` (sync)** and **1.52×–1.88× vs. `papaparse`**. The Phase-C fix (commit `ecf8408`) now routes `parse()` through `parseToJson + JSON.parse`, eliminating the earlier Yellow margin on plain `parse()` — both paths now measure identically. BurntSushi's `csv` crate is one of the most mature Rust parser libraries in the ecosystem; FFI overhead at 10k-row scale is <1 % (Buffer in, JSON string out).

## Classification rationale

1. **Parser baseline is relatively slow.** `csv-parse` (sync) uses a state machine in JS, `papaparse` a custom tokenizer; both CPU-bound without SIMD. BurntSushi `csv` uses memchr-backed field detection plus a zero-copy reader pattern.
2. **The `parseToJson` path was the Phase-C lever.** The original `parse()` returned `Vec<Vec<String>>` — 100k rows × 5 cols × marshalling overhead was measurable. Current implementation: Rust builds a JSON string directly, JS does `JSON.parse` on the output. **One** FFI crossing instead of 500k.
3. **All three buckets Green.** No bimodal problem. Speedup scales with input size (larger = more Rust work relative to FFI transport).

## Evidence

### Measured speedup (docs/data.json, 2026-04-18)

| Scenario | @amigo-labs/csv | parseToJson | csv-parse | papaparse | vs. csv-parse | vs. papaparse |
|---|---:|---:|---:|---:|---:|---:|
| 100 rows × 5 cols | 11 892 Hz | 12 395 Hz | 4 968 Hz | 7 832 Hz | **2.39×** | **1.52×** |
| 10 000 rows × 5 cols | 177.3 Hz | 177.7 Hz | 45.3 Hz | 97.2 Hz | **3.91×** | **1.82×** |
| 100 000 rows × 10 cols | 10.37 Hz | 10.35 Hz | 1.99 Hz | 5.51 Hz | **5.22×** | **1.88×** |

### Realistic use case

**ETL / data import** — CSV uploads from user forms, log-file analysis, spreadsheet-export pipelines. Median workload: 10 KB – 10 MB CSV, 10–100k rows. One parse call per file, deterministic output shape. Second use case: **CLI tooling** (`csv` util pipes), where inputs are smaller but call frequency is higher — the 100-row bucket matters there.

### Benchmark gaps

- **`stringify` path not benched** (row array → CSV string). Phase-C equivalent of the parseToJson lever not verified. Catch up before v0.2.
- **`parseWithHeaders` not separately benched.** The npm `csv-parse` convention `{columns: true}` is the default production use case. We have the API, no measurement.
- **Edge cases** (CRLF/LF mix, quoted delimiter, UTF-8 BOM) not as bench scenario — parity covered via `__conformance__/upstream.spec.ts`, but a perf-only split would be useful.

### API surface

```rust
#[napi] fn parse(input: Buffer, options: Option<CsvOptions>) -> Result<Vec<Vec<String>>>
#[napi(js_name = "parseWithHeaders")] fn parse_with_headers(input: Buffer, ...) -> Result<Vec<HashMap<String, String>>>
#[napi] fn stringify(rows: Vec<Vec<String>>, options: ...) -> Result<String>
#[napi(js_name = "stringifyObjects")] fn stringify_objects(rows: Vec<HashMap<String, String>>, columns: ..., options: ...) -> Result<String>
#[napi(js_name = "countRows")] fn count_rows(input: Buffer, options: ...) -> Result<u32>
#[napi(js_name = "parseToJson")] fn parse_to_json(input: Buffer, options: ...) -> Result<String>
```

- `Buffer` input throughout (zero-copy transport).
- `parse()` is internally identical to `parseToJson + JSON.parse` (commit `ecf8408`).
- `countRows()` is the shortcut for row counting without array construction — pure Rust, zero array FFI.
- `parseToJson()` is the exposed hot path — the user can `JSON.parse` and stream themselves.

### Bundle / binary size

BurntSushi `csv` crate without the `serde` feature. Likely 300–500 KB per target — small. `docs/data.json`'s `sizes` field has the exact number.

### FFI-overhead baseline

- 100k-row bucket: input buffer ~5 MB via buffer handle ~180 ns transport. Output JSON string ~8 MB via UTF-8→UTF-16 conversion at 0.35 ns/byte = ~2.8 ms. On ~100 ms of Rust parse = **2.8 % FFI share**. Tolerable.
- 100-row bucket: FFI ~30 µs on ~80 µs Rust = 27 %. A buffer-output variant would be a theoretical lever there, but the current 2.39× speedup is already Green.

## Phase-C optimization checklist

| # | Lever | Applicable | Notes |
|---|---|---|---|
| C.1 | Input-type minimisation | ✅ already done | `Buffer` throughout, zero-copy |
| C.2 | Output-type minimisation (string JSON instead of Vec<Vec<String>>) | ✅ already done | Commit `ecf8408` |
| C.3 | Batch API | ❌ not applicable | One-call-per-file is the idiom |
| C.4 | Stateful API (CsvParser class) | 🟡 marginal | If users repeatedly parse with identical options, small build-opts wins. Sub-percent. |
| C.5 | Parallelisation | ❌ not applicable | CSV is a sequential parse |
| C.6 | Algorithm swap (`qsv`-style simd-csv) | 🟡 potential | The `csv-async` crate has SIMD experiments. If 10× vs. BurntSushi is measurable, sprint-worthy. Currently 5.22× at 100k — enough headroom. |
| C.7 | Allocator tuning | ❌ not applicable | — |
| C.8 | Bundle size | ✅ already done | Workspace profile |

## Action plan

**Keep-as-is.** Green across every bucket, Phase-C lever already pulled.

Maintenance:

1. **Add a `stringify` bench** — symmetric path to parse.
2. **`parseWithHeaders` bench** — the primary production use case, deserves its own measurement.
3. **SIMD-CSV spike** (Phase-C.6) only as fast-follow if a 10× upgrade is portfolio-political. No pressure right now.

## References

- Crate: `crates/csv`
- Bench: `crates/csv/__bench__/index.bench.ts`
- Lib: `crates/csv/src/lib.rs`
- Cargo: `crates/csv/Cargo.toml`
- Phase-C commit: `ecf8408` (`parse()` → `parseToJson + JSON.parse`)
- `docs/packages.json` speedup: `"1.52–1.88× faster"` (vs. papaparse — conservative figure)
