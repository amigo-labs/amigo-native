import { describe, it } from 'vitest'
import fc from 'fast-check'
import equal from '../wrapper.js'

const jsonValue: fc.Arbitrary<unknown> = fc.letrec((tie) => ({
  value: fc.oneof(
    { depthSize: 'small' },
    fc.constant(null),
    fc.boolean(),
    fc.integer(),
    fc.string(),
    fc.array(tie('value'), { maxLength: 8 }),
    fc.dictionary(fc.string({ minLength: 1, maxLength: 8 }), tie('value'), { maxKeys: 6 }),
  ),
})).value

describe('deep-equal fuzzing', () => {
  it('reflexivity: x equals x (structural clone)', () => {
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
      fc.property(fc.dictionary(fc.string({ minLength: 1, maxLength: 5 }), fc.integer(), { minKeys: 1, maxKeys: 5 }), (obj) => {
        const mutated = { ...obj }
        const firstKey = Object.keys(mutated)[0]
        mutated[firstKey] = (mutated[firstKey] as number) + 1
        return equal(obj, mutated) === false
      }),
      { numRuns: 200, seed: 42 },
    )
  })
})
