# Perf-Review: `@amigo-labs/language-detect`

> **Status:** 🟢 Green, bimodal (tweet bucket 🟡 Yellow) · **Reviewed:** 2026-07-02 · **Version:** 0.1.1

## Verdict

**1.73× (50 B tweet), 8.06× (~300 B paragraph), 5.92× (~11 KB article)** vs. `franc` (bench 2026-05-22). The candidate review predicted overall Yellow — Green on paragraphs, Red on short strings. The measurement came in better on both ends: the paragraph bucket doubles the predicted 3–4×, and the tweet bucket lands at 1.73× (Yellow by the candidate's own ≥1.5× threshold, not Red — the FFI floor did not eat the win). Trigram scoring over `whatlang`'s compile-time language profiles is exactly the compute-heavy, single-string-in / small-result-out shape NAPI likes.

## Evidence

### Measured speedup (docs/benchmarks/language-detect.json, 2026-05-22, commit `b67b03d`)

| Scenario | @amigo-labs/language-detect | franc | Speedup |
|---|---:|---:|---:|
| tweet (50 B) | 12 137.51 Hz | 7 019.62 Hz | **1.73×** |
| paragraph (~300 B) | 8 835.18 Hz | 1 096.13 Hz | **8.06×** |
| article (~11 KB) | 4 946.72 Hz | 835.62 Hz | **5.92×** |

- `docs/packages.json` speedup: `"1.73–8.1× faster"`.
- Install size: 27 KB vs `franc`'s 304 KB.

### Benchmark gaps

- The candidate gate's **tiny (10 B)** and **200 B** buckets were not benched; the 50 B and ~300 B measurements bracket them.

## What shipped vs. the candidate prediction

- **87 languages** (whatlang's set) vs. `franc-all`'s 414 — the mainstream-language 80/20 the candidate review scoped.
- franc-compatible ISO-639-3 return codes (`'eng'`, `'deu'`, `'und'`, …).
- `detectIfLong` guard: inputs below the minimum length return `'und'` instead of a noise guess.

## Divergences

Confidence scores are **not comparable** to franc's (different normalization); the detected-language code matches franc on the conformance corpus for supported languages. Languages outside whatlang's 87 fall back to `'und'`. See `crates/language-detect/__conformance__/divergences.md`.

Pre-port assessment: [`franc.md`](./franc.md)

## References

- Crate: `crates/language-detect`
- Bench shard: `docs/benchmarks/language-detect.json`
- `docs/packages.json` speedup: `"1.73–8.1× faster"`
