import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { bench, describe } from 'vitest'
import { parseSync } from '../index.js'
// WASM is built as build output, not committed. On a fresh checkout
// run `pnpm build:wasm` before `pnpm bench` to include the WASM
// comparator; otherwise the bench skips those entries with a warning.
let wasmParseSync: typeof parseSync | null = null
try {
  // @ts-expect-error — generated artifact path; not in source tree
  const mod = await import('../wasm/pkg/amigo_pdf_parse_wasm.js')
  wasmParseSync = mod.parseSync
} catch {
  console.warn('[bench] WASM artifact missing — run `pnpm build:wasm` to include WASM comparator')
}
// @ts-expect-error — no types
import pdfParse from 'pdf-parse'

const CORPUS = join(__dirname, '..', '__conformance__', 'corpus')
const EXAMPLE = readFileSync(join(CORPUS, 'example.pdf'))
const UNICODE = readFileSync(join(CORPUS, 'unicode.pdf'))

describe('example.pdf (~580 bytes)', () => {
  bench('@amigo-labs/pdf-parse (napi) parseSync', () => {
    parseSync(EXAMPLE)
  })
  if (wasmParseSync) bench('@amigo-labs/pdf-parse (wasm) parseSync', () => { wasmParseSync!(EXAMPLE) })
  bench('pdf-parse', async () => {
    try {
      await pdfParse(EXAMPLE)
    } catch {
      // upstream may reject this lopdf-crafted fixture
    }
  })
})

describe('unicode.pdf (~3.9 KB)', () => {
  bench('@amigo-labs/pdf-parse (napi) parseSync', () => {
    parseSync(UNICODE)
  })
  if (wasmParseSync) bench('@amigo-labs/pdf-parse (wasm) parseSync', () => { wasmParseSync!(UNICODE) })
  bench('pdf-parse', async () => {
    try {
      await pdfParse(UNICODE)
    } catch {
      // upstream may reject
    }
  })
})
