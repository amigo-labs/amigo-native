# Candidate review: `compute-cosine-similarity` (and siblings)

> **Status:** NO-GO · **Predicted:** ⚫ Black · **Reviewed:** 2026-04-21

## Verdict

`compute-cosine-similarity` and the sibling packages (`compute-dot-product`, `compute-euclidean-distance`, `compute-manhattan-distance`) hit the **archetypal FFI-drowns-SIMD shape**: two small-to-medium f64 arrays in, one f64 out. The compute has been SIMD-amenable for 10+ years (AVX/NEON), BUT the FFI transport of the input arrays as `Float64Array` costs more than the distance computation itself for typical embedding sizes (dim=384–1536). V8 has the same SIMD auto-vectorisation in TurboFan. Classic Black shape: no input size rescues it — even larger vectors stay memory-bandwidth-bound and the JS loop keeps up with the Rust loop. Exactly the `deep-equal` lesson, only on vectors instead of objects.

## JS package

- **npm:** [`compute-cosine-similarity`](https://www.npmjs.com/package/compute-cosine-similarity) + siblings (`compute-dot-product`, `compute-cosine-distance`, `compute-euclidean-distance`, `compute-manhattan-distance`, `compute-jaccard-distance`, etc.)
- **Downloads:** ~500k/week combined for the family. Primary adoption through ML / embedding pipelines.
- **Exports / API surface:** `similarity(a, b) → number`. No state, no options. Minimal.
- **Typical input:** Two `Float64Array` (or plain arrays), typically length 384 / 768 / 1536 (embedding dimensions). Occasionally larger for image features.
- **Typical output:** `number` (scalar f64, range -1..1 for cosine).
- **Realistic median use case:** **RAG retrieval score** — one query embedding against hundreds-to-thousands of doc embeddings, top-K determined by cosine score. The function is called in a hot loop (N comparisons per query). Second case: **dedup check** in embedding indexing (compare against all existing embedding clusters).

## Rust replacement

- **Candidate crate(s):** `ndarray` + `ndarray-rand` or directly `std::simd` (stable since 1.72+). For pure cosine: `nalgebra` or 10 lines of hand-rolled code with `f64::mul_add`. Trivial, all MIT/Apache, all auto-vectorised.
- **Maintenance / license:** n/a — trivial
- **Known gotchas / divergences:** Normalisation edge cases (vector-of-zeros → division by zero). Identical to the JS lib.

## BACKLOG check

Existing entry in `BACKLOG.md` → "Ruled out — AI-category": "Two small arrays in, one float out — marshalling drowns SIMD. Same lesson as `deep-equal`." Review formalises with numbers.

Boundary:
- vs. `docs/perf-review/deep-equal.md` (archived 🔴): identical FFI-floor trap. Two-inputs-one-scalar-out is the shared shape.
- vs. `docs/perf-review/hnswlib-node.md` (NO-GO): hnswlib does the same thing (cosine or L2 over vector pairs) but **amortised over an index** — one query runs N distances internally in Rust, not N × FFI crossings. That's exactly why an index API is sensible while a per-pair API is not.

## FFI-overhead prediction

| Factor | Assessment |
|---|---|
| Per-call algorithmic work | **Trivial.** Cosine on dim=1536: ~1 µs in JS (V8 with SIMD), ~300–500 ns in Rust. Rust gain: ~500–700 ns per call. |
| Input size distribution | Two `Float64Array` × (384..1536) × 8 B = 3–12 KB × 2 per call. As a `TypedArray` buffer handle: ~180 ns flat (BASELINE.md:30). But: for plain JS arrays (not TypedArray) the marshalling is 43 ns/element × 1536 × 2 = **132 µs** — catastrophic. Only tolerable with explicit `Float64Array` inputs. |
| Output size distribution | 1 × f64 → 8 B. Negligible. |
| Reusable setup (stateful potential) | None. Stateless function. |
| Batch usage realism | **The only conceivable lever:** `cosineBatch(query: Float64Array, corpus: Float64Array[], dim: number) → Float64Array` — one crossing per N pairs. That already exists as a better-shaped **NAPI-class API**: `hnswlib`-style index. A per-pair package has no batch idiom. |
| FFI-share estimate vs. Rust work | With `Float64Array`: ~30–50 %. With a plain array: >99 %. |

## Classification reasoning

The `compute-*` family is textbook Black:

1. **V8 vectorised TurboFan code is fast.** `compute-cosine-similarity`'s inner loop is `sum += a[i] * b[i]` on `Float64Array`. TurboFan generates AVX instructions. The gap to Rust-SIMD is small (2–3×).

2. **FFI fixed costs dominate.** 109 ns floor + 2 × buffer-access + 1 × scalar return ≈ 300 ns on a 1 µs baseline. ~30 % fixed-cost share. Best-case speedup 1.2×–1.5×.

3. **No batch idiom.** Users write `corpus.map(doc => similarity(query, doc))` — JS loop over FFI calls = N × 300 ns FFI + N × 300 ns Rust compute = slower than pure JS (N × 1 µs).

4. **The Rust answer to this use case is HNSW / ANN index,** not a per-pair function. But `hnswlib-node` / `faiss-node` are already ruled out as C++-wrapping (→ `docs/perf-review/hnswlib-node.md`). There is no portfolio slot for "flat pair-distance in Rust."

**Shape matching:**
- 🔁 Like archived `deep-equal` (small work per call, FFI-dominated)
- 🔁 Like `mime` (flat lookup style)
- ❌ Not like `hnswlib`-style (the index API is the right shape, but reviewed separately and rejected for a different reason)

**Benchmark-gap flag:** No spike needed — architectural analysis is definitive.

## If GO — proposed port

Not recommended. Whoever needs vector similarity over a large corpus uses HNSW / Faiss (both already ruled out for wrapper reasons). Today: stay pure-JS, or write our own Rust ANN impl (separate portfolio topic).

## If NO-GO — BACKLOG entry

Archived 2026-04-21. Full review: `docs/perf-review/compute-cosine-similarity.md`.
