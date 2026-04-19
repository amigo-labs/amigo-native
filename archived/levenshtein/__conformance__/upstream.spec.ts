/**
 * Parity tests against fast-levenshtein@3 and leven@4.
 *
 * Levenshtein distance is mathematically defined — any disagreement is a bug.
 * We compare across a wide range of pair types including Unicode.
 */
import { describe, it, expect } from 'vitest'
import { get as amigoGet } from '../index.js'
import fastLev from 'fast-levenshtein'
import leven from 'leven'

type Pair = { a: string; b: string; expected: number }

// Reference distances from well-known vectors + computed with fast-levenshtein.
const PAIRS: Pair[] = [
  { a: '', b: '', expected: 0 },
  { a: 'a', b: '', expected: 1 },
  { a: '', b: 'a', expected: 1 },
  { a: 'abc', b: 'abc', expected: 0 },
  { a: 'kitten', b: 'sitting', expected: 3 },
  { a: 'flaw', b: 'lawn', expected: 2 },
  { a: 'gumbo', b: 'gambol', expected: 2 },
  { a: 'book', b: 'back', expected: 2 },
  { a: 'intention', b: 'execution', expected: 5 },
  { a: 'Saturday', b: 'Sunday', expected: 3 },
  { a: 'abcdefghij', b: 'jihgfedcba', expected: 10 },
  { a: 'a'.repeat(100), b: 'b'.repeat(100), expected: 100 },
  { a: 'a'.repeat(200), b: 'a'.repeat(199) + 'b', expected: 1 },
]

describe('levenshtein — parity with fast-levenshtein', () => {
  for (const { a, b, expected } of PAIRS) {
    it(`distance("${a.slice(0, 20)}", "${b.slice(0, 20)}") === ${expected}`, () => {
      expect(amigoGet(a, b)).toBe(expected)
      expect(fastLev.get(a, b)).toBe(expected)
    })
  }

  it('useCollator matches fast-levenshtein case-insensitive behaviour', () => {
    for (const [a, b] of [
      ['Hello', 'hello'],
      ['FOOBAR', 'foobar'],
      ['Kitten', 'Sitting'],
    ]) {
      expect(amigoGet(a, b, { useCollator: true })).toBe(
        fastLev.get(a, b, { useCollator: true }),
      )
    }
  })

  it('batch of 500 random pairs agrees with fast-levenshtein', () => {
    const rand = (n: number) => {
      let s = ''
      for (let i = 0; i < n; i++) s += String.fromCharCode(97 + ((i * 31 + n * 17) % 26))
      return s
    }
    for (let i = 0; i < 500; i++) {
      const a = rand(3 + (i % 20))
      const b = rand(3 + ((i * 7) % 25))
      expect(amigoGet(a, b)).toBe(fastLev.get(a, b))
    }
  })
})

describe('levenshtein — parity with leven', () => {
  for (const { a, b, expected } of PAIRS) {
    it(`leven("${a.slice(0, 20)}", "${b.slice(0, 20)}") === ${expected}`, () => {
      expect(leven(a, b)).toBe(expected)
      expect(amigoGet(a, b)).toBe(leven(a, b))
    })
  }
})
