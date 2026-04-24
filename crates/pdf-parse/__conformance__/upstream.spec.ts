// Upstream `pdf-parse` ships a small smoke-test with its own fixture.
// We can't reuse their fixture without vendoring it. Instead, we run
// our API on the lopdf asset corpus (example.pdf + unicode.pdf) which
// covers (a) basic text and (b) unicode text-showing operators.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parse } from '../index.js'

const CORPUS = join(__dirname, 'corpus')

describe('fixture corpus smoke tests', () => {
  it('example.pdf: page count, version, no crash', async () => {
    const result = await parse(readFileSync(join(CORPUS, 'example.pdf')))
    expect(result.numpages).toBeGreaterThanOrEqual(1)
    expect(result.version).toMatch(/^\d+\.\d+/)
  })

  it('unicode.pdf: no crash on multi-byte text-showing', async () => {
    const result = await parse(readFileSync(join(CORPUS, 'unicode.pdf')))
    expect(result.numpages).toBeGreaterThanOrEqual(1)
    expect(typeof result.text).toBe('string')
  })
})

describe('error handling', () => {
  it('random garbage bytes return empty text', async () => {
    const result = await parse(Buffer.from('not a pdf at all'))
    expect(result.text).toBe('')
    expect(result.numpages).toBe(0)
  })

  it('empty buffer returns empty text', async () => {
    const result = await parse(Buffer.alloc(0))
    expect(result.text).toBe('')
  })
})
