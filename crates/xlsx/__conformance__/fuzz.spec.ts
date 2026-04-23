import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { readWorkbook, writeWorkbook } from '../index.js'

describe('fuzz invariants', () => {
  it('write + read roundtrip preserves cell text', () => {
    fc.assert(
      fc.property(
        // calamine trims trailing empty cells and some XML-special
        // characters can't survive unescaped; restrict to printable
        // ASCII for this invariant.
        fc.array(fc.stringMatching(/^[a-zA-Z0-9 .,_-]{1,20}$/), { minLength: 1, maxLength: 10 }),
        (strings) => {
          const bytes = writeWorkbook([
            {
              name: 'S',
              rows: [strings.map((text) => ({ kind: 'string', text }))],
            },
          ])
          const wb = readWorkbook(bytes)
          const texts = wb.sheets[0].rows[0].map((c) => c.text ?? '')
          expect(texts).toEqual(strings)
        },
      ),
      { numRuns: 30 },
    )
  })

  it('readWorkbook never panics on random buffers', () => {
    fc.assert(
      fc.property(fc.uint8Array({ minLength: 0, maxLength: 512 }), (bytes) => {
        try {
          readWorkbook(Buffer.from(bytes))
        } catch {
          // expected — random bytes are not XLSX
        }
      }),
      { numRuns: 50 },
    )
  })
})
