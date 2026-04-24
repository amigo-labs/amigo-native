import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parse, parseSync } from '../index.js'

const CORPUS = join(__dirname, '..', '__conformance__', 'corpus')

function fixture(name: string): Buffer {
  return readFileSync(join(CORPUS, name))
}

describe('parseSync', () => {
  it('extracts text from example.pdf', () => {
    const result = parseSync(fixture('example.pdf'))
    expect(result.text).toBeTypeOf('string')
    expect(result.numpages).toBeGreaterThanOrEqual(1)
    expect(result.version).toMatch(/^\d/)
  })

  it('exposes info and metadata', () => {
    const result = parseSync(fixture('example.pdf'))
    expect(result.info).toBeTypeOf('object')
    // metadata is undefined (no XMP stream) or a string
    expect(result.metadata == null || typeof result.metadata === 'string').toBe(true)
  })

  it('handles unicode fixtures', () => {
    const result = parseSync(fixture('unicode.pdf'))
    expect(result.numpages).toBeGreaterThanOrEqual(1)
  })

  it('max option caps page-separator count', () => {
    const full = parseSync(fixture('example.pdf'))
    const limited = parseSync(fixture('example.pdf'), { max: 1 })
    // Page separator is U+000C (form feed); limited should have <= full pages.
    const FORM_FEED = String.fromCharCode(0x0c)
    const fullFormFeeds = full.text.split(FORM_FEED).length - 1
    const limitedFormFeeds = limited.text.split(FORM_FEED).length - 1
    expect(limitedFormFeeds).toBeLessThanOrEqual(fullFormFeeds)
  })

  it('returns empty-ish result on random bytes', () => {
    const result = parseSync(Buffer.from('not a pdf'))
    expect(result.text).toBe('')
  })
})

describe('parse (async)', () => {
  it('returns a promise that resolves', async () => {
    const result = await parse(fixture('example.pdf'))
    expect(result.numpages).toBeGreaterThanOrEqual(1)
  })

  it('async and sync agree on text', async () => {
    const sync = parseSync(fixture('example.pdf'))
    const async_ = await parse(fixture('example.pdf'))
    expect(async_.text).toBe(sync.text)
    expect(async_.numpages).toBe(sync.numpages)
  })
})
