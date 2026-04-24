import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { Bm25Index } from '../index.js'

describe('fuzz invariants', () => {
  it('search never panics on random strings', () => {
    fc.assert(
      fc.property(
        fc.array(fc.string(), { minLength: 0, maxLength: 10 }),
        fc.string(),
        (docs, query) => {
          const idx = new Bm25Index()
          idx.addAll(docs.map((text, i) => ({ id: `${i}`, text })))
          const hits = idx.search(query)
          expect(Array.isArray(hits)).toBe(true)
          for (const h of hits) {
            expect(typeof h.id).toBe('string')
            expect(typeof h.score).toBe('number')
            expect(h.score).toBeGreaterThanOrEqual(0)
          }
        },
      ),
      { numRuns: 100 },
    )
  })

  it('scores are non-decreasing in rank order', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.stringMatching(/^[a-z]{3,10}$/), {
          minLength: 5,
          maxLength: 20,
        }),
        (words) => {
          const idx = new Bm25Index()
          for (let i = 0; i < 10; i++) {
            const len = 3 + (i % 5)
            idx.addDoc(`${i}`, words.slice(0, len).join(' '))
          }
          const hits = idx.search(words[0])
          for (let i = 1; i < hits.length; i++) {
            expect(hits[i].score).toBeLessThanOrEqual(hits[i - 1].score)
          }
        },
      ),
      { numRuns: 50 },
    )
  })
})
