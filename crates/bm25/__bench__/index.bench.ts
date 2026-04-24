import { bench, describe } from 'vitest'
import { Bm25Index } from '../index.js'
// @ts-expect-error — no types
import BM25 from 'okapibm25'

const CORPUS = Array.from({ length: 1000 }, (_, i) =>
  `document ${i} contains some common words like alpha beta gamma and a unique term ${i}`,
)

describe('index build (1000 docs)', () => {
  bench('@amigo-labs/bm25 addAll', () => {
    const idx = new Bm25Index()
    idx.addAll(CORPUS.map((text, i) => ({ id: `${i}`, text })))
  })
})

const builtIdx = (() => {
  const idx = new Bm25Index()
  idx.addAll(CORPUS.map((text, i) => ({ id: `${i}`, text })))
  return idx
})()

describe('query (1000 docs indexed)', () => {
  bench('@amigo-labs/bm25 search', () => {
    builtIdx.search('alpha')
  })
  bench('okapibm25 (rebuild every query)', () => {
    BM25(CORPUS, ['alpha'])
  })
})
