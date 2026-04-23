import { describe, expect, it } from 'vitest'
import {
  splitText,
  splitTextBatch,
  splitMarkdown,
  splitMarkdownBatch,
  countChars,
  countTokens,
} from '../index.js'

describe('splitText', () => {
  it('splits a long string into chunks <= chunkSize', () => {
    const input = 'a'.repeat(2500)
    const chunks = splitText(input, { chunkSize: 1000 })
    expect(chunks.length).toBeGreaterThanOrEqual(3)
    for (const c of chunks) {
      expect(c.length).toBeLessThanOrEqual(1000)
    }
  })

  it('returns [input] when input fits in one chunk', () => {
    const chunks = splitText('short', { chunkSize: 1000 })
    expect(chunks).toEqual(['short'])
  })

  it('rejects overlap >= chunkSize', () => {
    expect(() =>
      splitText('x', { chunkSize: 100, chunkOverlap: 100 }),
    ).toThrow()
  })

  it('accepts chunkOverlap < chunkSize', () => {
    const input = 'abcdefghij '.repeat(40)
    const chunks = splitText(input, { chunkSize: 100, chunkOverlap: 20 })
    expect(chunks.length).toBeGreaterThan(1)
  })

  it('supports tiktoken:cl100k_base length metric', () => {
    const text = 'hello world '.repeat(50)
    const chunks = splitText(text, {
      chunkSize: 20,
      lengthMetric: 'tiktoken:cl100k_base',
    })
    expect(chunks.length).toBeGreaterThan(1)
  })

  it('supports tiktoken:o200k_base length metric', () => {
    const text = 'hello world '.repeat(50)
    const chunks = splitText(text, {
      chunkSize: 20,
      lengthMetric: 'tiktoken:o200k_base',
    })
    expect(chunks.length).toBeGreaterThan(1)
  })

  it('rejects an unknown lengthMetric', () => {
    expect(() =>
      splitText('x', { lengthMetric: 'bogus' }),
    ).toThrow()
  })
})

describe('splitMarkdown', () => {
  it('respects heading boundaries', () => {
    const md =
      '# Section 1\n\nFirst paragraph with enough content to fill a chunk on its own.\n\n# Section 2\n\nSecond paragraph, also long enough to force a split.'
    const chunks = splitMarkdown(md, { chunkSize: 80 })
    expect(chunks.length).toBeGreaterThanOrEqual(2)
  })

  it('keeps code blocks intact when they fit', () => {
    const md = '# H1\n\n```js\nconst x = 1\n```\n'
    const chunks = splitMarkdown(md, { chunkSize: 200 })
    // The fenced code block should appear in some chunk intact.
    expect(chunks.some((c) => c.includes('```js'))).toBe(true)
  })
})

describe('batch', () => {
  it('splitTextBatch returns N arrays', () => {
    const out = splitTextBatch(['hello', 'world'], { chunkSize: 1000 })
    expect(out).toEqual([['hello'], ['world']])
  })

  it('splitMarkdownBatch returns N arrays', () => {
    const out = splitMarkdownBatch(
      ['# a\n\nfoo.', '# b\n\nbar.'],
      { chunkSize: 200 },
    )
    expect(out.length).toBe(2)
  })
})

describe('length helpers', () => {
  it('countChars', () => {
    expect(countChars('hello')).toBe(5)
  })

  it('countTokens with default encoding returns > 0', () => {
    expect(countTokens('hello world')).toBeGreaterThanOrEqual(1)
  })

  it('countTokens with explicit o200k_base', () => {
    expect(
      countTokens('hello world', 'tiktoken:o200k_base'),
    ).toBeGreaterThanOrEqual(1)
  })
})
