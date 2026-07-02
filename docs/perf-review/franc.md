# Candidate review: `franc` / `cld`

> **Status:** GO (as a new package, gated on a minimum input length) · **Predicted:** 🟡 Yellow (Green on paragraphs, Red on short strings) · **Reviewed:** 2026-04-21

## Verdict

Language detection is an **input-length-driven shape**: on a paragraph (500+ characters), trigram matching against 100+ language models is real CPU work and `whatlang`/`lingua-rs` delivers clean 3–8× speedups. On short strings (a 50-character tweet, "Hello world") the Rust kernel itself is <10 µs and the FFI floor dominates — pure-JS `franc` structurally has no FFI gap to bridge there. The BACKLOG warning is exactly right: **gate on realistic median string length**. Recommendation: port with a documented **minimum input length of 100 characters** in the package README, plus a `detectIfLong(text, minLength=100)` convenience that returns `null` below the threshold instead of "guessing". That prevents the trap of users mistakenly benchmarking the tweet use-case.

## JS package

- **npm:**
  - [`franc`](https://www.npmjs.com/package/franc) — trigram-based, 414 languages, "franc-min" (82 languages) and "franc-all" (414 languages). ~250k/week.
  - [`cld`](https://www.npmjs.com/package/cld) — wrapper around Google's Compact Language Detector 2 (C++). ~150k/week.
  - [`languagedetect`](https://www.npmjs.com/package/languagedetect) — alternative pure-JS detection. ~100k/week.
- **Downloads:** `franc` ~250k, `cld` ~150k, `languagedetect` ~100k ≈ **~500k/week combined** (BACKLOG figure confirmed, Q1 2026)
- **Exports / API surface:**
  - `franc(text, opts?) → ISO-639-3-code` ("eng", "deu", etc.)
  - `francAll(text, opts?) → Array<[code, score]>` (top-N with confidence)
  - Options: `minLength=10`, `only=[...]`, `ignore=[...]`, `whitelist=[...]`
  - `cld.detect(text) → Promise<{ reliable, textBytes, languages: [...] }>`
- **Typical input:**
  - Tweet: 50–280 B (problematic)
  - Chat message: 100–2000 B (borderline)
  - Paragraph: 500 B – 10 KB (Green)
  - Article: 10 KB – 1 MB (clearly Green)
- **Typical output:** 3-letter language code + optional confidence scores for the top N. Very small.
- **Realistic median use-case:** **Inbound content filter for multilingual apps** — incoming user content (comments, reviews, support tickets) gets a language tag for routing/translation. Median input ~200–500 B (occasionally tweet-sized). Second case: **content-corpus classification** for batch pipelines (classifying web-scrape output before NLP). Inputs there are considerably longer (paragraph and up).

## Rust replacement

- **Candidate crate(s):**
  - [`whatlang`](https://crates.io/crates/whatlang) — **primary**. ~87 languages, trigram-based like `franc`, very small footprint (~200 KB incl. tables), MIT. Active.
  - [`lingua-rs`](https://crates.io/crates/lingua) — Rust port of [`lingua-py`](https://github.com/pemistahl/lingua-py). ~75 languages, considerably higher accuracy on short strings thanks to statistical language models (not just trigrams). BUT: the binary is ~100+ MB because of the embedded language models. Not shippable under the `@amigo-labs` policy.
  - [`cld2`](https://crates.io/crates/cld2) — Rust binding to the C++ CLD2. That would be the `hnswlib-node` mistake (native-library wrapper).
- **Maintenance / license:** `whatlang` MIT, active, solid. Supply chain clean.
- **Known gotchas / divergences:**
  - **Language-set divergence.** `franc-all` has 414 languages (incl. constructed and historical ones with a minimal data basis), `whatlang` 87. For `@amigo-labs`, 87 is the right choice — the remaining 300+ languages have unreliable detection in `franc-all` anyway (<5 % precision on short inputs).
  - **`franc-min` vs. `whatlang`:** `franc-min` (82 languages) is near 1:1 coverage with `whatlang`. Parity is achievable there.
  - **The confidence-score scale is arbitrary.** `franc` returns a trigram match score (0–1), `whatlang` has its own confidence API. Scores are **not** directly comparable between libraries. We document our scale.
  - **ISO-639-3 vs. ISO-639-1.** `franc` uses 639-3 (3 letters, "eng"), `whatlang` has both. Drop-in compatibility with `franc` = 639-3 as the default.
  - **Short-string unreliability** is **not** divergence-specific but fundamental. All libraries are unreliable below ~20 characters. `lingua-rs` is somewhat better, but the binary cost is completely out of proportion.

## BACKLOG check

Existing entry: `BACKLOG.md:29`:
> **franc** / **cld** — language detection (~500k combined). `whatlang` / `lingua-rs`. Paragraph-size green, short-string red — gate on realistic median string length.

The BACKLOG analysis is exact. Review confirms both points and adds: `lingua-rs` is disqualified for binary-size reasons. `whatlang` is the only practical target.

Scope boundaries against existing reviews:
- Versus `docs/perf-review/natural.md` (stemmer batch): both are NLP preprocessing, but language detection is typically **one call per piece of content** (not batch-dominant like the stemmer).
- No overlap with existing crates.

No entry in `docs/packages.json`.

## FFI-overhead prediction

| Factor | Assessment |
|---|---|
| Per-call algorithmic work | **Strongly input-dependent.** 50 B input: trigram scan over ~10 trigrams × 87 language models ≈ 5 µs Rust. JS ~10–20 µs. Speedup <2× due to a 1–2 µs FFI share. 500 B: ~50 µs Rust, ~200 µs JS → 3–4×. 5 KB: ~400 µs Rust, ~2 ms JS → 4–5×. 50 KB: ~4 ms Rust, ~20 ms JS → 5×. |
| Input size distribution | String input. UTF conversion ~0.35 ns/byte (BASELINE.md). 50 B input: ~20 ns conversion, negligible. 50 KB: ~17 µs conversion, 0.5 % of the Rust compute. OK across the entire distribution. |
| Output size distribution | `franc()` → 3-byte string. `francAll()` → small array (top 10 with scores). All output <1 KB. Negligible. |
| Reusable setup (stateful potential) | **High, but weighted differently.** The language models (trigram tables) are loaded once at library init, not per call. If a user sets `only=['eng','deu','fra']`, a `Detector({only: [...]})` class would be cheap (pre-filtered models). NAPI class optional, not critical for v1. |
| Batch-usage realism | **Medium.** Many users have lists of strings (review corpus, chat-message log). `detectMany(texts: string[]) → string[]` is a reasonable lever. Rayon-parallelizable. |
| FFI-share estimate vs. Rust work | Tweet (50 B): ~50 %. Paragraph (500 B): ~5 %. Article (50 KB): <0.5 %. |

## Classification reasoning

Language detection splits sharply along input length:

1. **Tweet bucket (<100 B): Red-to-Black.** Rust work is <10 µs, FFI floor 109 ns + input UTF conversion ~50 ns + output string return ~200 ns ≈ **350 ns overhead on ~10 µs of work = 3.5 %**, which sounds OK, but pure-JS `franc` on the same mini-call is ~10–20 µs. Speedup ~1.5–2× — borderline Yellow. On very short inputs (below 50 B, "test", "hello") that tips below 1.5×. So:
   - >100 B input: clearly Green (4–5×)
   - 50–100 B: Yellow (2–3×)
   - <50 B: Red (≤1.5×)

2. **Paragraph/article bucket (>500 B): clearly Green.** 4–5× speedup, FFI share <5 %. The main sell.

3. **Detection accuracy is an independent variable.** The BACKLOG warning is perf-focused, but the functional reason for the minimum length is **reliability**: all language detectors are garbage below 20 B. That is not our problem — it is physics. We document `minLength=10` as the default guard (analogous to `franc`).

4. **The Rust win comes not from the trigram loop but from Unicode normalization.** `franc` spends relatively much overhead in JS on Unicode normalization and trigram extraction (regex-based). Rust's `whatlang` uses optimized char iteration. The hot loop is more compact.

5. **`lingua-rs` would be the perf+accuracy option, but it is disqualified.** 100+ MB binary × 6 platforms = 600+ MB total package size. That fundamentally breaks the "zero dependencies + small bundle" positioning. Even feature-gating the embedded models barely gets below 30 MB per target (the language models ARE the package). Permanent NO-GO for lingua-rs.

**Shape matching:**
- ⚠️ Bimodal shape like `@langchain/textsplitters` (tweet = Red zone, paragraph = Green)
- ✅ Stateless compute like `slugify` (no NAPI class needed, one call per operation)
- ❌ Not like `deep-equal` (no hashmap lookup — real statistics per char)
- ❌ Not like `mime` (no single lookup — the trigram scan is an algorithm)

**Benchmark-gap flag:** Critical — five input-size buckets are needed (10 B / 50 B / 200 B / 500 B / 5 KB / 50 KB). Without the 50 B cut-off point we do not know the break-even. Gate rule: the cut-off must sit below 100 B, otherwise we have to raise the min-length guard, and that hurts drop-in usability.

## If GO — proposed port

- **Recommended crate-name:** `@amigo-labs/language-detect` (not `@amigo-labs/franc` — we match the `franc` API but are a semantic superset; also not `@amigo-labs/lang` because that is too generic)
- **Primary API sketch:**
  ```ts
  // ISO-639-3 codes, compatible with franc
  export type LangCode = 'eng' | 'deu' | 'fra' | 'spa' | ... ;  // 87 whatlang languages

  export interface DetectOptions {
    minLength?: number;          // default 10 (as in franc)
    only?: LangCode[];           // only check these languages
    ignore?: LangCode[];         // exclude these languages
  }

  // Default: franc-compatible return code ('eng', 'deu', 'und' when unclear/too short)
  export function detect(text: string, opts?: DetectOptions): LangCode;

  // Top-N alternative with confidence
  export function detectAll(
    text: string,
    opts?: DetectOptions & { limit?: number }
  ): Array<[LangCode, number]>;

  // Batch lever
  export function detectMany(texts: string[], opts?: DetectOptions): LangCode[];

  // Safe default: returns null for inputs below minLength instead of guessing 'und'
  export function detectIfLong(text: string, opts?: DetectOptions): LangCode | null;

  // Stateful for repeated calls with the same only-list (optional v0.2)
  export class LanguageDetector {
    constructor(opts?: DetectOptions);
    detect(text: string): LangCode;
    detectAll(text: string, limit?: number): Array<[LangCode, number]>;
  }
  ```
- **Must-have benchmark scenarios (Gate):**
  - **Tiny (10 B, "hello"):** target ≥1.0× (parity is the minimum, below 1× is Red)
  - **Tweet (50 B):** target ≥1.5× (Yellow threshold)
  - **Short chat (200 B):** target ≥2× (Green threshold)
  - **Paragraph (500 B – 2 KB):** target ≥3× (main Green case)
  - **Article (10–50 KB):** target ≥5× (Green, large)
  - **Batch 1000 × paragraph:** target ≥4× (rayon lever)
  - **Cross-baseline:** additionally run against `cld` (native wrapper) and `languagedetect` (pure JS) to establish our category position
- **Acceptance thresholds (Green gate):** ≥3× on paragraph AND ≥2× on short chat AND ≥1× on tiny. The tweet threshold (≥1.5×) is Yellow-OK if documented.
- **Risks:**
  - **Confidence-score drift vs. franc** — users who parse against score thresholds (e.g. "ignore if score < 0.3") break. Migration guide mandatory
  - **Language-set divergence** — `franc-all` users with rare languages (Klingon, Middle High German) cannot migrate. Document as an acceptable scope restriction
  - **Short-string unreliability** — a physical limit, not a bug. The README must warn explicitly
  - **Batch-output marshalling** — `Vec<LangCode>` (3-byte strings) is the raw material of the `xxhash` batch trap. For batch, either a `Buffer` with fixed 4-byte slots (3-byte code + \0) or accept the per-element conversion cost (per code it is small; 180 ns × 1000 = 180 µs, OK when the Rust work is 1000× more)
  - **Binary size** — `whatlang` + trigram tables ~300–500 KB per target. Acceptable

## If NO-GO — BACKLOG entry

Not applicable (GO recommendation).

Section in `BACKLOG.md`: **Under investigation — AI / RAG preprocessing** → entry stays, status update to "Reviewed GO 2026-04-21 (Yellow-predicted, Green on paragraph/article). `whatlang` as the engine; `lingua-rs` disqualified (binary size 100+ MB). Min-length guard explicit in the API."
