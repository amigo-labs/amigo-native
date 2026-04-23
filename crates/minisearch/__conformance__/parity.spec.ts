import { describe, expect, it } from 'vitest'
import { MiniSearch } from '../index.js'
import UpstreamMiniSearch from 'minisearch'

const docs = [
  { id: '1', title: 'rust programming' },
  { id: '2', title: 'javascript programming' },
  { id: '3', title: 'rust web assembly' },
  { id: '4', title: 'python programming' },
]

describe('parity: top hit matches upstream', () => {
  it('rust query: top hit is a doc with "rust"', () => {
    const ours = new MiniSearch()
    ours.addAll(docs.map((d) => ({ id: d.id, text: d.title })))
    const ourHit = ours.search('rust')[0]
    expect(['1', '3']).toContain(ourHit.id)

    const upstream = new UpstreamMiniSearch({
      fields: ['title'],
      storeFields: ['id'],
    })
    upstream.addAll(docs)
    const upstreamHit = upstream.search('rust')[0]
    expect(['1', '3']).toContain(upstreamHit.id)
  })
})

describe('parity: prefix match', () => {
  it('"rus" with prefix matches rust-containing docs', () => {
    const ours = new MiniSearch()
    ours.addAll(docs.map((d) => ({ id: d.id, text: d.title })))
    const ourHits = ours.search('rus', { prefix: true }).map((h) => h.id)
    expect(ourHits).toContain('1')
    expect(ourHits).toContain('3')

    const upstream = new UpstreamMiniSearch({
      fields: ['title'],
      storeFields: ['id'],
    })
    upstream.addAll(docs)
    const upstreamHits = upstream
      .search('rus', { prefix: true })
      .map((h: { id: string }) => h.id)
    expect(upstreamHits).toContain('1')
    expect(upstreamHits).toContain('3')
  })
})

describe('parity: AND operator', () => {
  it('AND restricts to docs containing all terms', () => {
    const ours = new MiniSearch()
    ours.addAll(docs.map((d) => ({ id: d.id, text: d.title })))
    const ourAnd = ours
      .search('rust programming', { operator: 'AND' })
      .map((h) => h.id)
    expect(ourAnd).toEqual(['1'])

    const upstream = new UpstreamMiniSearch({
      fields: ['title'],
      storeFields: ['id'],
    })
    upstream.addAll(docs)
    const upstreamAnd = upstream
      .search('rust programming', { combineWith: 'AND' })
      .map((h: { id: string }) => h.id)
    expect(upstreamAnd).toEqual(['1'])
  })
})
