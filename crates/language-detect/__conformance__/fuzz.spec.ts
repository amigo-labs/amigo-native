import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { detect, detectAll, detectMany, languageExists } from '../index.js'

const runs = Number(process.env.FUZZ_RUNS ?? 200)

describe('language-detect — fuzz (totality + safety)', () => {
  it('detect never throws on arbitrary unicode', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'binary' }), (input) => {
        const out = detect(input)
        expect(typeof out).toBe('string')
        // ISO-639-3 codes are always 3 lowercase letters; "und" is our
        // universal sentinel.
        expect(out).toMatch(/^[a-z]{3}$/)
      }),
      { numRuns: runs },
    )
  })

  it('detectAll never throws and returns a well-formed array', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'binary' }), (input) => {
        const out = detectAll(input)
        expect(Array.isArray(out)).toBe(true)
        for (const m of out) {
          expect(m.lang).toMatch(/^[a-z]{3}$/)
          expect(m.confidence).toBeGreaterThanOrEqual(0)
          expect(m.confidence).toBeLessThanOrEqual(1)
        }
      }),
      { numRuns: runs },
    )
  })

  it('detectMany returns an array of the same length as input', () => {
    fc.assert(
      fc.property(fc.array(fc.string({ unit: 'binary' }), { maxLength: 20 }), (inputs) => {
        const out = detectMany(inputs)
        expect(out).toHaveLength(inputs.length)
      }),
      { numRuns: runs / 2 },
    )
  })

  it('languageExists is total — returns boolean for arbitrary input', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'binary', maxLength: 20 }), (input) => {
        expect(typeof languageExists(input)).toBe('boolean')
      }),
      { numRuns: runs },
    )
  })
})
