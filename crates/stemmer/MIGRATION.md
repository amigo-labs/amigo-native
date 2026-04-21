# Migration — `natural` → `@amigo-labs/stemmer`

`@amigo-labs/stemmer` covers the stemmer subset of `natural`. It does
**not** re-export any other part of `natural`'s NLP toolkit
(tokenizers, classifiers, phonetics, distance metrics, WordNet).

## Summary

Batch-only: single-word `PorterStemmer.stem(word)` is intentionally
not exposed because the FFI boundary makes it slower than pure JS. Use
`stemMany` or `tokenizeAndStem` instead.

## Known differences

### Single-word API removed

```js
// Before (natural)
import natural from 'natural'
const root = natural.PorterStemmer.stem('running')

// After (@amigo-labs/stemmer) — batch
import { Stemmer } from '@amigo-labs/stemmer'
const s = new Stemmer('english')
const [root] = s.stemMany(['running'])
```

If you're stemming one word per call in a hot loop, that call pattern
itself is the bug — `stemMany(allWords)` is 10–50× faster because it
amortises the FFI crossing.

For REPL / tests only, `stemOnce(lang, word)` is provided but
documented as slow-path.

### Tokenizer surface is `unicode-segmentation` only

`natural` ships `AggressiveTokenizer`, `OrthographyTokenizer`,
`RegexpTokenizer`, `WordPunctuationTokenizer`, `SentenceTokenizer`,
plus language-specific variants. We ship exactly one: Unicode word
segmentation, behind `tokenizeAndStem`.

If you need a different tokenizer, tokenize in JS and pass the result
to `stemMany(tokens)`.

### Snowball revision may differ by a handful of edge cases

`natural` embeds an older Snowball revision. `rust-stemmers` tracks the
current reference. On realistic corpora, <0.5 % of words differ — this
affects ranking only, not correctness.

## Unsupported

- **`PorterStemmer.stem(word)`** — use `stemMany(['word'])` or
  `tokenizeAndStem(text)`. `stemOnce(lang, word)` exists as documented
  slow path for one-off calls.
- **Language-specific tokenizers** (`AggressiveTokenizerDe`, etc.) —
  tokenize upstream with your preferred library, then call `stemMany`.
- **Custom stemmer plugins** — we ship the Snowball algorithm matrix;
  custom stemmers would require a JS callback across FFI (antipattern).

## New additions beyond `natural`

- **`stemBuffer(buf)`** — newline-delimited bytes in / bytes out, for
  pipelines that never need the tokens to land as JS strings.
- **`tokenizeAndStemToBuffer(text)`** — same, but combined with
  tokenization.
- **18 languages** via `rust-stemmers` (vs. `natural`'s ~10).
