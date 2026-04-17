import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { nanoid, customAlphabet } from '../wrapper.js'

const DEFAULT_ALPHABET = /^[A-Za-z0-9_-]+$/

describe('nanoid fuzzing', () => {
  it('respects requested size', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 256 }), (size) => nanoid(size).length === size),
      { numRuns: 200, seed: 42 },
    )
  })

  it('default alphabet is URL-safe', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 64 }), (size) => DEFAULT_ALPHABET.test(nanoid(size))),
      { numRuns: 200, seed: 42 },
    )
  })

  it('custom alphabet is respected', () => {
    fc.assert(
      fc.property(
        fc.stringOf(fc.constantFrom(...'abcdef0123456789'), { minLength: 2, maxLength: 16 }),
        fc.integer({ min: 1, max: 32 }),
        (alphabet, size) => {
          const unique = [...new Set(alphabet)].join('')
          fc.pre(unique.length >= 2)
          const factory = customAlphabet(unique, size)
          const id = factory()
          if (id.length !== size) return false
          const allowed = new Set(unique)
          for (const ch of id) if (!allowed.has(ch)) return false
          return true
        },
      ),
      { numRuns: 200, seed: 42 },
    )
  })

  it('generates distinct IDs over a batch (probabilistic)', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 1000; i++) seen.add(nanoid())
    expect(seen.size).toBe(1000)
  })
})
