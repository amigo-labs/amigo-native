# Perf-Review: `@amigo-labs/{{NAME}}`

> **Status:** {{CLASSIFICATION}} · **Reviewed:** {{DATE}} · **Version:** {{VERSION}}

## Verdict

{{ONE_SENTENCE_VERDICT}}

## Classification rationale

{{RATIONALE_PROSE}}

## Evidence

### Measured speedup (from BENCHMARKS.md)

{{BENCHMARKS_TABLE}}

### Realistic use-case

{{USE_CASE_NARRATIVE}}

### Benchmark gaps

{{BENCHMARK_GAPS}}

### API surface

{{API_SIGNATURE_NOTES}}

### Bundle / binary size

{{SIZE_NOTES}}

### FFI-overhead baseline

{{BASELINE_NOTES}}

## Phase-C optimization checklist

| # | Lever | Applicable | Notes |
|---|---|---|---|
| C.1 | Input-type minimization (`String` → `&str`, `Vec<T>` → `&[T]`, Buffer-overload) | {{C1_STATUS}} | {{C1_NOTES}} |
| C.2 | Output-type minimization (`String` → `&str`, `Vec<T>` → Buffer) | {{C2_STATUS}} | {{C2_NOTES}} |
| C.3 | Batch API | {{C3_STATUS}} | {{C3_NOTES}} |
| C.4 | Stateful API (reusable setup via NAPI class) | {{C4_STATUS}} | {{C4_NOTES}} |
| C.5 | Parallelization (rayon over large inputs) | {{C5_STATUS}} | {{C5_NOTES}} |
| C.6 | Algorithm swap (SIMD variant, streaming parser, etc.) | {{C6_STATUS}} | {{C6_NOTES}} |
| C.7 | Allocator tuning (arena, caller-provided output buffer) | {{C7_STATUS}} | {{C7_NOTES}} |
| C.8 | Bundle-size (LTO, features, panic=abort, strip) | {{C8_STATUS}} | {{C8_NOTES}} |

## Action plan

{{ACTION_PLAN}}

## References

- Crate: `{{CRATE_PATH}}`
- Bench: `{{BENCH_FILE}}`
- Lib: `{{LIB_RS}}`
- Cargo: `{{CARGO_TOML}}`
- `docs/packages.json` speedup field: `{{ADVERTISED_SPEEDUP}}`
