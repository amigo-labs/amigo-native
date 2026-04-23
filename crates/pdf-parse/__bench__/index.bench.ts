import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { bench, describe } from 'vitest'
import { parseSync } from '../index.js'
// @ts-expect-error — no types
import pdfParse from 'pdf-parse'

const CORPUS = join(__dirname, '..', '__conformance__', 'corpus')
const EXAMPLE = readFileSync(join(CORPUS, 'example.pdf'))
const UNICODE = readFileSync(join(CORPUS, 'unicode.pdf'))

describe('example.pdf (~580 bytes)', () => {
  bench('@amigo-labs/pdf-parse parseSync', () => {
    parseSync(EXAMPLE)
  })
  bench('pdf-parse', async () => {
    try {
      await pdfParse(EXAMPLE)
    } catch {
      // upstream may reject this lopdf-crafted fixture
    }
  })
})

describe('unicode.pdf (~3.9 KB)', () => {
  bench('@amigo-labs/pdf-parse parseSync', () => {
    parseSync(UNICODE)
  })
  bench('pdf-parse', async () => {
    try {
      await pdfParse(UNICODE)
    } catch {
      // upstream may reject
    }
  })
})
