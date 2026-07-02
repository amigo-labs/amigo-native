# Perf-Review: `@amigo-labs/sentences`

> **Status:** 🟡 Yellow (measured, partial bench coverage) · **Reviewed:** 2026-07-02 · **Version:** 0.1.1

## Verdict

**Bimodal.** On the medium bucket (~5 KB, 50 sentences) the port wins clearly — **3.12×** for `split()` and **4.28×** for the offset hot path — but on short inputs (~50 chars) it is **slower than `sbd`** (0.32×): the Rust work is too small to amortize the FFI floor, exactly the risk the candidate review flagged. The candidate's Green gate required ≥4× on medium **and** ≥5× on long inputs for the offsets path; medium is hit, but the long/100 KB and batch buckets are unmeasured, so the gate is incomplete and the verdict stays Yellow.

## Evidence

### Measured speedup (docs/benchmarks/sentences.json, 2026-05-22, commit `b67b03d`)

| Bucket | `split()` | `splitToOffsets()` | sbd | split vs sbd | offsets vs sbd |
|---|---:|---:|---:|---:|---:|
| short (~50 chars, 4 sentences) | 116 539 Hz | 102 808 Hz | 364 155 Hz | **0.32×** (slower) | 0.28× (slower) |
| medium (~5 KB, 50 sentences) | 29 299 Hz | 40 198 Hz | 9 392 Hz | **3.12×** | **4.28×** |

- `docs/packages.json` speedup: `"TBD"` (shard not synced into packages.json yet).

### Benchmark gaps

- **Long (100 KB) and batch buckets unmeasured** — both are required by the candidate's Green gate and are where the offsets path should shine. Measuring them is the path out of Yellow.

## What shipped vs. the candidate prediction

- `split` / `splitToOffsets` / `splitBatch` / `splitBatchToOffsets` — the offset-based hot path the candidate review designed (the `xxhash` lesson applied to segment offsets).
- 7 European languages, pragmatic-segmenter behaviour (quote balancing, URL-dot handling).
- The sketched `SentenceSplitter` class was **not** shipped; no HTML options, no ja/zh/ko.

## Divergences

Not bit-exact vs `sbd` (rule-set differences); parity target is Pragmatic Segmenter behaviour, per the candidate review. See `crates/sentences/__conformance__/divergences.md`.

Pre-port assessment: [`sbd.md`](./sbd.md)

## References

- Crate: `crates/sentences`
- Bench shard: `docs/benchmarks/sentences.json`
- `docs/packages.json` speedup: `"TBD"`
