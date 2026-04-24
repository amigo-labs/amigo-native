import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { split, splitToOffsets } from '../index.js'

const sentenceGen = fc.stringMatching(/^[A-Za-z][A-Za-z ]{2,40}[.!?]$/)

describe('fuzz invariants', () => {
  it('never panics on random strings', () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        const out = split(s)
        expect(Array.isArray(out)).toBe(true)
      }),
      { numRuns: 200 },
    )
  })

  it('splitToOffsets always returns a multiple of 8 bytes', () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        const buf = splitToOffsets(s)
        expect(buf.length % 8).toBe(0)
      }),
      { numRuns: 200 },
    )
  })

  it('concatenating joined sentences is a substring of the original', () => {
    fc.assert(
      fc.property(fc.array(sentenceGen, { minLength: 1, maxLength: 10 }), (sents) => {
        const input = sents.join(' ')
        const out = split(input)
        // Rejoining with a single space should equal input (with any
        // internal-whitespace collapsed to 1).
        const stripped = input.replace(/\s+/g, ' ').trim()
        const rejoined = out.join(' ').replace(/\s+/g, ' ').trim()
        expect(rejoined).toBe(stripped)
      }),
      { numRuns: 200 },
    )
  })

  it('offsets form a non-decreasing sequence', () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        const buf = splitToOffsets(s)
        const view = new Uint32Array(buf.buffer, buf.byteOffset, buf.length / 4)
        let prev = 0
        for (let i = 0; i < view.length; i += 2) {
          const start = view[i]
          const end = view[i + 1]
          expect(start).toBeGreaterThanOrEqual(prev)
          expect(end).toBeGreaterThanOrEqual(start)
          prev = end
        }
      }),
      { numRuns: 200 },
    )
  })
})
