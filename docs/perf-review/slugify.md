# Perf-Review: `@amigo-labs/slugify`

> **Status:** 🟢 Green · **Reviewed:** 2026-04-21 · **Version:** 0.1.0

## Verdict

**2.27×–4.49× vs. `slugify` npm** across all input sizes. Unicode normalization + transliteration is real work, and the FFI overhead is relatively small compared to the Rust compute volume. The `deunicode` crate + `unicode-normalization` crate do per-character work in pre-computed tables — the JS upstream uses a large JS lookup table plus manual NFD normalization. Cleanest Green shape in the portfolio next to `jwt`: string-in, string-out, no state, no callbacks, substantial compute.

## Classification rationale

1. **Unicode normalization is the structural win.** NFD normalization requires lookups in compact Unicode tables (10k+ entries). Rust's `unicode-normalization` crate has hand-optimized decomposition tables (compile-time PHF); JS does the same with a large JS object + a V8 hashmap lookup per char.
2. **Transliteration via `deunicode` is lookup-table performance.** A per-char Rust match is faster than JS's chain-of-`switch` or map lookup.
3. **Scales linearly with input size.** 20-char: 2.82×, 500-char: 4.49×, unicode-heavy: 2.27×. No bimodality.
4. **Binary size is the trade-off.** slugify brings a ~966 KB binary for a 21 KB JS alternative (`docs/perf-review.md:115`). This is explicitly documented as an acceptable trade-off (3 orders of magnitude speedup for 3 orders of magnitude bundle).

## Evidence

### Measured speedup (docs/data.json, 2026-04-18)

| Scenario | @amigo-labs/slugify | slugify npm | Speedup |
|---|---:|---:|---:|
| short ASCII (20 chars) | 1 435 759 Hz | 508 504 Hz | **2.82×** |
| long ASCII (500 chars) | 116 529 Hz | 25 966 Hz | **4.49×** |
| unicode heavy | 278 351 Hz | 122 440 Hz | **2.27×** |

### Realistic use-case

**URL slug generation** — post title → URL path. Typically 10–80 chars of input, one call per post/article/item create. **Filename-safe naming** for uploads. **Database record identity generation**. All single-call-per-operation, no hot loops.

### Benchmark gaps

- **Language matrix not isolated.** `deunicode` has language-specific transliteration (German Ü → ue, Chinese 汉字 → Han Zi). One corpus per language would be instructive, but not critical.
- **Separator-option variation** not measured (`_` vs `-` vs custom).
- **Strict-mode option** (alphanumeric-only) not isolated.

### API surface

From the `crates/slugify/package.json` amigo block and typical slugify-npm parity:

- `slugify(string, options?) → string`
- Options: `replacement` (separator), `remove` (regex/set of chars), `lower`, `strict`, `locale`

No NAPI class, nothing stateful, no async (trivially fast, no need).

### Bundle / binary size

~966 KB per target (explicit in `docs/perf-review.md:115`). Large relative to the JS alternative (21 KB) because the Unicode tables are embedded. This is the whole portfolio trade-off argument: 3× – 6× speedup for 46× bundle size.

For serverless deployments this matters — 966 KB × 6 targets is significant. For Docker containers it is irrelevant.

### FFI-overhead baseline

- 20-char ASCII: string-input UTF conversion ~100 ns, output similar. Rust ~650 ns slugify (incl. normalize+transliterate+join). Total ~1 µs. FFI ~20 % share, but the JS upstream is itself 2 µs per call → we win.
- 500-char: FFI ~500 ns on ~8 µs Rust = 6 %.
- Unicode-heavy: FFI ~500 ns on ~3.5 µs Rust = 14 %.

Green everywhere.

## Phase-C optimization checklist

| # | Lever | Applicable | Notes |
|---|---|---|---|
| C.1 | Input-type minimization (`&str` instead of `String`) | 🟡 marginal | `&str` would be possible, saves ~50 ns per call. Sub-percent gain at current margins |
| C.2 | Output-type minimization | ❌ not applicable | `String` output is natural |
| C.3 | Batch API (`slugifyMany`) | 🟡 potential | CSV import with slug generation could benefit. Not measured |
| C.4 | Stateful API | ❌ not applicable | Options are lightweight per call |
| C.5 | Parallelization | ❌ not applicable | Single-string single-threaded |
| C.6 | Algorithm swap | ❌ not applicable | `deunicode` + `unicode-normalization` are best-in-class |
| C.7 | Allocator tuning (pre-alloc output capacity) | 🟡 marginal | `String::with_capacity` based on input length × 1.5 — micro-optimization |
| C.8 | Bundle-size | ⚠️ accepted trade-off | Unicode tables are the bulk; not reducible without a scope cut (e.g. making transliteration optional) |

## Action plan

**Keep-as-is.** Green across all scenarios, no open front.

Maintenance:

1. **Extend the bench matrix** (languages, separator options, strict mode).
2. **`slugifyMany` bench** if the batch lever becomes portfolio-relevant.
3. **Binary-size reduction as a fast-follow** if serverless users complain: a feature-gated `deunicode` (ASCII-only / Latin-only / full) could save 60–70 %. No demand so far.

## References

- Crate: `crates/slugify`
- Bench: `crates/slugify/__bench__/index.bench.ts`
- Lib: `crates/slugify/src/lib.rs`
- Cargo: `crates/slugify/Cargo.toml`
- Bundle trade-off discussion: `docs/perf-review.md:115`
- `docs/packages.json` speedup: `"2.3–4.5× faster"`
