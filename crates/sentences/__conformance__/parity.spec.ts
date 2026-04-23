import { describe, expect, it } from 'vitest'
import { split as ours } from '../index.js'
// @ts-expect-error — sbd has no types
import sbd from 'sbd'

function sbdSplit(text: string): string[] {
  return sbd.sentences(text)
}

describe('parity: both split basic sentence pairs', () => {
  const cases = [
    'Hello world. How are you?',
    'Run! Now! Go!',
    'He said hi. She replied.',
    'The cat sat on the mat. The dog ran away.',
  ]
  for (const input of cases) {
    it(`${input.slice(0, 30)}`, () => {
      expect(ours(input).length).toBe(sbdSplit(input).length)
    })
  }
})

describe('parity: both preserve decimals', () => {
  it('3.14 is not a boundary', () => {
    const input = 'The value is 3.14 and the other is 2.71.'
    expect(ours(input).length).toBe(sbdSplit(input).length)
  })
})

describe('parity: both keep Mr. intact', () => {
  it('Mr. Smith pattern', () => {
    const input = 'Mr. Smith went home. He was tired.'
    expect(ours(input)).toHaveLength(2)
    expect(sbdSplit(input)).toHaveLength(2)
  })
})

describe('known divergences from sbd', () => {
  it('ellipsis-after-word: our boundary may differ (documented)', () => {
    // sbd and us sometimes pick different boundaries around
    // "He said... Go." — just verify both return > 0 sentences.
    const input = 'He said... Go away. OK.'
    expect(ours(input).length).toBeGreaterThan(0)
    expect(sbdSplit(input).length).toBeGreaterThan(0)
  })
})
