# Candidate review: `@xenova/transformers` (`transformers.js`)

> **Status:** NO-GO · **Predicted:** ⚫ Black · **Reviewed:** 2026-04-21

## Verdict

`@xenova/transformers` ist eine **Abstraktionsschicht oberhalb** von ONNX Runtime Web (für Browser) und ONNX Runtime Node (für Server). Sie emuliert Hugging-Face-Transformers-Python-API mit Pipelines (`pipeline('sentiment-analysis')`), Tokenizer-Spec-Parity (BPE/WordPiece/SentencePiece), und Pre/Post-Processing. Der **eigentliche Compute** (Model-Forward-Pass) läuft in ORT C++/WASM — und ORT selbst ist in `docs/perf-review/onnxruntime-node.md` als NO-GO archiviert. Ein Port hier würde:

1. Die ORT-Backend-Frage nicht lösen (immer noch C++-wrapped).
2. Eine **parity-reiche Python-API** emulieren müssen (hundert Pipelines, dutzend Tokenizer-Algorithmen).
3. Sich gegen den Upstream (Xenova/Hugging Face) profilieren, der wöchentliche Spec-Updates nachzieht.

Das kombiniert die `onnxruntime-node`-Black-Shape (Native-Wrapper) mit dem `langchain`-Parity-Tail (Spec-driven Surface).

## JS package

- **npm:** [`@xenova/transformers`](https://www.npmjs.com/package/@xenova/transformers)
- **Downloads:** ~500k/Woche (BACKLOG-Zahl bestätigt)
- **Exports / API surface:**
  - `pipeline(task, model?, options?)` → high-level Task-Runner. Tasks: `'text-classification'`, `'token-classification'`, `'feature-extraction'`, `'fill-mask'`, `'summarization'`, `'translation'`, `'text-generation'`, `'image-classification'`, `'automatic-speech-recognition'`, `'object-detection'`, ... 20+ Tasks
  - Direct Access: `AutoModel`, `AutoTokenizer`, `AutoProcessor`, `AutoConfig` — lädt Modelle und Tokenizer
  - Tokenizer-Familien: `BpeTokenizer`, `WordPieceTokenizer`, `SentencePieceBpeTokenizer`, `UnigramTokenizer`, plus alle Model-Specific Subklassen (BERT, GPT-2, Llama, Whisper, etc.)
- **Typical input:** Je nach Task — Text, Image-Buffer, Audio-Samples
- **Typical output:** Je nach Task — Scores, Embeddings, Generated-Text, Transcription
- **Realistic median use-case:** **Browser-side ML** ist der eigentliche Use-Case von transformers.js (WASM-ORT im Browser). Node-Use-Case ist sekundär (man würde normalerweise direkt Python/ORT für Server-Inference nutzen). Inference-Time dominiert (hundert Millisekunden – Sekunden).

## Rust replacement

- **Candidate crate(s):** Es gibt **keine** Full-Transformers-Parity-Rust-Crate. `ort`-Rust wrappt ORT selbst, `candle-transformers` (Huggingface) ist Pure-Rust aber andere API und andere Model-Coverage. Ein Port würde eigener Code sein, ~10 000 LOC, hunderte Tokenizer-Spec-Details.
- **Maintenance / license:** n/a (kein direkter Kandidat)
- **Known gotchas / divergences:** **Komplette Parity** mit Hugging-Face-Python-Transformers ist die Existenz-Berechtigung von transformers.js. Wir können das nicht ohne massiven Ongoing-Aufwand matchen.

## BACKLOG check

Vorhandener Eintrag in `BACKLOG.md` → "Ruled out — AI-category": "ORT-WASM based, spec-driven parity surface, bound by ORT not by us." Review formalisiert und archiviert.

Abgrenzung:
- Gegen `docs/perf-review/onnxruntime-node.md` (⚫): xenova-transformers ist eine Abstraktion DARÜBER. Das Problem ist eine Ebene schlimmer (doppelte Wrapping-Falle plus Spec-Parity).
- Gegen `docs/perf-review/langchain.md` (falls erstellt) / BACKLOG-`langchain`: Spec-driven Parity-Surface ist der gleiche Typus.
- Gegen `docs/perf-review/tiktoken.md` (🟢 shipped): Zusammenhang — der Tokenizer-Teil **ist** potentiell portbar pro Model-Familie (wie wir es für OpenAI-BPE mit `@amigo-labs/tiktoken` getan haben). Aber das ist **nicht** "@xenova/transformers porten" — das ist "für jedes neue Model-Tokenizer-Pattern ein eigenes @amigo-labs-Paket." Portfolio-Maßstab anders.

## FFI-overhead prediction

| Factor | Assessment |
|---|---|
| Per-call algorithmic work | **Massiv** — Model-Forward ist der 99 %-Kostenpunkt, läuft in ORT-Backend. Preprocess/Tokenize ist <1 %. |
| Input size distribution | Text-Inputs, Image-Buffers. |
| Output size distribution | Embeddings / Scores / Strings. |
| Reusable setup (stateful potential) | **Maximal** — Model-Load einmal, viele Inference. Tokenizer-Build einmal, viele Encode-Calls. |
| Batch-usage realism | Ja, aber nur relevant wenn ORT Batch unterstützt (tut es). Unser Port bringt keinen Hebel hier. |
| FFI-share estimate vs. Rust work | <1 %. Nicht das Problem — Gewinn-Margin ist das Problem (~0). |

## Classification reasoning

1. **Der 99 %-Hot-Path ist ORT-Backend-Inference.** Das ist C++/WASM und kein Rust-Port drückt die Zahlen.

2. **Tokenizer-Parity wäre Month-of-Work.** transformers.js implementiert BPE, WordPiece, SentencePiece-Unigram, SentencePiece-BPE, plus Model-Specific-Pre/Post-Processing. Huggingface pflegt diese Spec-Detail laufend. Rust-`tokenizers` crate (von HF selbst!) ist die beste Option — aber dann sind wir wieder nur Re-Wrapper eines bestehenden native-Codes.

3. **Huggingface hat bereits `tokenizers` (Rust).** Der Rust-Core für Tokenization existiert und HF pflegt ihn. Uns fehlt der Bedarf, das zu rewrappen.

4. **Pipeline-Abstraction ist Python-API-Emulation.** Sinnvoll für Browser (wo Python nicht verfügbar ist). Node-Server-User fahren eher direkt Python oder nutzen Serving-Layer wie Triton.

**Shape-Matching:**
- 🔁 Wie `onnxruntime-node` (wrapped native)
- 🔁 Wie `langchain` (spec-driven parity, unbounded surface)
- ❌ Nicht wie `@amigo-labs/tiktoken` (wir portierten ein **einzelnes** Tokenizer-Pattern — cl100k_base, o200k — nicht die ganze Tokenizer-Familie)

**Benchmark-Gap-Flag:** Nicht erforderlich. Architektur-Problem.

## If NO-GO — BACKLOG entry

Archiviert 2026-04-21. Full review: `docs/perf-review/xenova-transformers.md`.
