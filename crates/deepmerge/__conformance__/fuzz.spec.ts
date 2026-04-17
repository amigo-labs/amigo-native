import { describe, it, expect } from 'vitest'
import merge from '../wrapper.js'

import fc from 'fast-check'

const jsonObject: fc.Arbitrary<Record<string, unknown>> = fc.dictionary(
  fc.string({ minLength: 1, maxLength: 6 }),
  fc.oneof(fc.integer(), fc.string(), fc.boolean(), fc.constant(null)),
  { maxKeys: 6 },
)

describe('deepmerge fuzzing', () => {
  it('identity right: merge(x, {}) preserves x', () => {
    fc.assert(
      fc.property(jsonObject, (x) => {
        const result = merge(x, {})
        expect(result).toEqual(x)
      }),
      { numRuns: 200, seed: 42 },
    )
  })

  it('identity left: merge({}, x) equals x', () => {
    fc.assert(
      fc.property(jsonObject, (x) => {
        const result = merge({}, x)
        expect(result).toEqual(x)
      }),
      { numRuns: 200, seed: 42 },
    )
  })

  it('source keys win over target on scalar collision', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 5 }), fc.integer(), fc.integer(), (key, a, b) => {
        fc.pre(a !== b)
        const result = merge({ [key]: a }, { [key]: b }) as Record<string, unknown>
        return result[key] === b
      }),
      { numRuns: 200, seed: 42 },
    )
  })
})
