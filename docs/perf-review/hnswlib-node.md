# Candidate review: `hnswlib-node`

> **Status:** NO-GO (for now) · **Predicted:** 🟡 Yellow leaning 🔴 Red · **Reviewed:** 2026-04-21

## Verdict

`hnswlib-node` is **itself already a native C++ binding** (node-addon-api wraps the original `hnswlib` by Yury Malkov). A NAPI-RS port would pit Rust `hnsw_rs` (or `instant-distance`) against C++ `hnswlib` — both are implementations of the same HNSW algorithm, both native, both compute-bound in the same inner loop (SIMD distance kernels + heap-based priority queue). The expected perf delta is **0.9×–1.4×** on `searchKnn`, not ≥2×. This is the same lesson as `onnxruntime-node` and `faiss-node` in `BACKLOG.md:36–37`: "re-wrapping a wrapper adds maintenance without speedup." The FFI shape is clean (long-lived index as a NAPI class, one crossing per query), but the baseline is wrong — we are not measuring against JS, we are measuring against native C++. The BACKLOG "Predicted Green" entry overestimates the leverage.

## JS package

- **npm:** [`hnswlib-node`](https://www.npmjs.com/package/hnswlib-node)
- **Downloads:** ~50k/week (Q1 2026 estimate, BACKLOG figure confirmed)
- **Exports / API surface:** `HierarchicalNSW` class (stateful): `initIndex(maxElements)`, `addPoint(vec, label)`, `searchKnn(query, k, filter?) → {distances, neighbors}`, `readIndex(path)`, `writeIndex(path)`, `setEf(ef)`, `resizeIndex`, `markDelete`, `getCurrentCount`, `getMaxElements`
- **Typical input:** f32 vector of embedding dimension 384 (MiniLM) / 768 (BERT) / 1536 (OpenAI-ada-002) / 3072 (text-embedding-3-large). A query is **one** vector, optionally with a filter function
- **Typical output:** `{distances: Float32Array, neighbors: Uint32Array}` of length k (typically k=10–100)
- **Realistic median use-case:** RAG retrieval path. The index is loaded once (10k–1M vectors), then held permanently, with 1–5 `searchKnn` calls per request. Queries per second on the production path: 10–1000 depending on the service. Index builds are rare (offline batch or on doc updates).

## Rust replacement

- **Candidate crate(s):**
  - [`hnsw_rs`](https://crates.io/crates/hnsw_rs) — pure-Rust HNSW, actively maintained (Jean-Pierre Both), MIT/Apache. Has serialize/deserialize, parallel insert via rayon. Feature-compatible with the original `hnswlib` in the standard case.
  - [`instant-distance`](https://crates.io/crates/instant-distance) — alternative Rust HNSW implementation by Dirkjan Ochtman, smaller, clean, but with a smaller feature matrix (no mark_delete in v0.6).
  - **Not suitable:** `rust-hnsw` (unmaintained, 2021).
- **Maintenance / license:** Both active, MIT/Apache-2.0, Rust-only deps. Supply chain clean.
- **Known gotchas / divergences:**
  - **On-disk format parity does NOT exist** — `hnswlib-node` writes the C++ `hnswlib` binary format. Neither `hnsw_rs` nor `instant-distance` reads it. A drop-in `readIndex(path)` path can**not** load existing `hnswlib` indexes. That is a migration blocker for existing users.
  - Filter callbacks (`searchKnn(query, k, filter)`) are per-element JS callbacks in `hnswlib-node` — pushing these across the FFI boundary is the `xml`/object-traversal antipattern (100k+ callbacks per query). They would have to be converted to bitmap-based filters (a `Uint8Array` of allowed labels) — that is an API break, not a drop-in.
  - Euclidean vs. cosine vs. inner product: `hnswlib-node` exposes "l2"/"ip"/"cosine", `hnsw_rs` has the same plus custom distance traits. Parity feasible.

## BACKLOG check

Existing entry: `BACKLOG.md:10–11`:
> **hnswlib-node** (~50k). Approximate-nearest-neighbor search on f32 vectors via `hnsw_rs` / `instant-distance`. One call per query returns k results, index is long-lived state (NAPI class).

Categorized as "Predicted Green". This review **contradicts** that prediction — see below. Relevant for the re-categorization is the existing "Ruled out — AI-category" rationale in `BACKLOG.md:36–37`:
> onnxruntime-node (~400k), faiss-node (~10k). Already native bindings over C++ libraries — re-wrapping a wrapper adds maintenance without speedup.

`hnswlib-node` structurally belongs in the same category. No entry in `docs/packages.json`.

## FFI-overhead prediction

| Factor | Assessment |
|---|---|
| Per-call algorithmic work | **Substantial.** `searchKnn` on 100k vectors × dim=384, ef=200, k=10 ≈ 50–500 µs in C++ `hnswlib`. `addPoint` similar. FFI share negligible (~109 ns on 50 µs = 0.2 %). |
| Input size distribution | **Small.** The query vector as a `Float32Array` is 384×4 = 1.5 KB. With Buffer input, flat <200 ns transport (`docs/BASELINE.md:29`). |
| Output size distribution | **Small.** k × (f32 distance + u32 label) = 10 × 8 B = 80 B. If returned as a `Buffer` instead of `Vec<BigInt>`: flat. |
| Reusable setup (stateful potential) | **Critical.** The index IS the state. NAPI class mandatory. Load-once-query-often is the textbook pattern. FFI shape wins here. |
| Batch-usage realism | Medium. `searchKnnBatch(queries: Buffer, k: number) → Buffer` could fire 100 queries at once — parallelizable via rayon on the Rust side. That is the only lever that could win against C++ (`hnswlib-node` has no batch API with an internal thread pool). |
| FFI-share estimate vs. Rust work | <1 % with a sensible API. Not the problem. |

## Classification reasoning

The FFI shape is impeccable — but that is not the binding constraint. The bottleneck is **the baseline** we measure against:

1. **`hnswlib-node` is not a JS competitor.** It is C++ `hnswlib` passed straight through. The inner compute loop (SIMD distance on 384 f32s, priority-queue inserts) is auto-vectorized by LLVM in both C++ and Rust. Expected speedup 0.9×–1.4×, in rare cases 1.8× when the C++ code is outdated (e.g. no AVX-512 path). That misses the Green gate of ≥2× in `docs/perf-review.md:12–14` **structurally**, not implementationally.

2. **`hnsw_rs` has no known SIMD advantage.** In published benchmarks (`hnsw_rs` README, `instant-distance` README, the ANN-benchmarks repo) I find no case in which Rust HNSW lands significantly ahead of C++ `hnswlib`. Typically within 10–30 % — measurement-noise territory.

3. **The only real lever would be a batch `searchKnnBatch` API** that runs rayon-parallel across queries. That could bring 2–4× on multi-core. But that is a **new API feature**, not a drop-in, and `hnswlib-node` users write their code against the single-query API. Portfolio question: do we want to build a package whose only win is an API variant users don't use?

4. **The DX argument alone is not enough.** `hnswlib-node` is notorious for node-gyp problems (no prebuilds for many Node/platform combinations, the v0.x series supported Node 22+ late). NAPI-RS prebuilds would be a real DX win. But the portfolio criterion is perf (`docs/perf-review.md:12–22`), not DX. If DX is the goal, forking `hnswlib-node` itself and adding prebuilds is cheaper than a re-port.

**Shape-Matching:**
- ❌ Not like `jwt` / `inflate` (a genuine Rust-vs-pure-JS baseline)
- ❌ Like `onnxruntime-node` / `faiss-node` (Rust vs. C++ native, no FFI profit margin)
- ⚠️ **But** the FFI shape itself is clean (NAPI class, long-lived); only the baseline is wrong

**Benchmark-gap flag:** This assessment was made without a spike. **If** someone runs a 1-day spike with `hnsw_rs` against `hnswlib-node` on a realistic corpus (100k vectors, dim=1536, k=10) and measures ≥2×, the NO-GO decision must be revisited. The spike would be an acceptable way to falsify the prediction — but only with the hnsw_rs config and hnswlib-node version documented.

## If GO — proposed port

Not recommended. If pursued anyway: see "Must-have benchmark scenarios" below; they must pass **before** the port.

- **Recommended crate-name:** `@amigo-labs/hnsw` (not `@amigo-labs/hnswlib-node` — not a drop-in due to the missing on-disk format compatibility)
- **Primary API sketch:**
  ```ts
  export class HnswIndex {
    constructor(opts: {
      dim: number;
      maxElements: number;
      space: 'l2' | 'ip' | 'cosine';
      m?: number;        // default 16
      efConstruction?: number;  // default 200
    });
    addPoint(vec: Float32Array | Buffer, label: number): void;
    addPointsBatch(vecs: Buffer, labels: Uint32Array): void;  // primary lever
    searchKnn(query: Float32Array | Buffer, k: number, ef?: number): { distances: Float32Array; neighbors: Uint32Array };
    searchKnnBatch(queries: Buffer, k: number, ef?: number): { distances: Buffer; neighbors: Buffer };  // primary lever
    setEf(ef: number): void;
    getCurrentCount(): number;
    save(path: string): void;  // own format, not hnswlib-compatible
    static load(path: string): HnswIndex;
  }
  ```
- **Must-have benchmark scenarios (Gate):**
  - Build: 100k × dim=1536 `addPointsBatch` — target ≥2× vs. the `hnswlib-node` loop
  - Query single: dim=1536, k=10, ef=200 — target ≥1.5× vs. `hnswlib-node.searchKnn` (Yellow threshold)
  - Query batch: 100 queries × dim=1536, k=10 — target ≥2× (Green threshold, rayon lever)
  - Cold-load: `load(path)` on a 1M-vector index — target ≤ `hnswlib-node.readIndex`
- **Acceptance thresholds (Green gate):** ≥2× on **at least two of three query scenarios** and ≥2× on the batch build. Anything below that: do not ship.
- **Risks:**
  - On-disk format incompatibility — migration path needed
  - `hnsw_rs` maintenance bus factor (one primary author)
  - Filter-callback API break
  - Binary size (hnsw_rs without deps ~2–4 MB per target, acceptable)

## If NO-GO — BACKLOG entry

```markdown
- **hnswlib-node** (~50k). Evaluated 2026-04-21 (`docs/perf-review/hnswlib-node.md`). `hnswlib-node` is itself a native C++ binding; Rust `hnsw_rs` against C++ `hnswlib` is Rust-vs-native, expected 0.9–1.4×, misses the Green gate structurally. Only worthwhile if a spike on 100k × dim=1536 measures ≥2×.
```

Section in `BACKLOG.md`: **Ruled out — AI-category (FFI-shape or structural)** — add directly next to `onnxruntime-node` and `faiss-node`. The existing "Under investigation — AI / RAG preprocessing" entry (lines 10–11) should be removed, since the "Predicted Green" prediction does not hold.
