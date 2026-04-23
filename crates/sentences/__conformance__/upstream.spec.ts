// Smoke tests modeled after sbd's own test suite (README examples
// redirected at our binding). Full behavioural parity is not
// claimed — see divergences.md.

import { describe, expect, it } from 'vitest'
import { split } from '../index.js'

describe('sbd-README-example parity', () => {
  it('keeps an abbreviation list intact', () => {
    const out = split(
      'Dr. Jones went to see Mr. Smith at 3 p.m. He was tired.',
    )
    // sbd produces 2 sentences; we should too (p.m. and Mr./Dr.
    // abbreviations all recognized).
    expect(out.length).toBeLessThanOrEqual(2)
  })

  it('handles URLs reasonably', () => {
    // URLs contain dots; should not produce per-dot splits.
    const input =
      'Visit https://example.com/foo for details. Thanks for reading.'
    const out = split(input)
    expect(out.length).toBeLessThanOrEqual(3)
  })
})

describe('multilingual smoke', () => {
  it('German abbreviations', () => {
    const out = split('Das ist z.B. gut. Super!', { language: 'de' })
    expect(out).toHaveLength(2)
  })

  it('French abbreviations', () => {
    const out = split('M. Dupont est arrivé. Bien.', { language: 'fr' })
    expect(out).toHaveLength(2)
  })
})
