import { describe, it, expect } from 'vitest'
import equal from '../wrapper.js'

describe('deep-equal', () => {
  it('primitives', () => {
    expect(equal(1, 1)).toBe(true)
    expect(equal('a', 'a')).toBe(true)
    expect(equal(null, null)).toBe(true)
    expect(equal(1, '1')).toBe(false)
    expect(equal(undefined, null)).toBe(false)
  })

  it('NaN equals NaN (fast-deep-equal semantics)', () => {
    // fast-deep-equal's final `a !== a && b !== b` clause treats NaN/NaN as equal.
    expect(equal(NaN, NaN)).toBe(true)
  })

  it('arrays', () => {
    expect(equal([1, 2, 3], [1, 2, 3])).toBe(true)
    expect(equal([1, 2, 3], [1, 2])).toBe(false)
  })

  it('objects', () => {
    expect(equal({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true)
    expect(equal({ a: 1 }, { a: 1, b: 2 })).toBe(false)
  })

  it('nested', () => {
    expect(equal({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] })).toBe(true)
    expect(equal({ a: [1, { b: 2 }] }, { a: [1, { b: 3 }] })).toBe(false)
  })

  it('dates', () => {
    expect(equal(new Date(2024, 0, 1), new Date(2024, 0, 1))).toBe(true)
    expect(equal(new Date(2024, 0, 1), new Date(2024, 0, 2))).toBe(false)
  })

  it('regexp', () => {
    expect(equal(/abc/gi, /abc/gi)).toBe(true)
    expect(equal(/abc/g, /abc/i)).toBe(false)
  })

  it('maps', () => {
    expect(equal(new Map([['a', 1]]), new Map([['a', 1]]))).toBe(true)
    expect(equal(new Map([['a', 1]]), new Map([['a', 2]]))).toBe(false)
  })

  it('sets', () => {
    expect(equal(new Set([1, 2, 3]), new Set([3, 2, 1]))).toBe(true)
    expect(equal(new Set([1, 2]), new Set([1, 3]))).toBe(false)
  })

  it('typed arrays', () => {
    expect(equal(new Uint8Array([1, 2]), new Uint8Array([1, 2]))).toBe(true)
    expect(equal(new Uint8Array([1, 2]), new Uint16Array([1, 2]))).toBe(false)
  })
})
