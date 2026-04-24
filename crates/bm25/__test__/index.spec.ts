import { describe, expect, it } from 'vitest'
import { Bm25Index } from '../index.js'

describe('Bm25Index', () => {
  it('returns empty hits on empty index', () => {
    const idx = new Bm25Index()
    expect(idx.search('anything')).toEqual([])
  })

  it('finds matching documents', () => {
    const idx = new Bm25Index()
    idx.addAll([
      { id: 'a', text: 'the cat sat on the mat' },
      { id: 'b', text: 'the dog ran away' },
    ])
    const hits = idx.search('cat')
    expect(hits[0].id).toBe('a')
  })

  it('scores higher relevance first', () => {
    const idx = new Bm25Index()
    idx.addAll([
      { id: 'a', text: 'rust rust rust programming' },
      { id: 'b', text: 'rust and python programming' },
    ])
    const hits = idx.search('rust')
    expect(hits[0].id).toBe('a')
    expect(hits[0].score).toBeGreaterThan(hits[1].score)
  })

  it('honours limit', () => {
    const idx = new Bm25Index()
    for (let i = 0; i < 10; i++) {
      idx.addDoc(`${i}`, 'rust lang programming')
    }
    const hits = idx.search('rust', { limit: 3 })
    expect(hits).toHaveLength(3)
  })

  it('filters stopwords when configured', () => {
    const idx = new Bm25Index({ removeStopwords: true })
    idx.addDoc('a', 'the quick brown fox')
    const hits = idx.search('the')
    expect(hits).toHaveLength(0)
  })

  it('exposes size', () => {
    const idx = new Bm25Index()
    idx.addAll([
      { id: 'a', text: 'a' },
      { id: 'b', text: 'b' },
    ])
    expect(idx.size()).toBe(2)
  })

  it('multi-token queries combine scores', () => {
    const idx = new Bm25Index()
    idx.addAll([
      { id: 'a', text: 'rust programming tutorial' },
      { id: 'b', text: 'javascript programming guide' },
      { id: 'c', text: 'rust web assembly' },
    ])
    const hits = idx.search('rust programming')
    expect(hits[0].id).toBe('a')
  })

  it('custom k1/b parameters work', () => {
    const idx = new Bm25Index({ k1: 2.0, b: 0.5 })
    idx.addDoc('a', 'rust rust rust')
    idx.addDoc('b', 'rust once only')
    const hits = idx.search('rust')
    // Both doc a and b should appear.
    expect(hits.length).toBe(2)
  })

  it('case insensitive search', () => {
    const idx = new Bm25Index()
    idx.addDoc('a', 'Hello World')
    expect(idx.search('hello')).toHaveLength(1)
    expect(idx.search('HELLO')).toHaveLength(1)
  })
})
