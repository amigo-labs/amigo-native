import { describe, expect, it } from 'vitest'
import { MiniSearch } from '../index.js'

describe('minisearch README-style examples', () => {
  it('autocomplete on a small corpus', () => {
    const m = new MiniSearch()
    m.addAll([
      { id: '1', text: 'The lion, the witch, and the wardrobe' },
      { id: '2', text: 'Alice in Wonderland' },
      { id: '3', text: 'Lord of the Rings' },
    ])
    const sugs = m.autoSuggest('li')
    expect(sugs.map((s) => s.suggestion)).toContain('lion')
  })

  it('multi-term OR is default', () => {
    const m = new MiniSearch()
    m.addAll([
      { id: '1', text: 'apple pie recipe' },
      { id: '2', text: 'banana pie' },
      { id: '3', text: 'apple juice' },
    ])
    const hits = m.search('apple banana')
    // With default OR, all three docs match at least one term.
    expect(hits).toHaveLength(3)
  })

  it('case-insensitive search', () => {
    const m = new MiniSearch()
    m.add({ id: '1', text: 'Hello WORLD' })
    expect(m.search('hello')).toHaveLength(1)
    expect(m.search('WORLD')).toHaveLength(1)
  })

  it('special characters are tokenized out', () => {
    const m = new MiniSearch()
    m.add({ id: '1', text: 'foo@bar.com, 2024!' })
    expect(m.search('foo')).toHaveLength(1)
    expect(m.search('2024')).toHaveLength(1)
  })
})
