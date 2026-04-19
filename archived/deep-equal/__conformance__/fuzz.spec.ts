import { describe, it } from 'vitest'
import fc from 'fast-check'
import equal from '../wrapper.js'

// Shallow JSON-safe values. Kept shallow on purpose so each property runs
// fast and shrinks cleanly when fast-check finds a counterexample.
const scalar = fc.oneof(fc.constant(null), fc.boolean(), fc.integer(), fc.string())
const jsonValue = fc.oneof(
  scalar,
  fc.array(scalar, { maxLength: 8 }),
  fc.dictionary(fc.string({ minLength: 1, maxLength: 6 }), scalar, { maxKeys: 6 }),
)

describe('deep-equal fuzzing', () => {
  it('reflexivity: x equals a structural clone of x', () => {
    fc.assert(
      fc.property(jsonValue, (x) => {
        const clone = JSON.parse(JSON.stringify(x))
        return equal(x, clone) === true
      }),
      { numRuns: 200, seed: 42 },
    )
  })

  it('symmetry: equal(a, b) === equal(b, a)', () => {
    fc.assert(
      fc.property(jsonValue, jsonValue, (a, b) => equal(a, b) === equal(b, a)),
      { numRuns: 200, seed: 42 },
    )
  })

  it('distinguishes mutated values', () => {
    fc.assert(
      fc.property(
        fc.dictionary(fc.string({ minLength: 1, maxLength: 5 }), fc.integer(), { minKeys: 1, maxKeys: 5 }),
        (obj) => {
          const mutated = { ...obj }
          const firstKey = Object.keys(mutated)[0]
          mutated[firstKey] = (mutated[firstKey] as number) + 1
          return equal(obj, mutated) === false
        },
      ),
      { numRuns: 200, seed: 42 },
    )
  })
})
