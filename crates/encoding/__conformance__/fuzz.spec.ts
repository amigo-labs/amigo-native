import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { encode, decode } from '../index.js'

describe('encoding fuzzing', () => {
  it('utf-8 roundtrip preserves the string', () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        const decoded = decode(encode(s, 'utf-8'), 'utf-8')
        expect(decoded).toBe(s)
      }),
      { numRuns: 300, seed: 42 },
    )
  })

  it('utf-16le roundtrip preserves the string', () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        const decoded = decode(encode(s, 'utf-16le'), 'utf-16le')
        expect(decoded).toBe(s)
      }),
      { numRuns: 200, seed: 42 },
    )
  })

  it('latin1 roundtrip preserves ASCII-safe strings', () => {
    fc.assert(
      fc.property(fc.stringMatching(/^[\x20-\x7E]*$/), (s) => {
        const decoded = decode(encode(s, 'latin1'), 'latin1')
        expect(decoded).toBe(s)
      }),
      { numRuns: 200, seed: 42 },
    )
  })
})
