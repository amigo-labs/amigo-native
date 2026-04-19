import { describe, it, expect } from 'vitest'
import { get, distance } from '../index.js'

describe('levenshtein', () => {
  describe('get (fast-levenshtein compat)', () => {
    it('returns 0 for identical strings', () => {
      expect(get('kitten', 'kitten')).toBe(0)
    })

    it('returns classic kitten→sitting distance', () => {
      expect(get('kitten', 'sitting')).toBe(3)
    })

    it('returns length for empty vs non-empty', () => {
      expect(get('', 'abc')).toBe(3)
      expect(get('abc', '')).toBe(3)
    })

    it('is case-sensitive by default', () => {
      expect(get('Hello', 'hello')).toBe(1)
    })

    it('is case-insensitive with useCollator', () => {
      expect(get('Hello', 'hello', { useCollator: true })).toBe(0)
    })

    it('handles long strings via SIMD path', () => {
      const a = 'a'.repeat(200)
      const b = 'a'.repeat(199) + 'b'
      expect(get(a, b)).toBe(1)
    })
  })

  describe('distance (modern alias)', () => {
    it('matches get', () => {
      expect(distance('flaw', 'lawn')).toBe(get('flaw', 'lawn'))
    })
  })
})
