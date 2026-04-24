import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { MiniSearch } from '../index.js'

describe('fuzz invariants', () => {
  it('search never panics on random input', () => {
    fc.assert(
      fc.property(
        fc.array(fc.string(), { maxLength: 10 }),
        fc.string(),
        (corpus, query) => {
          const m = new MiniSearch()
          m.addAll(corpus.map((text, i) => ({ id: `${i}`, text })))
          const hits = m.search(query)
          expect(Array.isArray(hits)).toBe(true)
        },
      ),
      { numRuns: 100 },
    )
  })

  it('autoSuggest always returns sorted-desc scores', () => {
    fc.assert(
      fc.property(
        fc.array(fc.stringMatching(/^[a-z]+$/), { minLength: 1, maxLength: 20 }),
        fc.stringMatching(/^[a-z]{0,4}$/),
        (words, prefix) => {
          const m = new MiniSearch()
          m.add({ id: 'a', text: words.join(' ') })
          const sugs = m.autoSuggest(prefix)
          for (let i = 1; i < sugs.length; i++) {
            expect(sugs[i].score).toBeLessThanOrEqual(sugs[i - 1].score)
          }
        },
      ),
      { numRuns: 100 },
    )
  })

  it('empty query always returns []', () => {
    fc.assert(
      fc.property(fc.array(fc.string(), { minLength: 1, maxLength: 5 }), (corpus) => {
        const m = new MiniSearch()
        m.addAll(corpus.map((text, i) => ({ id: `${i}`, text })))
        expect(m.search('')).toEqual([])
      }),
      { numRuns: 50 },
    )
  })
})
