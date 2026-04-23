import { describe, expect, it } from 'vitest'
import { Bm25Index } from '../index.js'

// Fixture-style tests covering common BM25 use-cases.

describe('small corpus smoke tests', () => {
  it('short queries over a small corpus', () => {
    const idx = new Bm25Index()
    idx.addAll([
      { id: 'doc1', text: 'The quick brown fox jumps over the lazy dog' },
      { id: 'doc2', text: 'The quick brown fox' },
      { id: 'doc3', text: 'Lazy dogs like sunshine' },
    ])
    const hits = idx.search('quick brown fox')
    expect(hits[0].id).toBe('doc2')
  })

  it('handles punctuation / capitalization / unicode', () => {
    const idx = new Bm25Index()
    idx.addAll([
      { id: 'a', text: 'Hello, World! Straße Größe.' },
      { id: 'b', text: 'hello world straße' },
    ])
    const hits = idx.search('straße')
    expect(hits).toHaveLength(2)
  })

  it('large document does not dominate unfairly', () => {
    // BM25 normalises by document length; a "rust" hit in a long doc
    // shouldn't outrank a focused short doc.
    const idx = new Bm25Index()
    const filler = 'a b c d e f g h i j '.repeat(200)
    idx.addAll([
      { id: 'long', text: `${filler} rust ${filler}` },
      { id: 'short', text: 'rust' },
    ])
    const hits = idx.search('rust')
    expect(hits[0].id).toBe('short')
  })
})

describe('addDoc vs addAll produce the same results', () => {
  it('consistent after streaming vs bulk add', () => {
    const docs = [
      { id: 'a', text: 'rust programming language' },
      { id: 'b', text: 'python programming language' },
      { id: 'c', text: 'javascript programming' },
    ]
    const bulkIdx = new Bm25Index()
    bulkIdx.addAll(docs)
    const streamIdx = new Bm25Index()
    for (const d of docs) streamIdx.addDoc(d.id, d.text)
    const bulkHits = bulkIdx.search('rust').map((h) => h.id)
    const streamHits = streamIdx.search('rust').map((h) => h.id)
    expect(bulkHits).toEqual(streamHits)
  })
})
