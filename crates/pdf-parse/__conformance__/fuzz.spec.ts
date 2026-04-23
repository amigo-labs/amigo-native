import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { parseSync } from '../index.js'

describe('fuzz invariants', () => {
  it('never panics on random bytes', () => {
    fc.assert(
      fc.property(
        fc.uint8Array({ minLength: 0, maxLength: 2048 }),
        (bytes) => {
          const result = parseSync(Buffer.from(bytes))
          expect(typeof result.text).toBe('string')
          expect(typeof result.numpages).toBe('number')
        },
      ),
      { numRuns: 100 },
    )
  })

  it('never panics on almost-a-pdf bytes', () => {
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 512 }), (tail) => {
        const header = Buffer.from('%PDF-1.4\n')
        const combined = Buffer.concat([header, Buffer.from(tail)])
        const result = parseSync(combined)
        expect(typeof result.text).toBe('string')
      }),
      { numRuns: 100 },
    )
  })
})
