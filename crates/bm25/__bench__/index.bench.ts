import { bench, describe } from 'vitest'
import { Bm25Index } from '../index.js'
// WASM is built as build output, not committed. On a fresh checkout
// run `pnpm build:wasm` before `pnpm bench` to include the WASM
// comparator; otherwise the bench skips those entries with a warning.
let wasmBm25Index: typeof Bm25Index | null = null
try {
  // @ts-expect-error — generated artifact path; not in source tree
  const mod = await import('../wasm/pkg/amigo_bm25_wasm.js')
  wasmBm25Index = mod.Bm25Index
} catch {
  console.warn('[bench] WASM artifact missing — run `pnpm build:wasm` to include WASM comparator')
}
// @ts-expect-error — no types
import BM25 from 'okapibm25'

const CORPUS = Array.from({ length: 1000 }, (_, i) =>
  `document ${i} contains some common words like alpha beta gamma and a unique term ${i}`,
)

describe('index build (1000 docs)', () => {
  bench('@amigo-labs/bm25 (napi) addAll', () => {
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
  bench('@amigo-labs/bm25 (napi) search', () => {
    builtIdx.search('alpha')
  })
  bench('okapibm25 (rebuild every query)', () => {
    BM25(CORPUS, ['alpha'])
  })
})
