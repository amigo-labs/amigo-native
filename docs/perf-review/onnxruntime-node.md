# Candidate review: `onnxruntime-node` / `faiss-node`

> **Status:** NO-GO · **Predicted:** ⚫ Black · **Reviewed:** 2026-04-21

## Verdict

Both packages are already **native C++ bindings** (ONNX Runtime and Facebook Faiss), wrapped via node-addon-api. A re-wrap via NAPI-RS would run Rust bindings against the same C++ core libraries — zero perf gain possible. Exactly the same lesson as `hnswlib-node` (re-categorised on 2026-04-21): Rust code is not faster than optimised C++ code when both implement the same algorithm. And for `onnxruntime-node` the actual compute is in C++ / CUDA / CoreML anyway — our binding would save milliseconds against second-long inference calls = statistical noise.

## JS package

- **npm:**
  - [`onnxruntime-node`](https://www.npmjs.com/package/onnxruntime-node) (~400k/week) — official Microsoft binding to ONNX Runtime C++
  - [`faiss-node`](https://www.npmjs.com/package/faiss-node) (~10k/week) — binding to Facebook Faiss C++
- **Downloads:** ~410k/week combined (BACKLOG figure confirmed)
- **Exports / API surface:**
  - `onnxruntime-node`: `InferenceSession.create(path)` + `.run(feeds)` — one inference call invokes the C++ model forward
  - `faiss-node`: `new IndexFlatL2(d)` + `.add(vectors)` + `.search(vector, k)` — vector index with search
- **Typical input:** Model path (loaded once), input tensors (per call). For an embedding model: 1 text → 1 f32 vector of dimension D.
- **Typical output:** Output tensor(s), typically f32 arrays.
- **Realistic median use case:** **Embedding generation** (text → vector), **classification**, **re-ranking**. Inference time dominates: 10 ms – 2 s per call depending on model size. FFI overhead is in the <1 % range for **any** binding variant.

## Rust replacement

- **Candidate crate(s):**
  - `ort` (ONNX Runtime Rust binding) — exactly the same C++ lib under the hood
  - `faiss-rs` or a direct binding via `cxx` / `autocxx` — same C++ lib again
- **Maintenance / license:** Both active. But: they wrap the same C++ libraries that the npm packages do.
- **Known gotchas / divergences:** **None algorithmically** — same C++ engine. Only API-shape differences between npm and the Rust binding.

## BACKLOG check

Existing entry in `BACKLOG.md` → "Ruled out — AI-category": "Already native bindings over C++ libraries — re-wrapping a wrapper adds maintenance without speedup." Review formalises and archives.

Boundary:
- vs. `docs/perf-review/hnswlib-node.md` (NO-GO, 2026-04-21): **identical category**. hnswlib-node, onnxruntime-node, faiss-node are three instances of the same lesson — "native wrapper of a C++ lib, no Rust margin to be had."
- vs. `docs/perf-review/xenova-transformers.md` (if created): @xenova/transformers wraps onnxruntime-node — one more layer above. See there.

## FFI-overhead prediction

| Factor | Assessment |
|---|---|
| Per-call algorithmic work | **Massive.** Inference 10 ms – 2 s. FFI share (100–200 ns) is <0.001 %. |
| Input size distribution | Tensor as Float32Array: zero-copy via TypedArray buffer. Flat. |
| Output size distribution | Tensor as Float32Array: zero-copy. Flat. |
| Reusable setup (stateful potential) | **Central.** Model load on startup, many inference calls afterwards. Exactly what the npm binding already does. |
| Batch usage realism | Yes, as a Rust-side `run_batch(inputs)` — but onnxruntime-node already has it, and the win would come from C++-side batch inference, not from eliminating FFI. |
| FFI-share estimate vs. Rust work | <0.001 % in every scenario. **But** that means: a Rust port has **no** measurable gain over the npm original. |

## Classification reasoning

1. **Both packages are already native C++.** onnxruntime-node uses ONNX Runtime C++ (Microsoft, SIMD-accelerated, GPU-capable via CUDA/DirectML/CoreML). faiss-node uses Facebook Faiss C++ (highly optimised for vector similarity search). No JS code on the hot path.

2. **Rust bindings wrap the same C++ libs.** `ort` is a Rust wrapper around ONNX Runtime C++. `faiss-rs` around Faiss C++. **No** Rust implementation is algorithmically faster.

3. **No reason for us to be a wrapper of a wrapper.** The npm originals are maintained by Microsoft / Meta, ship full platform coverage, CUDA support, and ±complete parity with the C++ upstream. Our `@amigo-labs/onnxruntime` would be a fourth wheel with no unique selling point beyond "now wrapped in Rust."

4. **DX argument doesn't bite.** onnxruntime-node has reliable prebuilts. faiss-node has known build issues on some platforms — but the fix is **fork-and-add-prebuilds**, not a Rust re-implementation.

**Shape matching:**
- 🔁 Like `hnswlib-node` (ruled out 2026-04-21, exactly the same lesson)
- 🔁 Like re-wrapping any established C++ lib — no gain

**Benchmark-gap flag:** No spike needed. Anyone running a microbench will measure measurement noise.

## If NO-GO — BACKLOG entry

Archived 2026-04-21. Full review: `docs/perf-review/onnxruntime-node.md`. Precedent: `docs/perf-review/hnswlib-node.md`.
