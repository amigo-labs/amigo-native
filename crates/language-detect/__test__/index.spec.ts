import { describe, it, expect } from 'vitest'
import {
  detect,
  detectIfLong,
  detectAll,
  detectMany,
  languageExists,
} from '../index.js'

describe('language-detect — basic detection', () => {
  it('detects English paragraph', () => {
    expect(detect('The quick brown fox jumps over the lazy dog')).toBe('eng')
  })

  it('detects German paragraph', () => {
    expect(
      detect('Der schnelle braune Fuchs springt über den faulen Hund'),
    ).toBe('deu')
  })

  it('returns "und" for input below min_length', () => {
    expect(detect('hi')).toBe('und')
  })

  it('detectIfLong returns null for short input', () => {
    expect(detectIfLong('hi')).toBeNull()
  })

  it('detectIfLong returns code for long input', () => {
    expect(detectIfLong('The quick brown fox jumps over the lazy dog')).toBe(
      'eng',
    )
  })

  it('honours custom min_length', () => {
    expect(detect('hello', { minLength: 100 })).toBe('und')
  })

  it('respects only allow-list', () => {
    const got = detect('The quick brown fox jumps over the lazy dog', {
      only: ['deu', 'fra'],
    })
    expect(['deu', 'fra', 'und']).toContain(got)
    expect(got).not.toBe('eng')
  })

  it('respects ignore deny-list', () => {
    const got = detect('The quick brown fox jumps over the lazy dog', {
      ignore: ['eng'],
    })
    expect(got).not.toBe('eng')
  })
})

describe('language-detect — detectAll', () => {
  it('returns at least one match for long input', () => {
    const got = detectAll('The quick brown fox jumps over the lazy dog')
    expect(got.length).toBeGreaterThanOrEqual(1)
    expect(got[0].lang).toBe('eng')
    expect(got[0].confidence).toBeGreaterThan(0)
    expect(got[0].confidence).toBeLessThanOrEqual(1)
  })

  it('returns empty list below min_length', () => {
    expect(detectAll('hi')).toEqual([])
  })
})

describe('language-detect — detectMany', () => {
  it('preserves order and returns "und" for short inputs', () => {
    const got = detectMany([
      'The quick brown fox jumps over the lazy dog',
      'Der schnelle braune Fuchs springt über den faulen Hund',
      'hi',
    ])
    expect(got).toEqual(['eng', 'deu', 'und'])
  })

  it('handles empty input array', () => {
    expect(detectMany([])).toEqual([])
  })
})

describe('language-detect — languageExists', () => {
  it('recognises common ISO-639-3 codes', () => {
    expect(languageExists('eng')).toBe(true)
    expect(languageExists('deu')).toBe(true)
    expect(languageExists('fra')).toBe(true)
  })

  it('is case-insensitive', () => {
    expect(languageExists('ENG')).toBe(true)
    expect(languageExists('Deu')).toBe(true)
  })

  it('rejects unknown codes', () => {
    expect(languageExists('zzz')).toBe(false)
    expect(languageExists('xyz')).toBe(false)
  })
})
