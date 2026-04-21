import { describe, it, expect } from 'vitest'
import { detect, detectIfLong, languageExists } from '../index.js'

describe('language-detect — parity invariants', () => {
  it('returns lowercase ISO-639-3 codes', () => {
    const got = detect('The quick brown fox jumps over the lazy dog')
    expect(got).toMatch(/^[a-z]{3}$/)
  })

  it('"und" is the universal unknown sentinel', () => {
    expect(detect('')).toBe('und')
    expect(detect('x')).toBe('und')
  })

  it('detectIfLong returns null below min-length (safe default)', () => {
    expect(detectIfLong('hi')).toBeNull()
    expect(detectIfLong('')).toBeNull()
  })

  it('languageExists is deterministic and case-insensitive', () => {
    expect(languageExists('eng')).toBe(languageExists('ENG'))
    expect(languageExists('deu')).toBe(languageExists('DEU'))
  })

  it('only-allowlist confines output to listed codes or "und"', () => {
    const allow = ['deu', 'fra']
    const got = detect(
      'The quick brown fox jumps over the lazy dog — a very long sentence indeed.',
      { only: allow },
    )
    expect([...allow, 'und']).toContain(got)
  })
})
