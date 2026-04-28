# Candidate review: `@xenova/transformers` (`transformers.js`)

> **Status:** NO-GO · **Predicted:** ⚫ Black · **Reviewed:** 2026-04-21

## Verdict

`@xenova/transformers` is an **abstraction layer above** ONNX Runtime Web (for browsers) and ONNX Runtime Node (for servers). It emulates the Hugging-Face Transformers Python API with pipelines (`pipeline('sentiment-analysis')`), tokenizer-spec parity (BPE / WordPiece / SentencePiece), and pre/post-processing. The **actual compute** (model forward pass) runs inside ORT C++ / WASM — and ORT itself is archived as NO-GO in `docs/perf-review/onnxruntime-node.md`. A port here would:

1. Not solve the ORT-backend question (still C++-wrapped).
2. Have to emulate a **parity-rich Python API** (a hundred pipelines, a dozen tokenizer algorithms).
3. Compete with the upstream (Xenova / Hugging Face) which chases weekly spec updates.

That combines the `onnxruntime-node` Black shape (native wrapper) with the `langchain` parity tail (spec-driven surface).

## JS package

- **npm:** [`@xenova/transformers`](https://www.npmjs.com/package/@xenova/transformers)
- **Downloads:** ~500k/week (BACKLOG figure confirmed)
- **Exports / API surface:**
  - `pipeline(task, model?, options?)` → high-level task runner. Tasks: `'text-classification'`, `'token-classification'`, `'feature-extraction'`, `'fill-mask'`, `'summarization'`, `'translation'`, `'text-generation'`, `'image-classification'`, `'automatic-speech-recognition'`, `'object-detection'`, ... 20+ tasks
  - Direct access: `AutoModel`, `AutoTokenizer`, `AutoProcessor`, `AutoConfig` — load models and tokenizers
  - Tokenizer families: `BpeTokenizer`, `WordPieceTokenizer`, `SentencePieceBpeTokenizer`, `UnigramTokenizer`, plus all model-specific subclasses (BERT, GPT-2, Llama, Whisper, etc.)
- **Typical input:** Depends on task — text, image buffer, audio samples
- **Typical output:** Depends on task — scores, embeddings, generated text, transcription
- **Realistic median use case:** **Browser-side ML** is the actual use case of transformers.js (WASM-ORT in the browser). The Node use case is secondary (one would normally use Python / ORT directly for server inference). Inference time dominates (hundreds of milliseconds – seconds).

## Rust replacement

- **Candidate crate(s):** There is **no** full-transformers-parity Rust crate. `ort`-Rust wraps ORT itself, `candle-transformers` (Hugging Face) is pure Rust but a different API and different model coverage. A port would be our own code, ~10 000 LOC, hundreds of tokenizer spec details.
- **Maintenance / license:** n/a (no direct candidate)
- **Known gotchas / divergences:** **Complete parity** with Hugging-Face Python Transformers is the entire reason transformers.js exists. We can't match it without massive ongoing effort.

## BACKLOG check

Existing entry in `BACKLOG.md` → "Ruled out — AI-category": "ORT-WASM based, spec-driven parity surface, bound by ORT not by us." Review formalises and archives.

Boundary:
- vs. `docs/perf-review/onnxruntime-node.md` (⚫): xenova-transformers is an abstraction ABOVE that. The problem is one level worse (double-wrapping trap plus spec parity).
- vs. `docs/perf-review/langchain.md` (if created) / BACKLOG `langchain`: spec-driven parity surface is the same type.
- vs. `docs/perf-review/tiktoken.md` (🟢 shipped): related — the tokenizer part **is** potentially portable per model family (the way we did the OpenAI BPE in `@amigo-labs/tiktoken`). But that is **not** "porting @xenova/transformers" — it would be "one separate @amigo-labs package per new model tokenizer pattern." Different portfolio scale.

## FFI-overhead prediction

| Factor | Assessment |
|---|---|
| Per-call algorithmic work | **Massive** — model forward is the 99 % cost driver, runs in the ORT backend. Preprocess / tokenise is <1 %. |
| Input size distribution | Text inputs, image buffers. |
| Output size distribution | Embeddings / scores / strings. |
| Reusable setup (stateful potential) | **Maximal** — model load once, many inferences. Tokenizer build once, many encode calls. |
| Batch usage realism | Yes, but only relevant if ORT supports batches (it does). Our port adds no lever here. |
| FFI-share estimate vs. Rust work | <1 %. Not the problem — the win margin is the problem (~0). |

## Classification reasoning

1. **The 99 % hot path is ORT-backend inference.** That is C++ / WASM and no Rust port moves the numbers.

2. **Tokenizer parity would be a month of work.** transformers.js implements BPE, WordPiece, SentencePiece Unigram, SentencePiece BPE, plus model-specific pre/post-processing. Hugging Face maintains these spec details continuously. The Rust `tokenizers` crate (from HF themselves!) is the best option — but then we're again just re-wrapping existing native code.

3. **Hugging Face already has `tokenizers` (Rust).** The Rust core for tokenisation exists and HF maintains it. We have no need to re-wrap it.

4. **The pipeline abstraction is Python-API emulation.** Useful for browsers (where Python isn't available). Node-server users tend to drive Python directly or use a serving layer like Triton.

**Shape matching:**
- 🔁 Like `onnxruntime-node` (wrapped native)
- 🔁 Like `langchain` (spec-driven parity, unbounded surface)
- ❌ Not like `@amigo-labs/tiktoken` (we ported a **single** tokenizer pattern — cl100k_base, o200k — not the full tokenizer family)

**Benchmark-gap flag:** Not required. Architecture problem.

## If NO-GO — BACKLOG entry

Archived 2026-04-21. Full review: `docs/perf-review/xenova-transformers.md`.
