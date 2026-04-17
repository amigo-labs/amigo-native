import { describe, it, expect } from 'vitest'
import { nanoid, nanoidCustom, customAlphabet } from '../wrapper.js'

describe('nanoid', () => {
  it('default length is 21', () => {
    expect(nanoid().length).toBe(21)
  })

  it('custom size is exact', () => {
    for (const n of [1, 5, 10, 32, 64]) {
      expect(nanoid(n).length).toBe(n)
    }
  })

  it('default alphabet uses URL-safe chars', () => {
    const id = nanoid(1000)
    expect(id).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it('no collisions in 10k generations', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 10_000; i++) seen.add(nanoid())
    expect(seen.size).toBe(10_000)
  })
})

describe('nanoidCustom', () => {
  it('only uses provided alphabet', () => {
    const id = nanoidCustom('abc', 1000)
    expect(id).toMatch(/^[abc]+$/)
  })

  it('rejects empty alphabet', () => {
    expect(() => nanoidCustom('', 5)).toThrow()
  })
})

describe('customAlphabet', () => {
  it('returns a factory that produces IDs of the default size', () => {
    const f = customAlphabet('XYZ', 8)
    expect(f().length).toBe(8)
    expect(f()).toMatch(/^[XYZ]+$/)
  })

  it('factory accepts per-call size override', () => {
    const f = customAlphabet('AB', 5)
    expect(f(20).length).toBe(20)
  })

  it('rejects empty alphabet', () => {
    expect(() => customAlphabet('')).toThrow()
  })
})
