import { describe, it, expect } from 'vitest'
import { Stemmer, stemOnce } from '../index.js'

describe('stemmer — constructor', () => {
  it('creates an English stemmer', () => {
    const s = new Stemmer('english')
    expect(s.language).toBe('english')
  })

  it('throws on unknown language', () => {
    expect(() => new Stemmer('klingon')).toThrow(/unknown stemmer language/i)
  })

  it('accepts case-insensitive language names', () => {
    expect(() => new Stemmer('ENGLISH')).not.toThrow()
    expect(() => new Stemmer('German')).not.toThrow()
  })
})

describe('stemmer — stemMany', () => {
  it('stems common English suffixes toward a shared root', () => {
    const s = new Stemmer('english')
    const got = s.stemMany(['running', 'runs', 'runner'])
    for (const word of got) {
      expect(word.startsWith('run')).toBe(true)
    }
  })

  it('returns an array of the same length', () => {
    const s = new Stemmer('english')
    const got = s.stemMany(['a', 'b', 'c', 'd'])
    expect(got).toHaveLength(4)
  })

  it('handles empty input', () => {
    const s = new Stemmer('english')
    expect(s.stemMany([])).toEqual([])
  })
})

describe('stemmer — tokenizeAndStem', () => {
  it('lowercases tokens by default', () => {
    const s = new Stemmer('english')
    const got = s.tokenizeAndStem('Running JUMPING cats')
    for (const word of got) {
      expect(word).toBe(word.toLowerCase())
    }
  })

  it('drops tokens below min_token_length', () => {
    const s = new Stemmer('english')
    const got = s.tokenizeAndStem('a bb ccc dddd', { minTokenLength: 3 })
    // 'a' and 'bb' dropped; 'ccc' and 'dddd' remain after stemming
    expect(got.length).toBe(2)
  })

  it('drops English stopwords when enabled', () => {
    const s = new Stemmer('english')
    const got = s.tokenizeAndStem('the cat and the dog', { stopwordsEn: true })
    expect(got).not.toContain('the')
    expect(got).not.toContain('and')
  })

  it('ignores stopwords_en for non-English stemmers', () => {
    const s = new Stemmer('german')
    // The word "and" is in the English stopword list but that list should
    // not be applied to a German stemmer.
    const got = s.tokenizeAndStem('the cat and the dog', { stopwordsEn: true })
    expect(got.length).toBeGreaterThan(0)
  })
})

describe('stemmer — stemBuffer', () => {
  it('processes newline-delimited input', () => {
    const s = new Stemmer('english')
    const buf = Buffer.from('running\njumping\nswimming', 'utf8')
    const out = s.stemBuffer(buf)
    const parts = out.toString('utf8').split('\n')
    expect(parts).toHaveLength(3)
    for (const w of parts) {
      expect(w.length).toBeGreaterThan(0)
    }
  })

  it('rejects invalid UTF-8', () => {
    const s = new Stemmer('english')
    const bad = Buffer.from([0xff, 0xfe, 0xfd])
    expect(() => s.stemBuffer(bad)).toThrow()
  })
})

describe('stemmer — tokenizeAndStemToBuffer', () => {
  it('produces newline-delimited output', () => {
    const s = new Stemmer('english')
    const buf = s.tokenizeAndStemToBuffer('running jumping swimming')
    const parts = buf.toString('utf8').split('\n')
    expect(parts).toHaveLength(3)
  })
})

describe('stemmer — stemOnce', () => {
  it('works end-to-end for one-off usage', () => {
    expect(stemOnce('english', 'running').startsWith('run')).toBe(true)
  })

  it('propagates unknown-language errors', () => {
    expect(() => stemOnce('klingon', 'word')).toThrow(/unknown stemmer language/i)
  })
})
