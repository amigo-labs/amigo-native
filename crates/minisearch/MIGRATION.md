# Migrating from `minisearch`

## Typical minisearch app

```js
import MiniSearch from 'minisearch'

const idx = new MiniSearch({
  fields: ['title', 'body'],
  storeFields: ['id', 'title'],
  searchOptions: { boost: { title: 2 } },
})
idx.addAll(documents)
const hits = idx.search('rust', { prefix: true })
// hits: [{ id, title, score, ...match }]
```

## Equivalent `@amigo-labs/minisearch` app

```js
import { MiniSearch } from '@amigo-labs/minisearch'

// Boost the title by repetition to approximate boost: { title: 2 }.
const flatDocs = documents.map((d) => ({
  id: d.id,
  text: `${d.title} ${d.title} ${d.body}`,
}))

const idx = new MiniSearch()
idx.addAll(flatDocs)
const hits = idx.search('rust', { prefix: true })
// hits: [{ id, score }]

// Project back any fields you need:
const docsById = new Map(documents.map((d) => [d.id, d]))
const enriched = hits.map((h) => ({ ...h, ...docsById.get(h.id) }))
```

## What changes

- **Field boosting** → repeat the field N times in the indexed text.
- **`storeFields`** → keep your own `id → doc` map on the JS side.
- **Option key** `combineWith` → `operator`.
- **`fuzzy` search** → use `prefix: true` (or run `Levenshtein` in
  JS separately).
- **JSON persistence** — rebuild the index on startup. Fast-follow.

## Staying on upstream

- You depend on minisearch's Levenshtein-fuzzy search.
- You need multi-field indexes with per-field weights and
  per-field IDF.
- You rely on `storeFields` for your result projection.
