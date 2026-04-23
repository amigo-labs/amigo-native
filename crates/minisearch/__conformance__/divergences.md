# Divergences — minisearch

`@amigo-labs/minisearch` is inspired by
[`minisearch`](https://www.npmjs.com/package/minisearch) but narrows
the API to the single-field, single-index case that covers the
majority of real-world usage.

## Scope cuts

### No multi-field indexes

minisearch lets you index multiple fields with per-field weights
(`fields: ['title', 'body']`, `boost: { title: 2 }`). v0.1 takes
a flat `{ id, text }` document shape.

**Workaround**: concatenate fields yourself before indexing. Boost
a field by repeating it:
```js
const text = `${doc.title} ${doc.title} ${doc.body}`
```

### No `storeFields`

upstream allows you to project fields into result hits. We return
only `{ id, score }`. Keep your own `id → document` map in JS.

### No `extractField` / custom tokenizer

minisearch's `extractField(document, fieldName)` and `tokenize`
options are unsupported. Our tokenizer is fixed (lowercase + split
on non-alphanumeric + optional English stopwords).

### No `searchOptions.fuzzy` (Levenshtein)

Typo-tolerant search is deferred. Use prefix-match (`{ prefix: true }`)
instead for the common "user typed 'rus'" case.

### No `JSON` persistence

`MiniSearch.toJSON()` / `MiniSearch.loadJSON()` are not exposed.
Rebuild on startup.

## Behavioural differences

### Scoring

Both us and upstream use BM25. Exact scores differ because upstream
applies per-field IDF and prefix-discount heuristics; we use
straight BM25 sums. Top-1 tends to agree on realistic corpora (see
`parity.spec.ts`).

### Prefix-match scoring

Our prefix-expansion treats matched terms equally. minisearch
discounts longer-prefix matches more (the exact term scores
highest, then terms that share the prefix). For autocomplete UIs,
both produce acceptable rankings.

### AND combineWith

We use `operator: 'AND' | 'OR'`; minisearch uses
`combineWith: 'AND' | 'OR'`. Same semantics, different key.

## What we do that upstream doesn't

- **Native speed**. Bulk ingest (`addAll`) is a single FFI crossing.
- **Shared `_search-core` crate** with `@amigo-labs/bm25`: one
  tokenizer + scorer used by two packages, one binary each.
