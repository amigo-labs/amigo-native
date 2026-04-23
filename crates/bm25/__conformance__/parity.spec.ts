import { describe, expect, it } from 'vitest'
import { Bm25Index } from '../index.js'
// @ts-expect-error — no types
import BM25 from 'okapibm25'

describe('parity: ranking direction matches okapibm25', () => {
  const docs = [
    'rust programming language',
    'javascript programming tutorial',
    'rust web assembly',
    'python programming introduction',
  ]
  it('rust query: docs 0 and 2 score positive for us', () => {
    const idx = new Bm25Index()
    idx.addAll(docs.map((text, i) => ({ id: `d${i}`, text })))
    const ids = new Set(idx.search('rust').map((h) => h.id))
    expect(ids.has('d0')).toBe(true)
    expect(ids.has('d2')).toBe(true)
    expect(ids.has('d1')).toBe(false)
    expect(ids.has('d3')).toBe(false)
  })

  it('rust query: okapibm25 picks docs 0 and 2 as top 2', () => {
    const scores = BM25(docs, ['rust'])
    const ranked = (scores as number[])
      .map((s, i) => ({ s, i }))
      .sort((a, b) => b.s - a.s)
      .slice(0, 2)
      .map((x) => x.i)
    expect(ranked.sort()).toEqual([0, 2])
  })
})

describe('parity: top-1 agrees on single-term queries', () => {
  const docs = [
    'alpha beta gamma delta',
    'alpha alpha beta delta',
    'gamma only',
  ]
  it('alpha query: doc 1 wins for both us and okapi', () => {
    const idx = new Bm25Index()
    idx.addAll(docs.map((text, i) => ({ id: `d${i}`, text })))
    const ours = idx.search('alpha')[0].id
    expect(ours).toBe('d1')

    const scores = BM25(docs, ['alpha']) as number[]
    const okapiTop = scores
      .map((s, i) => ({ s, i }))
      .sort((a, b) => b.s - a.s)[0].i
    expect(`d${okapiTop}`).toBe('d1')
  })
})
