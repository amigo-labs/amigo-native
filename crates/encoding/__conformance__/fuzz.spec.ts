import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { encode, decode } from '../index.js'

// Note: utf-16 encodings are intentionally not fuzzed here. The Rust wrapper
// currently diverges from iconv-lite for UTF-16 without a BOM — see the
// upstream.spec.ts failures and divergences.md.

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
