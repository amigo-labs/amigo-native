/**
 * Parity tests against deepmerge@4.
 */
import { describe, it, expect } from 'vitest'
import amigoMerge from '../wrapper.js'
import upstream from 'deepmerge'

const CASES: Array<[string, object, object]> = [
  ['flat overwrite', { a: 1, b: 2 }, { b: 3, c: 4 }],
  ['deep nested', { x: { a: 1, y: { z: 1 } } }, { x: { b: 2, y: { w: 2 } } }],
  ['arrays concat', { l: [1, 2] }, { l: [3, 4] }],
  ['object replaces primitive', { x: 1 }, { x: { a: 1 } }],
  ['primitive replaces object', { x: { a: 1 } }, { x: 1 }],
  ['null source wins', { x: 1 }, { x: null }],
  ['mixed nested', { a: { b: [1], c: 'x' } }, { a: { b: [2], d: 'y' } }],
]

describe('deepmerge — parity with deepmerge@4', () => {
  for (const [label, a, b] of CASES) {
    it(label, () => {
      expect(amigoMerge(a, b)).toEqual(upstream(a, b))
    })
  }

  it('arrayMerge overwrite matches', () => {
    const a = { l: [1, 2] }
    const b = { l: [3, 4] }
    expect(amigoMerge(a, b, { arrayMerge: 'overwrite' })).toEqual(
      upstream(a, b, { arrayMerge: (_t, s) => s }),
    )
  })

  it('prototype pollution: __proto__ filtered', () => {
    const poison = JSON.parse('{"__proto__": {"polluted": true}}')
    const amigo = amigoMerge({}, poison) as Record<string, unknown>
    const ups = upstream({}, poison) as Record<string, unknown>
    expect(amigo.polluted).toBeUndefined()
    expect(ups.polluted).toBeUndefined()
  })

  it('merge.all agrees with upstream.all', () => {
    const xs = [{ a: 1 }, { b: 2 }, { c: 3, a: 10 }]
    expect(amigoMerge.all(xs)).toEqual(upstream.all(xs))
  })
})
