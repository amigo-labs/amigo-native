# @amigo-labs/stemmer

> Porter/Snowball stemmer powered by [`rust-stemmers`](https://crates.io/crates/rust-stemmers) — **batch-only** API. Single-word stemming is intentionally not exposed.

18 languages (Arabic, Danish, Dutch, English, Finnish, French, German,
Greek, Hungarian, Italian, Norwegian, Portuguese, Romanian, Russian,
Spanish, Swedish, Tamil, Turkish).

## Install

```bash
pnpm add @amigo-labs/stemmer
```

## Usage

```js
import { Stemmer, stemOnce } from '@amigo-labs/stemmer'

const s = new Stemmer('english')

// Stem a list of words in a single FFI crossing.
s.stemMany(['running', 'cats', 'jumping'])
// ['run', 'cat', 'jump'] (Porter output)

// Tokenize and stem in one call — the realistic RAG / search hot-path.
s.tokenizeAndStem('The quick brown fox jumps over the lazy dog', {
  lowercase: true,
  minTokenLength: 2,
  stopwordsEn: true,
})
// ['quick', 'brown', 'fox', 'jump', 'lazi', 'dog']

// Buffer in, Buffer out — zero-copy for pipelines that stay in Rust.
s.tokenizeAndStemToBuffer('running quickly jumping')
// <Buffer 72 75 6e ...> → "run\nquickli\njump"
```

## Install for the browser

The same `import` works in Angular, React, Vite, esbuild, and webpack ≥ 5 — the bundler picks the WASM build via the `browser` conditional export:

```ts
import { Stemmer } from '@amigo-labs/stemmer'
```

`rust-stemmers` is small (~80 KB gzipped), well under the 500 KB budget.

## Why no `stem(word)`?

Single-word stemming in JavaScript is ~30 ns of work. The NAPI FFI
floor alone is ~109 ns — you'd pay 3× the algorithm's cost just to
cross the boundary. Calling `stemMany(['word'])` loops with no FFI
crossing, which is the correct shape. See
`docs/post-mortems/levenshtein.md` for the measured precedent.

`stemOnce(lang, word)` exists for ad-hoc usage (tests, REPL) and is
explicitly documented as a slow path.

## Migration from `natural`

See [`MIGRATION.md`](./MIGRATION.md). The stemmer subset of `natural`
is nearly drop-in, but single-word `PorterStemmer.stem(word)` is not
supported by design.

## License

MIT
