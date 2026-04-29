# Candidate review: `stopword`

> **Status:** NO-GO · **Predicted:** ⚫ Black · **Reviewed:** 2026-04-21

## Verdict

`stopword.removeStopwords(tokens, stopWordsList) → filteredTokens` is **a hashset lookup in a loop** — the `mime` category. For each token a `Set.has()` call runs against the stopword list; V8's Map/Set implementation is tuned to native-speed and the FFI floor + per-call array marshalling would make this 3–10× slower than pure JS. There is no input-size rescue: more tokens means more array-marshalling cost, proportional to the compute. Same lesson as `mime-types` / `dotenv`.

## JS package

- **npm:** [`stopword`](https://www.npmjs.com/package/stopword)
- **Downloads:** ~1M/week
- **Exports / API surface:**
  - `removeStopwords(tokens: string[], list?: string[]) → string[]`
  - Pre-built language lists: `stopword.eng`, `stopword.deu`, `stopword.fra`, ... (50+ languages)
- **Typical input:** `string[]` of 10–10 000 tokens. Stopword list (optional) of 50–500 words. Median ~100 tokens.
- **Typical output:** Filtered `string[]`, typically 40–70 % of the input length (stopwords removed).
- **Realistic median use case:** **NLP preprocessing for a search index** — after tokenization, before the stemmer, strip stopwords. Typically called in a doc-processing loop: once per document via `removeStopwords(tokens, eng)`. Second case: **query preprocessing** in search frontends.

## Rust replacement

- **Candidate crate(s):** Trivial — `FxHashSet<&str>` from an embedded list, `.filter(|t| !set.contains(t)).collect()`. ~20 lines on the Rust side.
- **Maintenance / license:** n/a
- **Known gotchas / divergences:** Language-list divergence — `stopword.eng` is slightly different from NLTK's or spaCy's English list. Parity = embed the `stopword` lists verbatim (they are already public domain).

## BACKLOG check

Existing entry in `BACKLOG.md` → "Ruled out — AI-category": "Hashset lookup per call — lookup-style FFI trap, same as `mime`." Review formalises and archives.

Boundary:
- vs. `docs/perf-review/mime.md` (⚫ Black): identical shape — set-lookup call. Only difference: `stopword` filters an array instead of doing a single lookup, which adds FFI output marshalling (array-out = worse, not better).
- vs. `docs/perf-review/natural.md` (GO, batch-only subset): the Rust stemmer integrates the stopword filter **internally** in `tokenizeAndStem(text, {stopwords: true})` — no FFI crossing per filter. That's the right shape, not a standalone stopword package.

## FFI-overhead prediction

| Factor | Assessment |
|---|---|
| Per-call algorithmic work | **Trivial.** 100 tokens × set-lookup: ~3–5 µs JS, ~1 µs Rust. Δ ≈ 2–4 µs. |
| Input size distribution | `Vec<String>` input: 100 × ~200 ns = **20 µs of FFI transport** on 100 tokens. Completely dominates Rust compute. |
| Output size distribution | `Vec<String>` output: ~60–70 strings × 200 ns = **12–14 µs marshalling**. Further overhead. |
| Reusable setup (stateful potential) | Irrelevant (stopword list is embedded, static). |
| Batch usage realism | Zero — the call IS the batch (one array, one filter). No next-level batch is conceivable. |
| FFI-share estimate vs. Rust work | ~30 µs transport on ~1 µs of compute = **3000 %** overhead. Structurally Black. |

## Classification reasoning

1. **V8 Set lookup is native speed.** `Set.prototype.has` is compiled on the V8 hot path. `Array.prototype.filter` with a set-lookup callback is monomorphic and vectorised.

2. **Array-in / array-out is the `Vec<String>` trap.** `docs/BASELINE.md:32` shows 43 ns/element for u32 arrays — `String` marshalling is at least 2–3× as expensive (UTF conversion plus length prefix). 100 tokens in + filtered output = **~30 µs of pure FFI transport** on ~1 µs of Rust compute.

3. **Integration into `@amigo-labs/stemmer` is the right shape.** There, stopword removal is a boolean flag on `tokenizeAndStem(text, {stopwords: true})`, looped Rust-internally. Input: one text string (substantial compute). Output: a token list. One FFI crossing for the full tokenize + stopword + stem path.

**Shape matching:**
- 🔁 Like `mime` / `mime-types` (lookup style)
- 🔁 Like `dotenv` (short V8-JIT parser)
- 🔁 Like the archived `deep-equal` (trivial work, FFI-dominated)
- ❌ Integration into `@amigo-labs/stemmer` is the right path

**Benchmark-gap flag:** No spike needed — the FFI-transport math is unambiguous.

## If NO-GO — BACKLOG entry

Archived 2026-04-21. Full review: `docs/perf-review/stopword.md`. The functionality is integrated into `@amigo-labs/stemmer` (see `docs/perf-review/natural.md`).
