# Perf-Review: `@amigo-labs/text-splitters`

> **Status:** 🟡 Yellow — long-document bucket 🔴 red-flagged (measured) · **Reviewed:** 2026-07-02 · **Version:** 0.1.1

## Verdict

**The measurement inverts the candidate prediction.** The candidate review predicted Green at RAG scale and Yellow on tweet-sized inputs; measured reality is the opposite — **2.56×** on ~240 B, **1.21×** on ~14 KB, and **4.74× slower** (0.21×) on the ~140 KB long-document bucket. That long bucket is precisely the RAG-ingest scenario the port exists for, and it fails the candidate's Green gate (≥3× RAG-small, ≥5× RAG-large) outright. Prime suspect: the `text-splitter` crate's semantic-hierarchy scanning cost on large inputs. This is the portfolio's clearest **Phase-C investigation item**.

## Evidence

### Measured speedup (docs/benchmarks/text-splitters.json, 2026-06-10, commit `8c743bf`)

| Bucket | @amigo-labs `splitText` | @langchain/textsplitters | Ratio |
|---|---:|---:|---:|
| short (~240 B) | 230 315 Hz | 90 119 Hz | **2.56×** |
| medium (~14 KB) | 1 364 Hz | 1 129 Hz | **1.21×** |
| long (~140 KB) | 17.66 Hz | 83.72 Hz | **0.21× (4.74× slower)** |

- `docs/packages.json` speedup: `"up to 2.6× faster / 4.7× slower"` — deliberately not sugar-coated.

## What shipped vs. the candidate prediction

- `splitText` / `splitTextBatch` / `splitMarkdown` / `countTokens`.
- `lengthMetric` enum replaced the `lengthFunction` callback, as the candidate review designed (a JS callback per chunk would have destroyed the FFI budget).
- No custom separators, no `createDocuments`.
- Tiktoken-based length metrics are **Node-only** — the WASM build excludes the ~1.5 MB BPE tables.

## Phase-C action plan

1. **Profile the long bucket** — isolate whether the regression is the `text-splitter` crate's semantic scan or chunk-string marshalling (an offsets API would fix only the latter).
2. Re-bench after the fix; the crate needs the long bucket at ≥1× minimum to hold Yellow, ≥5× for the originally predicted Green.

## Divergences

Chunk boundaries are close to but not byte-identical with `@langchain/textsplitters` on mixed-separator documents. See `crates/text-splitters/__conformance__/divergences.md`.

Pre-port assessment: [`langchain__textsplitters.md`](./langchain__textsplitters.md)

## References

- Crate: `crates/text-splitters`
- Bench shard: `docs/benchmarks/text-splitters.json`
- `docs/packages.json` speedup: `"up to 2.6× faster / 4.7× slower"`
