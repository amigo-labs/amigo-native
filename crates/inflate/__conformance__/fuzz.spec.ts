import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { deflate, inflate, gzip, ungzip, deflateRaw, inflateRaw } from '../index.js'

describe('inflate fuzzing', () => {
  it('deflate → inflate roundtrip preserves bytes', () => {
    fc.assert(
      fc.property(fc.uint8Array({ minLength: 0, maxLength: 8192 }), (bytes) => {
        const input = Buffer.from(bytes)
        const out = inflate(deflate(input))
        expect(out.equals(input)).toBe(true)
      }),
      { numRuns: 200, seed: 42 },
    )
  })

  it('gzip → ungzip roundtrip preserves bytes', () => {
    fc.assert(
      fc.property(fc.uint8Array({ minLength: 0, maxLength: 8192 }), (bytes) => {
        const input = Buffer.from(bytes)
        const out = ungzip(gzip(input))
        expect(out.equals(input)).toBe(true)
      }),
      { numRuns: 200, seed: 42 },
    )
  })

  it('deflateRaw → inflateRaw roundtrip preserves bytes', () => {
    fc.assert(
      fc.property(fc.uint8Array({ minLength: 0, maxLength: 8192 }), (bytes) => {
        const input = Buffer.from(bytes)
        const out = inflateRaw(deflateRaw(input))
        expect(out.equals(input)).toBe(true)
      }),
      { numRuns: 200, seed: 42 },
    )
  })

  it('roundtrip holds across compression levels 0..9', () => {
    fc.assert(
      fc.property(
        fc.uint8Array({ minLength: 64, maxLength: 1024 }),
        fc.integer({ min: 0, max: 9 }),
        (bytes, level) => {
          const input = Buffer.from(bytes)
          const out = inflate(deflate(input, { level }))
          expect(out.equals(input)).toBe(true)
        },
      ),
      { numRuns: 100, seed: 42 },
    )
  })
})
