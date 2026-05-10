import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { pixelmatch as amigoPixelmatch, countDiff } from '../index.js'

const runs = Number(process.env.FUZZ_RUNS ?? 200)

const dim = fc.integer({ min: 1, max: 16 })
const u8 = fc.integer({ min: 0, max: 255 })

function bufferFor(w: number, h: number, fill: (i: number) => number): Buffer {
  const buf = Buffer.alloc(w * h * 4)
  for (let i = 0; i < buf.length; i++) buf[i] = fill(i)
  return buf
}

describe('pixelmatch — fuzz (totality + safety)', () => {
  it('never throws on arbitrary RGBA buffers', () => {
    fc.assert(
      fc.property(dim, dim, fc.array(u8, { minLength: 1, maxLength: 1024 }), (w, h, seed) => {
        const a = bufferFor(w, h, (i) => seed[i % seed.length])
        const b = bufferFor(w, h, (i) => seed[(i + 7) % seed.length])
        const r = amigoPixelmatch(a, b, w, h)
        return r.numDiff >= 0 && r.numDiff <= w * h && r.diff.length === a.length
      }),
      { numRuns: runs },
    )
  })

  it('identical inputs always produce numDiff=0', () => {
    fc.assert(
      fc.property(dim, dim, fc.array(u8, { minLength: 1, maxLength: 1024 }), (w, h, seed) => {
        const buf = bufferFor(w, h, (i) => seed[i % seed.length])
        const r = amigoPixelmatch(buf, Buffer.from(buf), w, h)
        return r.numDiff === 0
      }),
      { numRuns: runs },
    )
  })

  it('countDiff equals pixelmatch().numDiff', () => {
    fc.assert(
      fc.property(dim, dim, fc.array(u8, { minLength: 1, maxLength: 1024 }), (w, h, seed) => {
        const a = bufferFor(w, h, (i) => seed[i % seed.length])
        const b = bufferFor(w, h, (i) => (seed[(i + 13) % seed.length] ^ 0xa5) & 0xff)
        const r = amigoPixelmatch(a, b, w, h)
        return countDiff(a, b, w, h) === r.numDiff
      }),
      { numRuns: runs },
    )
  })

  it('symmetry: numDiff(a,b) == numDiff(b,a) under default options', () => {
    fc.assert(
      fc.property(dim, dim, fc.array(u8, { minLength: 1, maxLength: 1024 }), (w, h, seed) => {
        const a = bufferFor(w, h, (i) => seed[i % seed.length])
        const b = bufferFor(w, h, (i) => (seed[(i + 13) % seed.length] ^ 0xa5) & 0xff)
        return amigoPixelmatch(a, b, w, h).numDiff === amigoPixelmatch(b, a, w, h).numDiff
      }),
      { numRuns: runs },
    )
  })

  // Strict numDiff parity with upstream on random inputs is *not* a sound
  // fuzz invariant: random pixels frequently land within ±1 ulp of the
  // threshold boundary, where JS double-precision and Rust f64 can disagree
  // by 1 pixel due to operation-order differences in the YIQ delta. Curated
  // upstream parity lives in `upstream.spec.ts` with fixtures chosen to
  // avoid those boundaries; see `divergences.md` for the FP-determinism
  // contract.

  it('rejects mismatched buffer sizes', () => {
    expect(() => amigoPixelmatch(Buffer.alloc(16), Buffer.alloc(8), 2, 2)).toThrow()
  })
})
