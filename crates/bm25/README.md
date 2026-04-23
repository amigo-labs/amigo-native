# @amigo-labs/bm25

> BM25 full-text search for Node.js — stateful native index, pure-Rust
> tokenizer + inverted postings. Build once, query many.

## Install

```bash
pnpm add @amigo-labs/bm25
```

## Usage

```js
import { Bm25Index } from '@amigo-labs/bm25'

const idx = new Bm25Index({ k1: 1.5, b: 0.75 })
idx.addAll([
  { id: 'a', text: 'rust programming language' },
  { id: 'b', text: 'javascript development guide' },
  { id: 'c', text: 'rust web assembly' },
])

idx.search('rust')
// [
//   { id: 'a', score: 0.87 },
//   { id: 'c', score: 0.82 },
// ]

// Add a single doc incrementally:
idx.addDoc('d', 'rust cli tooling')

// Limit results:
idx.search('rust', { limit: 2 })

// Strip English stopwords at both index- and query-time:
new Bm25Index({ removeStopwords: true })
```

## Options

```ts
interface IndexOptions {
  k1?: number                 // default 1.5
  b?: number                  // default 0.75
  removeStopwords?: boolean   // default false, English list
}

interface SearchOptions {
  limit?: number              // default 10
}
```

## Shape

- **Stateful** — an index is an opaque native object. Build it once
  in the constructor, query many times.
- **Thread-safe** inside a single index (Mutex-protected).
- **Single-FFI-crossing corpus ingest** via `addAll(docs)`.
- **Shared Rust core** with
  [`@amigo-labs/minisearch`](../minisearch/) (both wrap an internal
  `_search-core` crate).

## Scope cuts

- No multi-field weighted index (v0.2). Concatenate boosted text if
  needed.
- No per-doc boost (`fldWeights`-style).
- No save / load — rebuild on startup.
- No stemming. For corpora requiring Porter stemmer, stay on
  `wink-bm25-text-search`.

See [`__conformance__/divergences.md`](./__conformance__/divergences.md).

## License

MIT
