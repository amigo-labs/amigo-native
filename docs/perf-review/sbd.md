# Candidate review: `sbd` — Sentence Boundary Detection

> **Status:** GO (as a new package `@amigo-labs/sentences`, with the offset-based zero-copy API as the core lever) · **Predicted:** 🟡 Yellow leaning 🟢 (with the offset API), 🟡 Yellow (with the strings-array API) · **Reviewed:** 2026-04-21
> **Shipped:** v0.1 on branch `claude/crate-performance-audit-6KLOJ` (2026-04-23). Benchmarks pending full bench suite.


## Verdict

Sentence boundary detection is **rule-based** (abbreviation list + quote/ellipsis heuristics + UTF-8-aware tokenization) and has exactly the right compute magnitude for FFI wins on paragraph inputs: ~50–500 µs of Rust work per call, and the input is a single string. The crux is the **output shape**. If we return `Vec<String>` (100–500 sentences × marshalling cost), we partially eat the Rust win back — Yellow range. If we build an **offset-based API** as the main path (`splitToOffsets(text) → Uint32Array`), the FFI crossing stays flat and the JS side can slice lazily. That is the `xxhash` lesson (Buffer output instead of Vec<BigInt>) applied to segment offsets. Parity against `sbd` on the abbreviation table is tractable — `sbd` is small and well documented — but will not be bit-exact. Parity against **Pragmatic Segmenter** (the Ruby reference behind `sbd`) is the realistic target.

## JS package

- **npm:** [`sbd`](https://www.npmjs.com/package/sbd)
- **Downloads:** ~200k/week (BACKLOG figure confirmed, Q1 2026)
- **Exports / API surface:**
  - `sbd.sentences(text, options?) → string[]`
  - Options: `newline_boundaries`, `html_boundaries`, `html_boundaries_tags`, `sanitize`, `allowed_tags`, `preserve_whitespace`, `abbreviations`
  - No stateful API, no callbacks
- **Typical input:** paragraph/document. 100 B – 100 KB. Median 2–20 KB (a typical blog article / news text)
- **Typical output:** array of sentence strings. Typically 5–500 sentences of 50–300 characters each
- **Realistic median use-case:** **NLP preprocessing** — text → sentences for (a) embedding-per-sentence (RAG fine-grain retrieval), (b) translation-per-sentence (chunk-granular translate), (c) summarization input splitting, (d) sentence-level classification (sentiment). In all cases: **one call per document**, document count variable (online ~1/user action, batch ~1k–100k/job).

## Rust replacement

- **Candidate crate(s):**
  - [`pragmatic-segmenter`](https://crates.io/crates/pragmatic-segmenter) — **primary.** Rust port of the Ruby `pragmatic_segmenter` (the reference implementation that `sbd` uses as inspiration). MIT, ~2k⭐ from the research community, but **maintenance status worth checking as of Q1 2026** (last commits older than 6 months at last check). If unmaintained: fork or write our own implementation.
  - [`rust-nlp`](https://crates.io/search?q=rust-nlp) sentence splitters are fragmented; no dominant crate.
  - [`unicode-segmentation`](https://crates.io/crates/unicode-segmentation) — building block for grapheme-cluster boundaries (UTF-8-aware tokenization).
  - **Custom port**: `sbd` itself is <500 lines of JS, directly portable. Plus `pragmatic_segmenter`'s abbreviation table (public domain, ~2000 entries). Total ~1500 lines of Rust — tractable.
  - [`nnsplit`](https://crates.io/crates/nnsplit) — ML-based approach (ONNX model). Disqualified for binary-size + reproducibility reasons (ML model updates = divergences per release).
- **Maintenance / license:** `pragmatic-segmenter` MIT, maintenance state to be verified. If there are issues: fork or own implementation. Supply chain is clean with a custom port.
- **Known gotchas / divergences:**
  - **Abbreviation list** — `sbd` has a built-in English set (~400 entries) plus a user-custom list. `pragmatic_segmenter` has language-specific lists for 12+ languages (~2000 total). We ship the `pragmatic_segmenter` set as the default. Divergence from `sbd` on edge cases with unusual abbreviations.
  - **HTML handling.** `sbd` has `html_boundaries` and `allowed_tags` — we pull that out of scope (HTML sanitization is `@amigo-labs/sanitize-html`'s job, no duplicated logic). Document as: "preprocess your HTML to plain text first."
  - **Newline semantics.** Whether `\n\n` is a sentence boundary depends on the `newline_boundaries` option. We match that 1:1.
  - **Quote balancing** — "He said 'Hello. World.'" must NOT split after "Hello." when inside a quote. This is one of the places where implementations diverge.
  - **`preserve_whitespace`.** `sbd` has an option to trim or keep whitespace. Parity-relevant for downstream tools that rely on exact offsets.

## BACKLOG check

Existing entry: `BACKLOG.md:30`:
> **sbd** — sentence boundary detection (~200k). `pragmatic_segmenter`-style Rust. Parity with Pragmatic's abbreviation rules is real work but tractable.

The BACKLOG analysis is accurate. The review confirms: parity is tractable, but the output shape is the more hidden lever.

Scope boundaries:
- Against `docs/perf-review/langchain__textsplitters.md`: sentence splitting is **one** text-splitting approach (char-based is the other). `@langchain/textsplitters.MarkdownTextSplitter` uses sentence-aware logic internally. Integration is conceivable — if we build both packages, `@amigo-labs/text-splitters` could offer sentence SBD as an option.
- Against `docs/perf-review/natural.md` (stemmer batch): complementary, not conflicting. Split sentences → tokenize words → stem words is the classic pipeline.

No entry in `docs/packages.json`.

## FFI-overhead prediction

| Factor | Assessment |
|---|---|
| Per-call algorithmic work | **Medium.** 2 KB input (~10 sentences): ~20–50 µs Rust compute (tokenize + regex pattern match against the abbrev table + boundary emit). JS ~100–300 µs. 20 KB input (~100 sentences): ~200–500 µs Rust, ~1–3 ms JS. Speedup 3–6×. FFI share ~1–5 %. |
| Input size distribution | String 100 B – 100 KB. UTF conversion 0.35 ns/byte = 35 µs for 100 KB — against ~5 ms Rust compute = 0.7 %. Acceptable across the whole distribution. |
| Output size distribution | **This is the design risk.** 100 sentences × (UTF-8→UTF-16 conversion + V8 string-object alloc) ≈ 100 × (~200 ns + 150 chars × 0.35 ns/byte) = ~60 µs for output marshalling alone. Against 500 µs Rust compute = **12 % overhead**. 500 sentences → ~300 µs overhead against 2 ms Rust = 15 %. Both borderline Green. **The offset API eliminates that:** a `Uint32Array` with N×2 values (start, end per sentence) is <10 µs for 500 sentences. |
| Reusable setup (stateful potential) | **Medium.** Abbreviation tables pre-compiled in Rust, no setup per call. Regex patterns compiled once lazy-static. Not a strongly winning NAPI-class case. A `LanguageDetector(lang='en')` class optional as v0.2. |
| Batch-usage realism | **High.** Batch workloads (document-corpus processing) benefit strongly. `splitBatch(texts: string[]) → string[][]` or `splitBatchToOffsets(texts) → Buffer`. Rayon-parallelizable, each doc independent. |
| FFI-share estimate vs. Rust work | With strings output: 10–20 % (Yellow territory on small inputs). With offset output: <2 % (clearly Green across the distribution). |

## Classification reasoning

`sbd` is a **classic output-shape problem** — Rust compute dominates, but the return path partially eats the win:

1. **The standard `Vec<String>` output classifies Yellow.** 500 sentences × marshalling overhead = non-trivial. Realistic speedup 2.5–4× depending on input size — Yellow territory (≥2× but <3× consistently).

2. **The offset-based API hot path reaches Green.** Rust returns a `Uint32Array` of (start, end) pairs. JS callers slice as needed. For downstream tools (embedding-per-sentence) that is actually more appropriate because they want to keep the offsets (for highlighting). This path pushes to 3–5× speedup, clearly Green.

3. **The parity question is the genuinely hard part**, not perf. `sbd` users expect drop-in sentence arrays. We have two options:
   - **Tight-parity mode:** emulate `sbd`'s abbrev list + heuristics exactly. Effort: 2–4 days of conformance work. Divergences documented in `__conformance__/divergences.md`.
   - **Pragmatic-Segmenter mode:** use the Ruby reference. Divergences from `sbd` are explicitly expected. Migration guide: "we're closer to pragmatic-segmenter than to sbd."
   Recommendation: Pragmatic mode as the default, an `sbd`-compat flag as an option for legacy users.

4. **Multi-language support is an unexpectedly large win.** `sbd` is English-centric; `pragmatic_segmenter` has 12+ languages. If we ship multilingual, that is a feature advantage, not just speed.

5. **Neither a `languageDetect` dependency nor ML.** `sbd` expects the caller to assume the language (English default). We adopt that: a language option in the API, no auto-detection. Otherwise we would have a dependency chain on `@amigo-labs/language-detect`.

**Shape matching:**
- ✅ Output shape like `xxhash` pre-fix (`Vec<BigInt>` was Yellow, Buffer output became Green) — **apply the same lesson**
- ✅ Per-document call like `commonmark` (string in / array out, but we can choose the output type)
- ⚠️ Output-heavy shape: the number of output elements (sentences) can grow linearly with input, hence the offset-API recommendation
- ❌ Not like `mime` (the rule engine is real compute, not a hash lookup)

**Benchmark gap flag:** three bench dimensions are needed:
1. Input size (2 KB / 20 KB / 100 KB)
2. Output API (`sentences(text) → string[]` vs. `splitToOffsets(text) → Uint32Array`)
3. Batch (`splitBatchToOffsets(100 × 10 KB)`)

Without the second dimension (output variant) we cannot decide whether the offset hot path delivers the Green push.

## If GO — proposed port

- **Recommended crate-name:** `@amigo-labs/sentences` (not `@amigo-labs/sbd` — the drop-in claim is scoped to Pragmatic-Segmenter parity, not `sbd` bit-exactness)
- **Primary API sketch:**
  ```ts
  export type SbdLanguage = 'en' | 'de' | 'fr' | 'es' | 'it' | 'nl' | 'pt' | 'ru' | 'ja' | 'zh' | 'ar';

  export interface SplitOptions {
    language?: SbdLanguage;         // default 'en'
    newlineBoundaries?: boolean;     // default false
    preserveWhitespace?: boolean;    // default false
    customAbbreviations?: string[];  // merge in Rust
  }

  // Main drop-in form — string[] output (Yellow path, documented)
  export function split(text: string, opts?: SplitOptions): string[];

  // Zero-copy hot path — offset API (Green path)
  export function splitToOffsets(text: string, opts?: SplitOptions): Uint32Array;
  // Return: [start0, end0, start1, end1, ...]; caller: text.slice(start, end)

  // Batch lever
  export function splitBatch(texts: string[], opts?: SplitOptions): string[][];
  export function splitBatchToOffsets(texts: string[], opts?: SplitOptions): Uint32Array[];

  // Stateful for repeat calls with the same lang/custom-abbrev (v0.2)
  export class SentenceSplitter {
    constructor(opts?: SplitOptions);
    split(text: string): string[];
    splitToOffsets(text: string): Uint32Array;
  }
  ```
- **Must-have benchmark scenarios (gate):**
  - **Short (500 B, ~3 sentences):** `split()` target ≥1.5×. `splitToOffsets()` target ≥2×.
  - **Medium (5 KB, ~25 sentences):** `split()` target ≥2.5×. `splitToOffsets()` target ≥4× (Green boundary).
  - **Long (50 KB, ~250 sentences):** `split()` target ≥3× (Yellow upgrade). `splitToOffsets()` target ≥5× (Green).
  - **Very long (100 KB, ~500 sentences):** `splitToOffsets()` target ≥5×. `split()` is most likely Yellow here.
  - **Batch 100 × 5 KB:** `splitBatchToOffsets` target ≥5× (rayon lever).
  - **Parity corpus:** 1000 Pragmatic Segmenter test cases must match at least 98 %. `sbd` parity: ≥95 % acceptable with documented divergences.
- **Acceptance thresholds (Green gate):** `splitToOffsets` must hit ≥4× on medium AND ≥5× on long. `split` may stay Yellow (documented); if we hit ≥3× on medium, upgrade to Green. A single-entry `split` at ≤1.5× on short is Red.
- **Risks:**
  - **Maintenance of the `pragmatic-segmenter` crate** — if inactive: plan a fork or custom implementation. ~3-5 days of effort
  - **Abbrev-list third-language coverage** — Russian/Chinese/Arabic are less well tested in the Ruby reference. Ship with `en/de/fr/es/it` first + fast-follow for the others
  - **Parity expectations against `sbd`** — do not make the drop-in claim; explicitly "a Pragmatic Segmenter port, `sbd`-compatible for 95 % of inputs"
  - **Output-API discussion in the README** — users must be actively steered to the offset path for hot paths. Migration examples with before/after benchmarks
  - **Binary size** — abbrev tables + Unicode tables ~200–400 KB, acceptable

## If NO-GO — BACKLOG entry

Not applicable (GO recommendation).

Section in `BACKLOG.md`: **Under investigation — AI / RAG preprocessing** → entry stays, status update to "Reviewed GO 2026-04-21 (Yellow predicted with Vec<String>, Green with the `splitToOffsets` hot path). Multi-language via `pragmatic-segmenter` (or a fork if unmaintained). `sbd` bit-parity is not the goal; Pragmatic-Segmenter parity is."
