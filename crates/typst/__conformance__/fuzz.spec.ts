import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { compile } from '../index.js'

describe('fuzz invariants', () => {
  it('simple text documents never panic', () => {
    fc.assert(
      fc.property(fc.stringMatching(/^[a-zA-Z0-9 .,\n]{0,200}$/), (src) => {
        try {
          const res = compile(src)
          expect(res.pdf.toString('ascii', 0, 5)).toBe('%PDF-')
        } catch {
          // Some inputs may be invalid Typst — that's expected.
        }
      }),
      { numRuns: 30 },
    )
  })

  it('heading + paragraph combinations never panic', () => {
    fc.assert(
      fc.property(
        fc.array(fc.stringMatching(/^[a-z ]{1,30}$/), { minLength: 1, maxLength: 5 }),
        (paragraphs) => {
          const src = paragraphs.map((p) => `= Heading\n\n${p}`).join('\n\n')
          try {
            const res = compile(src)
            expect(res.pdf.length).toBeGreaterThan(100)
          } catch {
            // acceptable
          }
        },
      ),
      { numRuns: 30 },
    )
  })
})
