import { bench, describe } from 'vitest'
import { detect } from '../index.js'
// @ts-expect-error — franc has no type-declarations package
import { franc } from 'franc'

const TWEET = 'hello world from my tiny test'
const PARAGRAPH =
  'The quick brown fox jumps over the lazy dog and the lazy dog was not amused by this sudden interruption of his peaceful slumber. He had been dreaming of fresh bones and open fields, and the fox appeared entirely unaware that such an interruption would be unwelcome.'
const ARTICLE = PARAGRAPH.repeat(20) // ~11 KB

describe('language-detect — tweet (50 B)', () => {
  bench('@amigo-labs/language-detect', () => {
    detect(TWEET)
  })
  bench('franc', () => {
    franc(TWEET)
  })
})

describe('language-detect — paragraph (~300 B)', () => {
  bench('@amigo-labs/language-detect', () => {
    detect(PARAGRAPH)
  })
  bench('franc', () => {
    franc(PARAGRAPH)
  })
})

describe('language-detect — article (~11 KB)', () => {
  bench('@amigo-labs/language-detect', () => {
    detect(ARTICLE)
  })
  bench('franc', () => {
    franc(ARTICLE)
  })
})
