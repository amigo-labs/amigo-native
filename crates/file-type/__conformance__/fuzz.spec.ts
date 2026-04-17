import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { fileTypeFromBufferSync } from '../index.js'

describe('file-type fuzzing', () => {
  it('never throws on arbitrary input', () => {
    fc.assert(
      fc.property(fc.uint8Array({ minLength: 0, maxLength: 4096 }), (bytes) => {
        const result = fileTypeFromBufferSync(Buffer.from(bytes))
        if (result !== null) {
          expect(typeof result.ext).toBe('string')
          expect(typeof result.mime).toBe('string')
          expect(result.mime).toMatch(/^[a-z-]+\//)
        }
      }),
      { numRuns: 300, seed: 42 },
    )
  })

  it('empty buffer returns null', () => {
    expect(fileTypeFromBufferSync(Buffer.alloc(0))).toBeNull()
  })

  it('detection is deterministic', () => {
    fc.assert(
      fc.property(fc.uint8Array({ minLength: 16, maxLength: 512 }), (bytes) => {
        const buf = Buffer.from(bytes)
        const a = fileTypeFromBufferSync(buf)
        const b = fileTypeFromBufferSync(buf)
        expect(a).toEqual(b)
      }),
      { numRuns: 100, seed: 42 },
    )
  })
})
