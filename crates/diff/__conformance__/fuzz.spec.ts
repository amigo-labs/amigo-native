import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { diffLines, diffChars, diffLinesToOffsets } from '../index.js'

const runs = Number(process.env.FUZZ_RUNS ?? 200)

describe('diff — fuzz (totality + reconstruction)', () => {
  it('diffLines is total for arbitrary unicode', () => {
    fc.assert(
      fc.property(fc.fullUnicodeString(), fc.fullUnicodeString(), (a, b) => {
        const h = diffLines(a, b)
        expect(Array.isArray(h)).toBe(true)
      }),
      { numRuns: runs },
    )
  })

  it('hunk reconstruction recovers the new string', () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), (a, b) => {
        const h = diffLines(a, b)
        const rebuilt = h
          .filter((x) => !x.removed)
          .map((x) => x.value)
          .join('')
        expect(rebuilt).toBe(b)
      }),
      { numRuns: runs },
    )
  })

  it('offset-packed output has length % 20 == 0', () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), (a, b) => {
        const buf = diffLinesToOffsets(a, b)
        expect(buf.length % 20).toBe(0)
      }),
      { numRuns: runs / 2 },
    )
  })

  it('diffChars is total and preserves Equal+Added content length', () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), (a, b) => {
        const h = diffChars(a, b)
        const keptLen = h
          .filter((x) => !x.removed)
          .reduce((sum, x) => sum + x.value.length, 0)
        expect(keptLen).toBe(b.length)
      }),
      { numRuns: runs / 2 },
    )
  })
})
