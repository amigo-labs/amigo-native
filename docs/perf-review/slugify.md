# Perf-Review: `@amigo-labs/slugify`

> **Status:** 🟢 Green · **Reviewed:** 2026-04-21 · **Version:** 0.1.0

## Verdict

**2,27×–4,49× vs. `slugify` npm** über alle Input-Größen. Unicode-Normalization + Transliteration ist echtes Work, der FFI-Overhead ist relativ klein zur Rust-Compute-Größe. `deunicode` crate + `unicode-normalization` crate machen per-Character-Work in pre-computed Tables — JS-upstream nutzt eine große JS-Lookup-Table plus manuelle NFD-Normalization. Sauberster Green-Shape im Portfolio neben `jwt`: String-in, String-out, kein State, kein Callback, substantial compute.

## Classification rationale

1. **Unicode-Normalization ist der strukturelle Win.** NFD-Normalization braucht Lookup in compact Unicode-Tables (10k+ Einträge). Rust's `unicode-normalization` crate hat hand-optimized Decomposition-Tables (compile-time PHF); JS macht dasselbe mit einem großen JS-Object + V8-Hashmap-Lookup per Char.
2. **Transliteration via `deunicode` ist Lookup-Table-Perf.** Per-char Rust-Match ist schneller als JS's Chain-of-`switch` oder Map-Lookup.
3. **Skaliert linear mit Input-Size.** 20-char: 2,82×, 500-char: 4,49×, unicode-heavy: 2,27×. Keine Bimodalität.
4. **Binary-Size ist der Trade-off.** slugify bringt ~966 KB Binary für 21 KB JS-Alternative (`docs/perf-review.md:115`). Das ist explizit dokumentiert als akzeptabler Trade-off (3 Größenordnungen Speedup bei 3 Größenordnungen Bundle).

## Evidence

### Measured speedup (docs/data.json, 2026-04-18)

| Scenario | @amigo-labs/slugify | slugify npm | Speedup |
|---|---:|---:|---:|
| short ASCII (20 chars) | 1 435 759 Hz | 508 504 Hz | **2,82×** |
| long ASCII (500 chars) | 116 529 Hz | 25 966 Hz | **4,49×** |
| unicode heavy | 278 351 Hz | 122 440 Hz | **2,27×** |

### Realistic use-case

**URL-Slug-Generation** — Post-Title → URL-Path. Typisch 10–80 chars Input, ein Call pro Post/Article/Item-Create. **Filename-Safe-Naming** für Uploads. **Database-Record-Identity-Generation**. Alle Single-Call-per-Operation, keine Hot-Loops.

### Benchmark gaps

- **Sprach-Matrix nicht isoliert.** `deunicode` hat sprachspezifische Transliteration (deutsch-Ü → ue, chinesisch-汉字 → Han Zi). Ein Korpus pro Sprache wäre lehrreich, aber nicht kritisch.
- **Separator-Option-Variation** nicht gemessen (`_` vs `-` vs custom).
- **Strict-Mode-Option** (alphanumeric-only) nicht isoliert.

### API surface

Aus `crates/slugify/package.json` amigo-block und typischer slugify-npm-Parity:

- `slugify(string, options?) → string`
- Options: `replacement` (separator), `remove` (regex/set von chars), `lower`, `strict`, `locale`

Keine NAPI-Class, kein Stateful, kein Async (trivial-fast, keine Notwendigkeit).

### Bundle / binary size

~966 KB per Target (explicit in `docs/perf-review.md:115`). Groß relativ zu JS-Alternative (21 KB) weil Unicode-Tables eingebettet. Das ist das gesamte Portfolio-Trade-off-Argument: 3× – 6× Speedup bei 46× Bundle-Size.

Für Serverless-Deployments ist das relevant — 966 KB × 6 Targets ist signifikant. Für Docker-Containers irrelevant.

### FFI-overhead baseline

- 20-char ASCII: String-Input-UTF-Konv ~100 ns, Output ähnlich. Rust ~650 ns slugify (inkl. normalize+transliterate+join). Total ~1 µs. FFI ~20 % Share, aber JS-upstream ist selbst 2 µs per Call → wir gewinnen.
- 500-char: FFI ~500 ns auf ~8 µs Rust = 6 %.
- Unicode-heavy: FFI ~500 ns auf ~3,5 µs Rust = 14 %.

Überall Green.

## Phase-C optimization checklist

| # | Lever | Applicable | Notes |
|---|---|---|---|
| C.1 | Input-type minimization (`&str` statt `String`) | 🟡 marginal | `&str` wäre möglich, spart ~50 ns pro Call. Sub-prozent-Gewinn bei aktuellen Margins |
| C.2 | Output-type minimization | ❌ not applicable | `String`-Output ist natürlich |
| C.3 | Batch API (`slugifyMany`) | 🟡 potential | CSV-Import-mit-Slug-Generation könnte profitieren. Nicht gemessen |
| C.4 | Stateful API | ❌ not applicable | Options sind per-call leichtgewichtig |
| C.5 | Parallelization | ❌ not applicable | Single-string single-threaded |
| C.6 | Algorithm swap | ❌ not applicable | `deunicode` + `unicode-normalization` sind best-in-class |
| C.7 | Allocator tuning (pre-alloc Output-Capacity) | 🟡 marginal | `String::with_capacity` basierend auf Input-Length × 1,5 — mikro-Optimierung |
| C.8 | Bundle-size | ⚠️ accepted trade-off | Unicode-Tables sind der Bulk; nicht reduzierbar ohne Scope-Cut (z.B. transliterate-optional) |

## Action plan

**Keep-as-is.** Green über alle Szenarien, keine offene Front.

Maintenance:

1. **Bench-Matrix erweitern** (Sprachen, Separator-Options, Strict-Mode).
2. **`slugifyMany`-Bench** falls Batch-Hebel portfolio-relevant wird.
3. **Binary-Size-Reduktion als Fast-Follow** falls Serverless-User Complaints kommen: feature-gated `deunicode` (Ascii-only / Latin-only / Full) könnte 60–70 % sparen. Bisher keine Nachfrage.

## References

- Crate: `crates/slugify`
- Bench: `crates/slugify/__bench__/index.bench.ts`
- Lib: `crates/slugify/src/lib.rs`
- Cargo: `crates/slugify/Cargo.toml`
- Bundle-trade-off Diskussion: `docs/perf-review.md:115`
- `docs/packages.json` speedup: `"2.3–4.5× faster"`
