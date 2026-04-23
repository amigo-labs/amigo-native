import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { splitText, splitMarkdown } from '../index.js'

describe('fuzz invariants', () => {
  it('splitText never panics', () => {
    fc.assert(
      fc.property(fc.string(), fc.integer({ min: 10, max: 500 }), (text, size) => {
        const out = splitText(text, { chunkSize: size })
        expect(Array.isArray(out)).toBe(true)
      }),
      { numRuns: 100 },
    )
  })

  it('each chunk is at most chunkSize characters (characters sizer)', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: 2000 }),
        fc.integer({ min: 10, max: 200 }),
        (text, size) => {
          const chunks = splitText(text, { chunkSize: size })
          for (const c of chunks) {
            expect(c.length).toBeLessThanOrEqual(size)
          }
        },
      ),
      { numRuns: 100 },
    )
  })

  it('splitMarkdown never panics', () => {
    fc.assert(
      fc.property(
        fc.string({ maxLength: 2000 }),
        fc.integer({ min: 10, max: 500 }),
        (text, size) => {
          const out = splitMarkdown(text, { chunkSize: size })
          expect(Array.isArray(out)).toBe(true)
        },
      ),
      { numRuns: 100 },
    )
  })
})
