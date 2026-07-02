# Candidate review: `natural` — Porter/Snowball stemmer subset

> **Status:** GO (only as a batch-only subset package `@amigo-labs/stemmer`) · **Predicted:** 🟢 Green (batch API) / ⚫ Black (single-word API — deliberately **not** exposed) · **Reviewed:** 2026-04-21

## Verdict

`natural` is a huge NLP toolkit (stemmers, tokenizers, classifiers, phonetics, distance metrics, WordNet interface) — **no drop-in port is possible**. The rationally viable subset is **Porter/Snowball stemming** via `rust-stemmers`. The BACKLOG warning is precise: `natural.PorterStemmer.stem("word")` is the typical call form, and a single word stem is ~20–50 ns in JS and ~40 ns in Rust PLUS the 109 ns FFI floor. The single-word API is **structurally Black**; there is no lever. But `stemMany(words: string[])` or `stemBuffer(newline-separated: Buffer)` collapses 1000+ stemming operations into one FFI crossing and is cleanly Green. The port demands deliberate API discipline: **we do not offer a single-call `stem(word)`**.

## JS package

- **npm:** [`natural`](https://www.npmjs.com/package/natural)
- **Downloads:** ~300k/week (BACKLOG figure confirmed, but that is the entire `natural` package — the stemmer subset alone is a minority)
- **Exports / API surface (relevant subset):**
  - `natural.PorterStemmer.stem(word) → string`
  - `natural.PorterStemmer.tokenizeAndStem(text, keepStops=false) → string[]` ← **this** is the realistic call path
  - Snowball variants: `PorterStemmerDe`, `PorterStemmerEs`, `PorterStemmerFr`, `PorterStemmerIt`, `PorterStemmerNl`, `PorterStemmerNo`, `PorterStemmerPt`, `PorterStemmerRu`, `PorterStemmerSv`, `AggressiveTokenizerXx`
  - The `.attach()` pattern: patches `String.prototype.stem()`. We ignore it.
- **Typical input:**
  - Single word: 3–20 characters (we deliberately ignore this path)
  - Batch via `tokenizeAndStem(text)`: text 100 B – 100 KB, tokenize + stem every token
- **Typical output:** array of stemmed tokens, 1–10 000 tokens
- **Realistic median use-case:** **BM25/TF-IDF indexing preprocessing** — tokenize + stem documents for a search index (see `docs/perf-review/wink-bm25-text-search.md` — there the stemmer is an in-process building block). Second case: **classic search relevance** as feature prep for custom pipelines (an elasticsearch equivalent inside the Node process). Almost NEVER is the use-case "one word in, one stem out" — that is a theoretical edge case that hardly ever occurs in production code.

## Rust replacement

- **Candidate crate(s):**
  - [`rust-stemmers`](https://crates.io/crates/rust-stemmers) — **primary**. Port of the Snowball reference stemmers for 17 languages. MIT, active, maintained by the Maloku-led group with a long track record. Core algorithms are deterministic against the Snowball reference.
  - [`unicode-segmentation`](https://crates.io/crates/unicode-segmentation) — building block for the `tokenizeAndStem` integration.
- **Maintenance / license:** `rust-stemmers` MIT/BSD-3-Clause, active. `unicode-segmentation` MIT. Supply chain clean.
- **Known gotchas / divergences:**
  - **Snowball output parity** against `natural` is ~99 %+ but not 100 %. `natural.PorterStemmerDe` has historical deviations from the Snowball reference (~10–50 edge-case words per 10k). We follow **Snowball**, not `natural`. Document as a divergence, link to snowball.tartarus.org.
  - **Tokenization rules diverge.** `natural`'s `AggressiveTokenizer` is language-specific. We offer `unicode-words` (via `unicode-segmentation`) as the default and a `whitespace` fallback. No 1:1 parity on tokenization.
  - The **`.attach()` pattern** is not exposed (String.prototype patching is an API sin).
  - **Stopwords** in `natural` are hard-wired per language. We offer them as an optional config flag with a classifier list (static tables, ~100–500 words per language).

## BACKLOG check

Existing entry: `BACKLOG.md:28`:
> **natural** — Porter/Snowball batch surface only (~300k total). `rust-stemmers`. Single-word-per-call path is a Red trap; port requires deliberately *not* exposing the one-word API.

The BACKLOG analysis is exactly right. Review confirms both points:
1. The batch API is Green
2. The single-word API is ⚫ Black (109 ns FFI floor on 30 ns of Rust work)

The discussion is not "whether we port" but "how strictly we draw the scope." Answer: `@amigo-labs/stemmer` is **not** a drop-in for `natural`. It is a new package that covers the stemmer subset.

No entry in `docs/packages.json`.

## FFI-overhead prediction

| Factor | Assessment |
|---|---|
| Per-call algorithmic work | **Bimodal.** Single word: ~20–50 ns in JS, ~40 ns in Rust. FFI floor 109 ns = **>100 % overhead** — Black. Batch `stemMany(10 000 words)`: ~500 µs – 2 ms JS, Rust ~100–400 µs → **3–5× speedup**. |
| Input size distribution | Single string: 3–20 B. Batch as `string[]` 10k × 10 B = 100 KB — marshalling via `Vec<String>` input costs ~43 ns/element (BASELINE.md:32 for u32, ~similar for string headers) + UTF conversion. **Must** come in as a `Buffer` with an internal delimiter (newline). Then it is flat. |
| Output size distribution | Single stem: ~3–20 B string. Batch: 10k output strings. Again the `Vec<String>` antipattern case. Must go out as a `Buffer` (newline-separated). |
| Reusable setup (stateful potential) | **High.** The stemmer algorithm is static per language, but the regex/lookup tables are embedded in the library on the Rust side (`rust-stemmers` is zero-alloc init). A NAPI class `Stemmer('en')` with methods `stemBatch(buf)`, `tokenizeAndStemBatch(text)` is clean. No heavy setup, but the class scope belongs to the language selection. |
| Batch-usage realism | **Critical.** Without batch = the package is unsellable. With batch = Green. That is the entire port scope. |
| FFI-share estimate vs. Rust work | Batch (10k words): <1 %. Single: >100 % (do not offer). |

## Classification reasoning

The core of the decision is **API discipline**, not perf:

1. **Single-word stemming is a textbook Black shape.** Same category as `mime` (hashmap lookup), `dotenv` (regex parse), `deep-equal` (flat 7-key). Trivial work per call + short input + hot-loop pattern. We have learned: that never goes Green. Therefore **we do not offer that API**.

2. **Batch stemming is cleanly Green.** 10k words per call is ~200 µs of Rust work, FFI transport via Buffer flat at ~200 ns. FFI share <0.1 %. The Snowball stemmers in `rust-stemmers` are hand-optimized with static lookup tables and compact transform rules.

3. **`tokenizeAndStem(text)` is the real main lever.** Users do NOT make 10000 individual `stem()` calls. They call `tokenizeAndStem(document)` on a 10 KB document and get 1000+ stemmed tokens back. That is the realistic median case and it is Green:
   - 10 KB input → UTF conversion ~3.5 µs
   - unicode-segmentation + stemmer loop in Rust: ~50–200 µs
   - Output of 1000 tokens in one Buffer: ~1 KB UTF conversion ~0.3 µs
   - Total: ~55–210 µs. JS: 500 µs – 2 ms. **Speedup 3–10×**.

4. **Portfolio positioning.** In isolation, `@amigo-labs/stemmer` would serve a ~50k/week TAM (the stemmer subset of `natural` users). That is low, but **integration with `@amigo-labs/bm25`** is the real value: building a BM25 index without an FFI crossing per word. The stemmer is called Rust-internally by BM25 — no cross-crate FFI.

**Shape matching:**
- ✅ Batch path like `xxhash`'s `*Many` API (after the Phase-C fix — Buffer output instead of Vec<BigInt>)
- ✅ Like `rust-stemmers` itself embedded in `tantivy` (stateful library in the search stack)
- ❌ Single word like `mime` / `deep-equal` — exactly the shape we do not offer

**Benchmark-gap flag:** The prediction stands without a spike. Scenario gate below. A single-word comparison value must still be **measured** to show that we are right to exclude it — a documentation artifact.

## If GO — proposed port

- **Recommended crate-name:** `@amigo-labs/stemmer` (not `@amigo-labs/natural` — drop-in is not the goal; `natural` is far too big and multi-faceted)
- **Primary API sketch:**
  ```ts
  export type StemmerLang =
    | 'english' | 'german' | 'french' | 'spanish' | 'italian'
    | 'dutch' | 'portuguese' | 'swedish' | 'norwegian' | 'danish'
    | 'russian' | 'finnish' | 'hungarian' | 'romanian' | 'turkish'
    | 'arabic' | 'greek';

  export class Stemmer {
    constructor(lang: StemmerLang);

    // Batch-only — deliberately NO stem(word: string) — that would be Black
    stemMany(words: string[]): string[];
    stemBuffer(buf: Buffer, delimiter?: '\n' | ' ' | ','): Buffer;   // hot-path

    // Combines tokenize + stem in a single call
    tokenizeAndStem(text: string, opts?: {
      stopwords?: boolean;
      minTokenLength?: number;
    }): string[];
    tokenizeAndStemToBuffer(text: string, opts?: ...): Buffer;
  }

  // Convenience for one-off calls — marked as slow-path
  export function stemOnce(lang: StemmerLang, word: string): string;
  // ↑ useful for testing, documented as "don't use in hot loops"
  ```
- **Must-have benchmark scenarios (Gate):**
  - **Batch-10 (stemMany × 10 words):** target ≥1.0× — really the "small batch" edge case. If <1×, document a minimum batch size of 100.
  - **Batch-1000 (stemMany × 1000 words):** target ≥3× (Green threshold)
  - **Batch-10 000 (stemMany × 10k):** target ≥5×
  - **tokenizeAndStem on a 10 KB text (~1500 tokens):** target ≥3× (realistic median)
  - **tokenizeAndStem on a 100 KB text (~15k tokens):** target ≥5×
  - **Single word (stemOnce, 10k runs):** target **irrelevant, measured anyway** — if <1× we document it as "expected Black for single-word path, use batch API"
- **Acceptance thresholds (Green gate):** ≥3× on `tokenizeAndStem` 10 KB AND ≥3× on batch-1000 AND ≥5× on batch-10 000. Single word is not part of the gate.
- **Risks:**
  - **User expectation of a drop-in form** — many will expect `import natural`. Migration guide mandatory, with an explicit `stem()` → `stemMany()` rewrite
  - **Snowball-vs-natural divergence** — `natural` is not fully Snowball-conformant; we are. Document edge-case word divergences
  - **Language scope** — `natural` has 10 languages, `rust-stemmers` 17. We ship all 17. Binary size ~500 KB – 1 MB for all tables (feature-gated per language selection via Cargo features, users can link only their languages in the Cargo config — or we build separate npm packages per language group, fast-follow)
  - **Thin standalone portfolio position** — the package lives mainly off the integration with `@amigo-labs/bm25`. That must be stated clearly in the `docs/packages.json` description

## If NO-GO — BACKLOG entry

Not applicable (GO recommendation, but with a scope restriction).

Section in `BACKLOG.md`: **Under investigation — AI / RAG preprocessing** → change the entry to "Reviewed GO 2026-04-21 as a **batch-only subset** (`@amigo-labs/stemmer`, not a `natural` drop-in). Single-word API deliberately not exposed. Recommended v1 after `@amigo-labs/bm25` — the two packages share stemmer state."
