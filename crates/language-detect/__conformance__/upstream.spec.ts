import { describe, it, expect } from 'vitest'
import { detect } from '../index.js'
// @ts-expect-error — franc has no types-package; ISO-639-3 codes match ours.
import { franc } from 'franc'

// Cross-verification against franc on a corpus where both libraries
// agree on the dominant language. This is a shape-parity test, not an
// exhaustive guarantee — whatlang and franc disagree on edge cases
// (short inputs, mixed-language text); see divergences.md.
const CORPUS: Array<{ text: string; expected: string }> = [
  {
    text: 'The quick brown fox jumps over the lazy dog and the lazy dog was not amused by this sudden interruption of his peaceful slumber.',
    expected: 'eng',
  },
  {
    text: 'Der schnelle braune Fuchs springt über den faulen Hund und der faule Hund war nicht erfreut über diese plötzliche Unterbrechung seines friedlichen Schlummers.',
    expected: 'deu',
  },
  {
    text: 'Le renard brun rapide saute par-dessus le chien paresseux et le chien paresseux ne fut pas amusé par cette interruption soudaine de son sommeil paisible.',
    expected: 'fra',
  },
  {
    text: 'El rápido zorro marrón salta sobre el perro perezoso y el perro perezoso no se divirtió con esta repentina interrupción de su pacífico sueño.',
    expected: 'spa',
  },
]

describe('language-detect — upstream conformance (vs franc)', () => {
  for (const { text, expected } of CORPUS) {
    it(`agrees with franc on ${expected}`, () => {
      const ours = detect(text)
      const theirs = franc(text)
      expect(ours).toBe(expected)
      expect(theirs).toBe(expected)
    })
  }
})
