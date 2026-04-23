import { describe, expect, it } from 'vitest'
import { MiniSearch } from '../index.js'

describe('MiniSearch', () => {
  it('empty search returns []', () => {
    const m = new MiniSearch()
    expect(m.search('anything')).toEqual([])
  })

  it('basic search finds matching docs', () => {
    const m = new MiniSearch()
    m.addAll([
      { id: 'a', text: 'rust programming language' },
      { id: 'b', text: 'python programming language' },
    ])
    const hits = m.search('rust')
    expect(hits[0].id).toBe('a')
  })

  it('prefix search matches partial terms', () => {
    const m = new MiniSearch()
    m.addAll([
      { id: 'a', text: 'rust rustic programming' },
      { id: 'b', text: 'python' },
    ])
    const hits = m.search('rus', { prefix: true })
    expect(hits[0].id).toBe('a')
  })

  it('AND operator requires all tokens', () => {
    const m = new MiniSearch()
    m.addAll([
      { id: 'a', text: 'rust programming' },
      { id: 'b', text: 'rust only' },
    ])
    const or = m.search('rust programming')
    expect(or).toHaveLength(2)
    const and = m.search('rust programming', { operator: 'AND' })
    expect(and).toHaveLength(1)
    expect(and[0].id).toBe('a')
  })

  it('default AND operator via constructor', () => {
    const m = new MiniSearch({ defaultOperator: 'AND' })
    m.addAll([
      { id: 'a', text: 'rust programming' },
      { id: 'b', text: 'rust only' },
    ])
    expect(m.search('rust programming')).toHaveLength(1)
  })

  it('autoSuggest returns prefix matches with df scores', () => {
    const m = new MiniSearch()
    m.addAll([
      { id: 'a', text: 'rust' },
      { id: 'b', text: 'rust rustic' },
      { id: 'c', text: 'rustaceous' },
    ])
    const sugs = m.autoSuggest('rus')
    const terms = sugs.map((s) => s.suggestion)
    expect(terms).toContain('rust')
    expect(terms).toContain('rustic')
    expect(terms).toContain('rustaceous')
  })

  it('autoSuggest limit', () => {
    const m = new MiniSearch()
    m.addAll([{ id: 'a', text: 'apple app applet application applying apply' }])
    const sugs = m.autoSuggest('app', 2)
    expect(sugs).toHaveLength(2)
  })

  it('removeStopwords filter', () => {
    const m = new MiniSearch({ removeStopwords: true })
    m.add({ id: 'a', text: 'the quick brown fox' })
    expect(m.search('the')).toEqual([])
    expect(m.search('fox')).toHaveLength(1)
  })

  it('size', () => {
    const m = new MiniSearch()
    m.addAll([
      { id: 'a', text: 'x' },
      { id: 'b', text: 'y' },
    ])
    expect(m.size()).toBe(2)
  })

  it('unicode content works', () => {
    const m = new MiniSearch()
    m.add({ id: 'a', text: 'Größe Straße' })
    expect(m.search('größe')).toHaveLength(1)
  })
})
