import { describe, it, expect } from 'vitest'
import { Stemmer } from '../index.js'
// @ts-expect-error — natural has no first-party types package
import natural from 'natural'

// natural uses a different Snowball revision; we cross-verify on a
// **shape** basis: whatever the stemmers produce, they must be
// deterministic and must collapse the same inflection families.
// Byte-exact parity is explicitly not a goal — see divergences.md.

// Pairs that collapse in both engines. "quick / quickly" is omitted
// because the two Snowball revisions disagree on the adverb suffix.
const PAIRS: Array<[string, string]> = [
  ['run', 'running'],
  ['cat', 'cats'],
  ['fish', 'fishes'],
]

describe('stemmer — shape parity with natural.PorterStemmer', () => {
  const s = new Stemmer('english')

  for (const [base, inflected] of PAIRS) {
    it(`both engines collapse ${base} / ${inflected}`, () => {
      const ours = s.stemMany([base, inflected])
      const theirs = [
        natural.PorterStemmer.stem(base),
        natural.PorterStemmer.stem(inflected),
      ]
      expect(ours[0]).toBe(ours[1])
      expect(theirs[0]).toBe(theirs[1])
    })
  }

  it('tokenizeAndStem on a paragraph produces a similar token count', () => {
    const text = 'the quick brown fox jumps over the lazy dog'
    const ours = s.tokenizeAndStem(text)
    const theirs = natural.PorterStemmer.tokenizeAndStem(text)
    // Both should produce on the order of 7–9 tokens. Exact count may
    // differ due to min-length / stopword policies — we just check
    // we're in the same ballpark (±5).
    expect(Math.abs(ours.length - theirs.length)).toBeLessThanOrEqual(5)
  })
})
