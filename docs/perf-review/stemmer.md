# Perf-Review: `@amigo-labs/stemmer`

> **Status:** 🟢 Green (measured) · **Reviewed:** 2026-07-02 · **Version:** 0.1.1

## Verdict

**7.03–7.85× across all four scenarios** vs. `natural` (bench 2026-05-28). The batch-first API shape does exactly what the candidate review demanded: one FFI crossing per corpus chunk instead of one per token, so the Snowball compute in `rust-stemmers` dominates and the multiplier stays flat from 1k-token batches up to 100 KB tokenize-and-stem runs. Exceeds every candidate gate (≥3× batch-1000, ≥5× batch-10k, ≥3× tokenizeAndStem-10KB).

## Evidence

### Measured speedup (docs/benchmarks/stemmer.json, 2026-05-28, commit `45d29b4`)

| Scenario | @amigo-labs/stemmer | natural | Speedup |
|---|---:|---:|---:|
| `stemMany` × 1 000 | 1 832 Hz | 260.7 Hz | **7.03×** |
| `stemMany` × 10 000 | 190.2 Hz | 26.67 Hz | **7.13×** |
| `tokenizeAndStem` 10 KB | 1 313 Hz | 172.2 Hz | **7.62×** |
| `tokenizeAndStem` 100 KB | 133.1 Hz | 16.95 Hz | **7.85×** |

- `docs/packages.json` speedup: `"7–7.9× faster"`.
- Install size: **26 KB** vs `natural`'s **65 MB** `node_modules` (natural bundles the whole NLP toolkit; we ship only stemming).

## What shipped vs. the candidate prediction

- Batch-only `Stemmer` class: `stemMany`, `tokenizeAndStem`, `tokenizeAndStemToBuffer`; `stemOnce` exists as the documented slow path.
- **18 languages** (candidate said 17 — `rust-stemmers` added Tamil in the interim).
- English-only stopword list in v0.1.

## Divergences

`rust-stemmers` implements a newer Snowball revision than `natural`'s hand-ported stemmers — a small set of words stems differently (documented with examples). Not a `natural` drop-in; it replaces only the stemming corner of it. See `crates/stemmer/__conformance__/divergences.md`.

Pre-port assessment: [`natural.md`](./natural.md)

## References

- Crate: `crates/stemmer`
- Bench shard: `docs/benchmarks/stemmer.json`
- `docs/packages.json` speedup: `"7–7.9× faster"`
