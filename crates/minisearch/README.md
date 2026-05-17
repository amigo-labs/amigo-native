# @amigo-labs/minisearch

> Tiny native in-memory full-text search with prefix autocomplete.
> Drop-in-shape for the [`minisearch`](https://www.npmjs.com/package/minisearch)
> npm package, single-field version.

Shares a Rust search-core crate with
[`@amigo-labs/bm25`](../bm25/) — one tokenizer, one scorer, two
focused JS surfaces.

## Install

```bash
pnpm add @amigo-labs/minisearch
```

## Usage

```js
import { MiniSearch } from '@amigo-labs/minisearch'

const m = new MiniSearch()
m.addAll([
  { id: '1', text: 'rust programming language' },
  { id: '2', text: 'javascript programming' },
  { id: '3', text: 'python programming' },
])

// Standard search:
m.search('rust')
// [{ id: '1', score: 0.87 }, ...]

// Autocomplete via prefix:
m.search('rus', { prefix: true })

// AND semantics (default is OR):
m.search('rust programming', { operator: 'AND' })

// Autosuggest: list of matching terms ranked by document frequency
m.autoSuggest('rus')
// [{ suggestion: 'rust', score: 1 }]
```

## Options

```ts
interface MiniOptions {
  k1?: number
  b?: number
  removeStopwords?: boolean
  defaultOperator?: 'OR' | 'AND'
}

interface SearchOptions {
  limit?: number
  prefix?: boolean
  operator?: 'OR' | 'AND'
}
```

## Scope

- **Single-field, flat** document shape (`{ id, text }`).
- **Prefix match** for autocomplete.
- **AND / OR** combinator.
- **English stopwords** (opt-in at construction).
- **Stateful NAPI class** — build once, query many.

## Install for the browser

The same `import` works in Angular, React, Vite, esbuild, and webpack ≥ 5 — the bundler picks the WASM build via the `browser` conditional export:

```ts
import { MiniSearch } from '@amigo-labs/minisearch'
```

The `_search-core` tokenizer + BM25 scorer + prefix-trie is the same code on both sides, so ranking and autocomplete behavior is identical between Node and the browser.

## Scope cuts

- No multi-field / weighted index (upstream's `fields` + `boost`).
- No `storeFields` — we return `{ id, score }` only.
- No `fuzzy` (Levenshtein) — use prefix-match instead.
- No `toJSON` / `loadJSON` persistence.

See [`__conformance__/divergences.md`](./__conformance__/divergences.md).

## License

MIT
