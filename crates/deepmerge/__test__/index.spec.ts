import { describe, it, expect } from 'vitest'
import merge from '../wrapper.js'

describe('deepmerge', () => {
  it('merges flat objects with source winning', () => {
    expect(merge({ a: 1, b: 2 }, { b: 3, c: 4 })).toEqual({ a: 1, b: 3, c: 4 })
  })

  it('merges deep', () => {
    expect(merge({ x: { a: 1 } }, { x: { b: 2 } })).toEqual({ x: { a: 1, b: 2 } })
  })

  it('concats arrays by default', () => {
    expect(merge({ l: [1, 2] }, { l: [3, 4] })).toEqual({ l: [1, 2, 3, 4] })
  })

  it('overwrites arrays with option', () => {
    expect(merge({ l: [1, 2] }, { l: [3, 4] }, { arrayMerge: 'overwrite' })).toEqual({
      l: [3, 4],
    })
  })

  it('does not mutate inputs', () => {
    const a = { x: { a: 1 } }
    const b = { x: { b: 2 } }
    merge(a, b)
    expect(a).toEqual({ x: { a: 1 } })
    expect(b).toEqual({ x: { b: 2 } })
  })

  it('rejects prototype pollution keys', () => {
    const poison = JSON.parse('{"__proto__": {"polluted": true}}')
    const out = merge({}, poison) as Record<string, unknown>
    // Global Object.prototype was not polluted.
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined()
    // The result object has no own `polluted` key.
    expect(Object.prototype.hasOwnProperty.call(out, 'polluted')).toBe(false)
  })

  it('merge.all handles multiple objects', () => {
    expect(merge.all([{ a: 1 }, { b: 2 }, { c: 3 }])).toEqual({ a: 1, b: 2, c: 3 })
  })

  it('merge.all throws for non-array input', () => {
    expect(() => (merge.all as unknown as (v: unknown) => unknown)({})).toThrow()
  })
})
