import { bench, describe } from 'vitest'
import { split, splitToOffsets } from '../index.js'
// @ts-expect-error — sbd has no types
import sbd from 'sbd'

const SHORT = 'Hello world. How are you? I am fine. Thank you.'
const MEDIUM = Array.from({ length: 50 }, (_, i) =>
  `This is sentence number ${i}, and it contains some filler text to reach a meaningful length.`,
).join(' ')

describe('short (~50 chars, 4 sentences)', () => {
  bench('@amigo-labs/sentences split()', () => {
    split(SHORT)
  })
  bench('@amigo-labs/sentences splitToOffsets()', () => {
    splitToOffsets(SHORT)
  })
  bench('sbd', () => {
    sbd.sentences(SHORT)
  })
})

describe('medium (~5 KB, 50 sentences)', () => {
  bench('@amigo-labs/sentences split()', () => {
    split(MEDIUM)
  })
  bench('@amigo-labs/sentences splitToOffsets()', () => {
    splitToOffsets(MEDIUM)
  })
  bench('sbd', () => {
    sbd.sentences(MEDIUM)
  })
})
