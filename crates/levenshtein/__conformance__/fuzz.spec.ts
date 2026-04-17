import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { distance } from '../index.js'

describe('levenshtein fuzzing', () => {
  it('reflexivity: distance(x, x) === 0', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 200 }), (s) => distance(s, s) === 0),
      { numRuns: 300, seed: 42 },
    )
  })

  it('symmetry: distance(a, b) === distance(b, a)', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 200 }), fc.string({ maxLength: 200 }), (a, b) => {
        return distance(a, b) === distance(b, a)
      }),
      { numRuns: 300, seed: 42 },
    )
  })

  it('triangle inequality: d(a,c) <= d(a,b) + d(b,c)', () => {
    fc.assert(
      fc.property(
        fc.string({ maxLength: 80 }),
        fc.string({ maxLength: 80 }),
        fc.string({ maxLength: 80 }),
        (a, b, c) => distance(a, c) <= distance(a, b) + distance(b, c),
      ),
      { numRuns: 100, seed: 42 },
    )
  })

  it('distance is bounded by max(len(a), len(b))', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 200 }), fc.string({ maxLength: 200 }), (a, b) => {
        return distance(a, b) <= Math.max(a.length, b.length)
      }),
      { numRuns: 200, seed: 42 },
    )
  })
})
