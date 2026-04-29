# Candidate review: `string-similarity` / `leven` / `fastest-levenshtein`

> **Status:** NO-GO · **Predicted:** 🔴 Red · **Reviewed:** 2026-04-21

## Verdict

Three packages, identical lesson: **short-string-dominant Levenshtein / Dice-coefficient computations** — a lesson we have already measured in `docs/post-mortems/levenshtein.md` (0.13× on 10k chars after the Phase-C spike, archived 2026-04-19). A port here would hit the same traps: UTF-16↔UTF-8 conversion on both input strings costs more per call than the actual distance computation. `fastest-levenshtein` is especially deadly because it already takes ~1 µs in JS for short strings — the FFI floor alone is 10–20 % overhead on top, and Rust SIMD acceleration (`triple_accel`) adds nothing beyond that.

## JS package

- **npm:**
  - [`string-similarity`](https://www.npmjs.com/package/string-similarity) (~10M/week) — Dice coefficient on bigrams
  - [`leven`](https://www.npmjs.com/package/leven) (~300k/week) — Levenshtein, pure JS
  - [`fastest-levenshtein`](https://www.npmjs.com/package/fastest-levenshtein) (~2M/week) — Levenshtein, hand-optimised JS
- **Downloads:** ~12M/week combined (BACKLOG figure of "~10M" confirmed as conservative)
- **Exports / API surface:**
  - `string-similarity`: `compareTwoStrings(s1, s2) → number` (Dice, 0..1), `findBestMatch(main, candidates) → {bestMatch, ratings}`
  - `leven(s1, s2) → number` (Levenshtein edit distance)
  - `fastest-levenshtein.distance(s1, s2) → number`, `.closest(str, arr) → string`
- **Typical input:** Two strings. **Corpus is short-string-dominant:** fuzzy match against search results (8–30 chars), typo correction (5–20 chars), name match (10–40 chars). Longer strings are the exception.
- **Typical output:** Number (edit distance or similarity score 0..1).
- **Realistic median use case:** **Fuzzy search in autosuggest** (user types, match against known terms), **typo tolerance in CLI tools** ("did you mean X?"), **name matching** in record linkage. Almost always a **hot loop against an array of candidates**: `candidates.map(c => distance(input, c))`. Median input length <20 chars.

## Rust replacement

- **Candidate crate(s):** `triple_accel` (SIMD Levenshtein), `strsim` (no SIMD), `rapidfuzz` (Python port, fuzzy-match suite)
- **Maintenance / license:** All MIT, active
- **Known gotchas / divergences:** No semantic divergence — Levenshtein and Dice are mathematically unambiguous

## BACKLOG check

Existing entry in `BACKLOG.md` → "Ruled out — AI-category": "Short-string dominant corpus — repeats the `levenshtein` failure exactly (see `docs/perf-review/levenshtein.md`)." Review formalises and archives.

Boundary:
- vs. `docs/perf-review/levenshtein.md` + `docs/post-mortems/levenshtein.md` (archived 🔴, **measured**): same package category, and we have the measurements: 0.13× on 10k chars after the Phase-C spike. The post-mortem is the precedent.
- vs. `docs/perf-review/deep-equal.md` (archived 🔴): architecturally identical (two-small-strings-in, scalar-out).

## FFI-overhead prediction

| Factor | Assessment |
|---|---|
| Per-call algorithmic work | **Trivial to small.** Levenshtein on 10-char strings: ~100 ns JS, ~50 ns Rust. Plus FFI floor 109 ns + 2× UTF conv ~100 ns = **Rust call ≥260 ns**. Speedup 0.4×. |
| Input size distribution | **Critically small.** Median <20 chars. UTF conversion dominates cost relative to compute. Measured in the `levenshtein` post-mortem. |
| Output size distribution | 1 × number. Negligible. |
| Reusable setup (stateful potential) | None. |
| Batch usage realism | **High for the `findBestMatch` shape** — one query against N candidates can be wrapped as `findBestMatch(query, candidates: string[]) → {idx, score}` via a single crossing. BUT: (a) that is the form already provided by `string-similarity` and `@amigo-labs/levenshtein` did test it after the C spike → 1.5× gate at 10k missed → archived. Not reproducible. |
| FFI-share estimate vs. Rust work | >100 % on short strings. Measured. |

## Classification reasoning

We have **measured** this lesson, not just predicted it:

1. **`@amigo-labs/levenshtein` was exactly this port.** 0.13× on 10k chars, 0.60× on 10 chars, 1.10× on 100 chars (only 1 measurement above 1×, the rest Red). Deprecated in 0.2.0, archived 2026-04-19. Full post-mortem: `docs/post-mortems/levenshtein.md`.

2. **`fastest-levenshtein` was already our baseline** — the name says it. Pure JS, highly optimised. The gap to Rust-SIMD `triple_accel` is measurably small after FFI overhead.

3. **`string-similarity`'s Dice coefficient** is marginally more complex (bigram set intersection), but the same compute order of magnitude. Same FFI math.

4. **Batch API as a rescue was tried.** Spike on buffer input (`lev_bytes(a: Buffer, b: Buffer)`) documented in `docs/perf-review/levenshtein.md` under "Gate ≥1.5× at 10k chars missed". No headroom.

**Shape matching:**
- 🔁 Like archived `@amigo-labs/levenshtein` — **exactly the same category**
- 🔁 Like `compute-cosine-similarity` (two-inputs-one-scalar-out, FFI-drowns-compute)
- 🔁 Like archived `deep-equal`

**Benchmark-gap flag:** No spike needed — the `levenshtein` spike is the precedent.

## If NO-GO — BACKLOG entry

Archived 2026-04-21. Full review: `docs/perf-review/string-similarity.md`. Precedent: `docs/post-mortems/levenshtein.md`.
