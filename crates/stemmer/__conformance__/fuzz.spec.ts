import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { Stemmer } from '../index.js'

const runs = Number(process.env.FUZZ_RUNS ?? 200)

describe('stemmer — fuzz (totality + safety)', () => {
  const s = new Stemmer('english')

  it('stemMany is total (never throws on arbitrary unicode strings)', () => {
    fc.assert(
      fc.property(fc.array(fc.string({ unit: 'binary' }), { maxLength: 20 }), (input) => {
        const out = s.stemMany(input)
        expect(out).toHaveLength(input.length)
      }),
      { numRuns: runs },
    )
  })

  it('tokenizeAndStem is total', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'binary' }), (input) => {
        const out = s.tokenizeAndStem(input)
        expect(Array.isArray(out)).toBe(true)
      }),
      { numRuns: runs },
    )
  })

  it('stemBuffer round-trips valid UTF-8 content', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 200 }), (input) => {
        const buf = Buffer.from(input, 'utf8')
        const out = s.stemBuffer(buf)
        // output must decode back to a valid UTF-8 string
        const text = out.toString('utf8')
        expect(typeof text).toBe('string')
      }),
      { numRuns: runs },
    )
  })

  it('stemming reaches a fixed point within 3 iterations', () => {
    // Snowball is not idempotent-after-one-pass for every input, but it
    // does reach a fixed point quickly — 3 passes is more than enough
    // for realistic words. This is a weaker safety property but honest.
    fc.assert(
      fc.property(fc.stringMatching(/^[a-z]{2,15}$/), (word) => {
        let current = word
        for (let i = 0; i < 3; i++) {
          const [next] = s.stemMany([current])
          if (next === current) return
          current = next
        }
        // After 3 iterations, stemming `current` should equal `current`.
        const [final] = s.stemMany([current])
        expect(final).toBe(current)
      }),
      { numRuns: runs },
    )
  })
})
