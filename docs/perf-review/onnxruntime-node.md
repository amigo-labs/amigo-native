# Candidate review: `onnxruntime-node` / `faiss-node`

> **Status:** NO-GO · **Predicted:** ⚫ Black · **Reviewed:** 2026-04-21

## Verdict

Beide Pakete sind bereits **native C++-Bindings** (ONNX Runtime und Facebook-Faiss), wrapped via node-addon-api. Ein Re-Wrap via NAPI-RS läuft Rust-Bindings gegen dieselben C++-Kern-Libraries — Null Perf-Gewinn möglich. Exakt dieselbe Lehre wie `hnswlib-node` (2026-04-21 re-kategorisiert): Rust-Code ist nicht schneller als optimierter C++-Code wenn sie denselben Algorithmus implementieren. Und für `onnxruntime-node` ist der eigentliche Compute ohnehin in C++/CUDA/CoreML — unser Binding würde Millisekunden-auf-Millisekunden sparen gegen Sekunden-long-Inference-Calls = statistisches Rauschen.

## JS package

- **npm:**
  - [`onnxruntime-node`](https://www.npmjs.com/package/onnxruntime-node) (~400k/Woche) — offizielles Microsoft-Binding zu ONNX Runtime C++
  - [`faiss-node`](https://www.npmjs.com/package/faiss-node) (~10k/Woche) — Binding zu Facebook-Faiss C++
- **Downloads:** ~410k/Woche kombiniert (BACKLOG-Zahl bestätigt)
- **Exports / API surface:**
  - `onnxruntime-node`: `InferenceSession.create(path)` + `.run(feeds)` — ein-Inference-Call ruft C++-Model-Forward
  - `faiss-node`: `new IndexFlatL2(d)` + `.add(vectors)` + `.search(vector, k)` — Vector-Index mit Search
- **Typical input:** Model-Path (einmal laden), Input-Tensoren (pro Call). Für Embedding-Model: 1 Text → 1 f32-Vector der Dimension D.
- **Typical output:** Output-Tensor(en), typisch f32-Arrays.
- **Realistic median use-case:** **Embedding-Generation** (Text → Vector), **Classification**, **Re-Ranking**. Inference-Time dominiert: 10 ms – 2 s pro Call je nach Modellgröße. FFI-Overhead ist im <1 %-Bereich **jeder** Binding-Variante.

## Rust replacement

- **Candidate crate(s):**
  - `ort` (ONNX Runtime Rust binding) — genau dieselbe C++-Lib unter der Haube
  - `faiss-rs` oder direkter Binding über `cxx`/`autocxx` — wieder dieselbe C++-Lib
- **Maintenance / license:** Beide aktiv. Aber: Sie wrappen dieselben C++-Libraries wie die npm-Pakete.
- **Known gotchas / divergences:** **Keine algorithmischen** — dieselbe C++-Engine. Lediglich API-Shape-Unterschiede zwischen npm und Rust-Binding.

## BACKLOG check

Vorhandener Eintrag in `BACKLOG.md` → "Ruled out — AI-category": "Already native bindings over C++ libraries — re-wrapping a wrapper adds maintenance without speedup." Review formalisiert und archiviert.

Abgrenzung:
- Gegen `docs/perf-review/hnswlib-node.md` (NO-GO, 2026-04-21): **identische Kategorie**. Hnswlib-node, onnxruntime-node, faiss-node sind drei Instanzen derselben Lehre — "nativer-Wrapper einer C++-Lib, keine Rust-Gewinnmarge."
- Gegen `docs/perf-review/xenova-transformers.md` (falls erstellt): @xenova/transformers wrapped onnxruntime-node — noch eine Ebene darüber. Siehe dort.

## FFI-overhead prediction

| Factor | Assessment |
|---|---|
| Per-call algorithmic work | **Massiv.** Inference 10 ms – 2 s. FFI-Share (100–200 ns) ist <0,001 %. |
| Input size distribution | Tensor als Float32Array: zero-copy via TypedArray-Buffer. Flat. |
| Output size distribution | Tensor als Float32Array: zero-copy. Flat. |
| Reusable setup (stateful potential) | **Zentral.** Model-Load beim Start, viele Inference-Calls danach. Genau das, was npm-Binding bereits tut. |
| Batch-usage realism | Ja, als Rust-seitiger `run_batch(inputs)` — aber onnxruntime-node hat das bereits, und der Gewinn käme von C++-Batch-Inference, nicht von FFI-Elimination. |
| FFI-share estimate vs. Rust work | <0,001 % in allen Szenarien. **Aber** das bedeutet: Rust-Port hat **keinen** messbaren Gewinn über npm-Original. |

## Classification reasoning

1. **Beide Pakete sind bereits native C++.** onnxruntime-node nutzt ONNX Runtime C++ (Microsoft, SIMD-accelerated, GPU-fähig via CUDA/DirectML/CoreML). faiss-node nutzt Facebook-Faiss C++ (hochoptimiert für Vector-Similarity-Search). Kein JS-Code im Hot-Path.

2. **Rust-Bindings wrappen dieselben C++-Libs.** `ort` ist ein Rust-Wrapper um ONNX Runtime C++. `faiss-rs` um Faiss C++. **Keine** Rust-Implementation ist algorithmisch schneller.

3. **Wir haben keinen Grund, ein Wrapper von einem Wrapper zu sein.** Die npm-Originale sind von Microsoft/Meta gewartet, haben vollständige Plattform-Coverage, CUDA-Support, plus-minus vollständige Parity mit dem C++-Upstream. Unser `@amigo-labs/onnxruntime` wäre ein viertes Rad am Wagen mit keinem Unique-Selling-Point außer "wurde in Rust gewrapped."

4. **DX-Argument greift nicht.** onnxruntime-node hat zuverlässige Prebuilds. faiss-node hat bekannte Build-Probleme auf manchen Plattformen — aber das löst man durch **Fork-and-Add-Prebuilds**, nicht durch Rust-Re-Implementation.

**Shape-Matching:**
- 🔁 Wie `hnswlib-node` (2026-04-21 ruled out, same lesson exactly)
- 🔁 Wie Re-Wrapping jeder etablierten C++-Lib — kein Gewinn

**Benchmark-Gap-Flag:** Kein Spike nötig. Wenn jemand einen Microbench fährt, wird er das Messrauschen messen.

## If NO-GO — BACKLOG entry

Archiviert 2026-04-21. Full review: `docs/perf-review/onnxruntime-node.md`. Präzedenzfall: `docs/perf-review/hnswlib-node.md`.
