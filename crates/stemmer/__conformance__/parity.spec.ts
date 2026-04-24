import { describe, it, expect } from 'vitest'
import { Stemmer, stemOnce } from '../index.js'

describe('stemmer — Snowball English invariants', () => {
  const s = new Stemmer('english')

  // Porter-test-style vocabulary-invariance pairs. These are not complete
  // Porter output — just shape-invariants: common inflections collapse.
  it('collapses run / running / runs to a shared root prefix', () => {
    const [a, b, c] = s.stemMany(['run', 'running', 'runs'])
    expect(a).toBe(b)
    expect(b).toBe(c)
  })

  it('collapses cat / cats to a shared root prefix', () => {
    const [a, b] = s.stemMany(['cat', 'cats'])
    expect(a).toBe(b)
  })

  it('stemming reaches a fixed point for common words', () => {
    // Snowball isn't always idempotent after one pass, but it converges
    // in a few iterations for realistic words.
    const word = 'running'
    const first = stemOnce('english', word)
    const second = stemOnce('english', first)
    // At worst, `second` is the fixed point. For "running" this is
    // reached immediately, so first === second is the expected shape.
    expect(second).toBe(first)
  })
})

describe('stemmer — German Snowball invariants', () => {
  const s = new Stemmer('german')

  it('collapses German plural inflections', () => {
    // "Hund" / "Hunde" / "Hunden" share a root
    const [a, b, c] = s.stemMany(['Hund', 'Hunde', 'Hunden'])
    expect(a).toBe(b)
    expect(b).toBe(c)
  })
})

describe('stemmer — batch-surface invariants', () => {
  const s = new Stemmer('english')

  it('stemMany output length equals input length', () => {
    const input = ['running', 'cats', 'jumping', 'swimming', 'fishes']
    expect(s.stemMany(input)).toHaveLength(input.length)
  })

  it('tokenizeAndStem on empty text returns empty array', () => {
    expect(s.tokenizeAndStem('')).toEqual([])
  })

  it('stemBuffer of newline-delimited input round-trips through decode', () => {
    const buf = s.tokenizeAndStemToBuffer('cats running quickly')
    const text = buf.toString('utf8')
    expect(text.split('\n').length).toBe(3)
  })
})
