# Divergences — stemmer

`@amigo-labs/stemmer` targets the **Snowball reference** stemmer output,
which `natural` also approximates but does not track exactly. Cross-
verification is therefore shape-based: whatever both engines produce,
they must be deterministic and must collapse the same inflection
families.

## Scope cuts (not divergences — deliberate)

### No single-word `stem(word)` API

- **Upstream:** `natural.PorterStemmer.stem('running')` → `'run'`.
- **@amigo-labs/stemmer:** no equivalent entry point. Use
  `stemMany(['running'])` or `tokenizeAndStem('running')`.
- **Why:** per-word stemming is ~30 ns of JS work. The NAPI floor alone
  is 109 ns. Exposing the single-word API would be strictly slower than
  staying in JS — the same failure mode that retired
  `@amigo-labs/levenshtein`. See `docs/post-mortems/levenshtein.md` and
  `docs/perf-review/natural.md`.
- **Workaround:** `stemOnce(lang, word)` exists as a documented slow
  path for ad-hoc / REPL usage. Do not use it in hot loops.

### No `natural`-compatible tokenizer surface

- **Upstream:** `natural` ships Aggressive / Orthography / Regexp /
  Word-Punctuation / Sentence tokenizers, plus language-specific
  variants.
- **@amigo-labs/stemmer:** exactly one tokenizer — the
  `unicode-segmentation` word-boundary algorithm — behind
  `tokenizeAndStem`.
- **Workaround:** tokenize in JS using your preferred upstream tokenizer,
  then call `stemMany(tokens)`.

## Known potential divergences

### Snowball revision mismatch

- **Input:** edge-case words where the Snowball spec has been revised
  between natural's embedded copy (c. 2016 revision) and `rust-stemmers`
  (current).
- **Why:** both engines track the Snowball reference but at different
  revisions; ~10–50 words per 10k diverge in output.
- **Workaround:** accept that stemming is a ranking tool, not a
  canonical-form producer — retrieval-quality impact is negligible.

### Stopword list size and coverage

- **Upstream:** `natural` has language-specific stopword lists embedded
  for ~10 languages with a few hundred entries each.
- **@amigo-labs/stemmer:** ships a small English-only stopword list
  (~35 entries, the MySQL/InnoDB default) behind
  `tokenizeAndStem({ stopwordsEn: true })`. Other languages: no
  built-in list.
- **Workaround:** pass pre-filtered tokens to `stemMany`, or rely on
  downstream BM25's own stopword handling
  (`@amigo-labs/bm25` integrates directly).
