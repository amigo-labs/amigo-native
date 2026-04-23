# Migrating from `wink-bm25-text-search` / `okapibm25`

## From `okapibm25`

`okapibm25` is a single-shot function (`BM25(docs, queryTokens)`)
that rebuilds the index every call. `@amigo-labs/bm25` exposes a
persistent index object.

Before:
```js
import BM25 from 'okapibm25'
const scores = BM25(documents, queryTokens)
```

After:
```js
import { Bm25Index } from '@amigo-labs/bm25'
const idx = new Bm25Index()
idx.addAll(documents.map((text, i) => ({ id: `${i}`, text })))
const hits = idx.search(queryTokens.join(' '))
```

## From `wink-bm25-text-search`

Before:
```js
import bm25 from 'wink-bm25-text-search'
import { prepTask } from 'wink-nlp-utils'

const engine = bm25()
engine.defineConfig({ fldWeights: { body: 1 } })
engine.definePrepTasks([...])
engine.addDoc({ body: 'rust programming' }, 'a')
engine.addDoc({ body: 'python coding' }, 'b')
engine.consolidate()
engine.search('rust')
```

After:
```js
import { Bm25Index } from '@amigo-labs/bm25'
const idx = new Bm25Index()
idx.addAll([
  { id: 'a', text: 'rust programming' },
  { id: 'b', text: 'python coding' },
])
idx.search('rust')
```

## What changes

- **No prep-task pipeline.** wink's tokenizer is configurable via
  `definePrepTasks(...)`. Ours is fixed: lowercase + split on
  non-alphanumeric + optional English stopword pass.
- **No multi-field weighted index.** wink's `fldWeights: { title: 3,
  body: 1 }` is not supported. Workaround: repeat the title 3 times
  in the indexed text.
- **No `consolidate()` step.** Index is always consistent.
- **No Porter stemmer.** Exact stemming parity is out of v0.1 scope.

## Staying on upstream

- You need stemming (wink's Porter pipeline).
- You rely on multi-field weighted scoring.
- You use wink-nlp-utils's custom prep-task hooks.
