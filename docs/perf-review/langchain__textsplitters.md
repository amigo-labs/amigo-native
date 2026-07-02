# Candidate review: `@langchain/textsplitters`

> **Status:** GO (as a new package, API inspired by langchain) · **Predicted:** 🟡 Yellow (Green at RAG scale, Yellow on tweets) · **Reviewed:** 2026-04-21
> **Shipped:** v0.1 on branch `claude/crate-performance-audit-6KLOJ` (2026-04-23). Benchmarks pending full bench suite.


## Verdict

Text splitting for RAG is an **input-size-sensitive shape**: on a 100 KB whitepaper it is cleanly Green (Unicode segmentation + regex scan + chunk reassembly); on a 280-character tweet the call itself is shorter than the FFI floor and we land in the `nanoid`/`deep-equal` trap. The BACKLOG warning hits the core of it: **must bench small bucket before committing**. A `TokenTextSplitter` variant additionally has strong coupling to `@amigo-labs/tiktoken` — there we already have a singleton NAPI class that we can wire in via shared state (the cheapest token-count path in the portfolio). The `RecursiveCharacterTextSplitter` is the main use-case (>80 % of langchain calls in production RAG) and benefits the most.

## JS package

- **npm:** [`@langchain/textsplitters`](https://www.npmjs.com/package/@langchain/textsplitters)
- **Downloads:** ~2M/week (BACKLOG figure confirmed, Q1 2026). One of the larger candidates in the portfolio scan.
- **Exports / API surface:**
  - `RecursiveCharacterTextSplitter` (primary, 80 %+ of usage): `{chunkSize, chunkOverlap, separators, keepSeparator, lengthFunction}` — tries the separator list recursively (default `["\n\n", "\n", " ", ""]`)
  - `CharacterTextSplitter`: simple split-on-a-single-separator + merge-up-to-chunkSize
  - `TokenTextSplitter`: uses `tiktoken` (js-tiktoken) for length measurement
  - `MarkdownTextSplitter`, `LatexTextSplitter`, `HTMLTextSplitter` — pre-configured `RecursiveCharacterTextSplitter` with format-specific separators
  - `.splitText(text) → string[]`, `.createDocuments(texts, metadatas) → Document[]`, `.splitDocuments(docs) → Document[]`
- **Typical input:** **one** string per call. Length strongly bimodal: either "RAG doc" (5 KB – 500 KB, median ~50 KB) or "chat message" (50 B – 5 KB, median ~500 B).
- **Typical output:** array of strings, typically 20–500 chunks for RAG docs, 1–5 chunks for small texts. Chunks ~500–2000 characters.
- **Realistic median use-case:** **RAG ingestion pipeline.** A PDF/HTML/MD has already been extracted to text (→ `pdf-parse`, `marked`, `turndown`); the text is now split into chunks for embedding generation. One `splitText()` call per document, document count 100–100 000 per ingestion job. Second case: **online chunking** in the chat flow (splitting the user message before it goes into the LLM context window). Texts there are considerably smaller, but call frequency is higher.

## Rust replacement

- **Candidate crate(s):**
  - [`text-splitter`](https://crates.io/crates/text-splitter) — **primary**. By Ben Brandt, directly inspired by langchain's TextSplitter. Has `TextSplitter`, `MarkdownSplitter`, `CodeSplitter`. Supports character- and token-based lengths. Active, MIT.
  - [`unicode-segmentation`](https://crates.io/crates/unicode-segmentation) — building block for grapheme/word boundaries. Regex engine for separator splitting: `regex` crate (BurntSushi, fast, safe).
  - Custom port: `RecursiveCharacterTextSplitter` is worth ~200 lines of algorithm — recursive descent through the separator list, greedy merge up to `chunkSize`, overlap handling during chunk assembly. Directly portable.
- **Maintenance / license:** `text-splitter` MIT, active. `unicode-segmentation` MIT, BurntSushi, standard crate. Supply chain clean.
- **Known gotchas / divergences:**
  - **`lengthFunction` callback** — langchain allows an arbitrary JS function for length measurement. That **cannot** cross the FFI boundary (callback boundary = the `xml`/object-traversal antipattern). Solution: we offer three enums: `'chars'` (default), `'tiktoken:cl100k'`, `'tiktoken:o200k'` — all three on the Rust side. A custom JS length function is unsupported (document this).
  - **`keepSeparator` semantics** — langchain v0.3+ has the keepSeparator='start'|'end'|false spelling. Must be matched exactly, otherwise chunks rank differently in retrieval.
  - **Markdown/HTML separator profiles** — langchain has very long separator arrays for MD/HTML/LaTeX. Parity on the strings is trivial, but the ORDER matters (the recursive splitter tries them in order).
  - **`createDocuments` metadata shape** — passing metadata objects across the FFI boundary is tedious. We offer only `splitText(text) → string[]` as the hot path; the user constructs Documents in JS after the split returns.

## BACKLOG check

Existing entry: `BACKLOG.md:26`:
> **@langchain/textsplitters** (~2M). Recursive character + token-aware splitters via `unicode-segmentation` plus custom logic. Green on RAG-scale documents, Red on tweet-sized chunks — must bench small bucket before committing.

Categorized as "Predicted Yellow". Review confirms: Yellow is the right prediction, with a Green upgrade path if the RAG median case consistently hits ≥2×.

Scope boundaries:
- Versus `docs/perf-review/pdf-parse.md`: text extraction delivers the input; we split it. Sequential in the same pipeline, so the packages form a natural set.
- Versus `docs/perf-review/tiktoken.md`: the `TokenTextSplitter` variant is the integration point. Our `@amigo-labs/tiktoken` already has the singleton NAPI class — we call it directly Rust-internally, with **no** second FFI crossing per chunk-length check.

No entry in `docs/packages.json`.

## FFI-overhead prediction

| Factor | Assessment |
|---|---|
| Per-call algorithmic work | **Bimodal.** Tweet (500 B → 1–2 chunks): ~5–20 µs in JS, FFI floor 109 ns = ~1 % (tolerable) but the Rust-work delta is thin. 50 KB doc → 100 chunks: ~500 µs – 2 ms in JS, Rust ~50–200 µs → **>5× speedup realistic**. 500 KB doc → 1000 chunks: ~5–20 ms JS, Rust ~500 µs – 2 ms → **≥10× speedup**. |
| Input size distribution | **String input.** 500 B – 500 KB. UTF-16→UTF-8 conversion costs ~0.35 ns/byte (BASELINE.md:27). 500 KB = 175 µs transport. For a 500 KB doc that is ≤10 % of the Rust compute — OK. For a 50 KB doc (median): 17 µs transport on ~100 µs compute = **17 %**, borderline but still Green. |
| Output size distribution | **`Vec<String>` output** — a known FFI cost trap. 100 chunks × ~1 KB = 100 strings to marshal. Per-string overhead ~180 ns + UTF-8→UTF-16 conversion. Rough overhead: 100 × 180 ns + 100 KB × 0.35 ns/byte = **53 µs**. For a 500 KB doc that is OK. For a 5 KB doc (few chunks) even better. **Alternative**: `splitTextToBuffer(text) → Buffer` with an internal NDJSON format, one conversion. A fast-follow lever for extreme cases. |
| Reusable setup (stateful potential) | **Medium.** Config (chunkSize, separators, stemmer) could be cached in a `Splitter` class. Regex compilation for separator patterns is non-trivial (~µs) and should definitely NOT happen per call. Recommendation: class API with the config in the constructor. |
| Batch-usage realism | **High.** RAG ingestion splits 10k-100k docs. `splitTextsBatch(texts: string[]) → string[][]` is the obvious lever. Rayon-parallelizable (embarrassingly so — each doc is independent). |
| FFI-share estimate vs. Rust work | 500 KB doc: <5 % (Green). 50 KB doc: ~20 % (borderline Green). 500 B doc: ~50 % (Yellow/Red). |

## Classification reasoning

`@langchain/textsplitters` is an **input-size-dependent shape**, and the classification depends on which median case we prioritize:

1. **The RAG-ingestion use-case is Green.** Documents from 10 KB upward provide enough Rust compute to amortize the FFI. The `text-splitter` crate + `regex` crate should deliver 5–15× against pure-JS splitters. That is our main sell — the 2M downloads come largely from RAG pipelines.

2. **Online chat chunking is Yellow.** Short user messages (200–2000 characters) sit in the borderline zone. Rust work on 1 KB is ~20–50 µs, FFI overhead (input UTF conversion + output Vec<String>) ~5–10 µs = **20–30 % overhead share**. Speedup probably 1.5–2×, classified Yellow. Not Red, because `lengthFunction` in JS (the chat use-case often uses token-based length via `tiktoken`) itself costs ~50 µs and we make that cheaper Rust-internally.

3. **The trap category (tweets, 50-char strings) must be explicitly out of scope.** If someone calls `splitText("Hello world")`, it costs more FFI than compute. We document: "for inputs <500 characters, use the string directly" and point to the benchmark table.

4. **`TokenTextSplitter` is the killer sub-case.** On the langchain side it has a JS→WASM crossing (`js-tiktoken` or `tiktoken` WASM) PLUS the text split. We can do both on the Rust side — potentially a 5–20× speedup because we collapse the two-boundary problem.

5. **Design the callbacks out.** The `lengthFunction` parameter has to go. Replacement: an enum. The callback-boundary killer is non-negotiable — see the `xml` lesson (`docs/post-mortems/xml.md`).

**Shape matching:**
- ✅ Like `sanitize-html` (regex scan + reassembly, string-heavy, Green on the median)
- ✅ Like `commonmark` (package category with format variants — MD/HTML/LaTeX splitters, like `commonmark` vs `gfm`)
- ⚠️ Like `csv` (input-size-bimodal — `csv`'s small bucket was borderline too and was rescued by `parseToJson` over Buffer; a similar lever exists here with Buffer output)
- ❌ Not like `mime` (not lookup-style — a real parser)
- ❌ Not like `deep-equal` (input long enough that Rust compute dominates the FFI — for the median case)

**Benchmark-gap flag:** Three buckets must be measured (tweet / chat message / RAG doc). A gate failure on the tweet bucket is a documentation matter (a Black flag for callers), not a package kill — if chat + RAG both hit ≥2×, the port is Green.

## If GO — proposed port

- **Recommended crate-name:** `@amigo-labs/text-splitters` (plural like langchain, and `-splitters` instead of `-textsplitters` for clarity in the `@amigo-labs/*` namespace)
- **Primary API sketch:**
  ```ts
  export type LengthMode = 'chars' | { tiktoken: 'cl100k_base' | 'o200k_base' | 'p50k_base' };

  export interface SplitterConfig {
    chunkSize: number;
    chunkOverlap: number;
    separators?: string[];
    keepSeparator?: 'start' | 'end' | false;
    lengthMode?: LengthMode;  // replaces lengthFunction
  }

  export class RecursiveCharacterTextSplitter {
    constructor(config: SplitterConfig);
    splitText(text: string): string[];
    splitTextsBatch(texts: string[]): string[][];
    splitTextToBuffer(text: string): Buffer;  // NDJSON, for hot paths
  }

  export class MarkdownTextSplitter extends RecursiveCharacterTextSplitter { /* preset */ }
  export class HTMLTextSplitter extends RecursiveCharacterTextSplitter { /* preset */ }
  export class LatexTextSplitter extends RecursiveCharacterTextSplitter { /* preset */ }
  export class CodeSplitter extends RecursiveCharacterTextSplitter {
    constructor(config: SplitterConfig & { language: 'typescript' | 'python' | 'rust' | ... });
  }
  ```
- **Must-have benchmark scenarios (Gate):**
  - **Tweet (500 B → ~1 chunk):** bench run, 10k iterations. Target ≥1.0× vs. langchain (parity is OK, not the primary win case)
  - **Chat message (5 KB → ~3 chunks):** target ≥1.5× (Yellow threshold)
  - **RAG doc small (50 KB → ~50 chunks):** target ≥3× (Green threshold, main case)
  - **RAG doc large (500 KB → ~500 chunks):** target ≥5×
  - **Batch 100 × RAG docs 50 KB:** target ≥6× (rayon lever)
  - **TokenTextSplitter cl100k on 50 KB:** target ≥5× vs. langchain + `js-tiktoken`
- **Acceptance thresholds (Green gate):** ≥3× on RAG-small AND ≥5× on RAG-large AND ≥1× on tweet. Chat message does not have to be Green — if Yellow, we document the chat use-case as "Yellow path, adds overhead below 5 KB".
- **Risks:**
  - **Parity of the separator recursion order** — langchain has historically reshuffled the separator list between major versions. We pin to v0.3 and document divergences
  - **`lengthFunction` breaking change** — users with a custom JS lengthFunction cannot migrate. Document as an acceptable scope restriction
  - **Coupling to `@amigo-labs/tiktoken`** — `TokenTextSplitter` requires the tiktoken backend to live in the same NAPI process. Architecture: a Cargo workspace dependency on the `tiktoken` crate (not an npm dependency on `@amigo-labs/tiktoken`)
  - **Binary size** — primarily `regex` + `unicode-segmentation` + `text-splitter`, all compact. Expectation: ~1–2 MB per target, unproblematic
  - **langchain semver instability** — langchain v0.3.x is current, v0.4 is coming. We pin to the v0.3 API and must document divergences from v0.4 onward

## If NO-GO — BACKLOG entry

Not applicable (GO recommendation).

Section in `BACKLOG.md`: **Under investigation — AI / RAG preprocessing** → entry stays, status update to "Reviewed GO 2026-04-21 (Yellow-predicted, Green at RAG scale). Must bench tweet/chat/rag buckets before commit. Design the callback out: `lengthFunction` → enum."
