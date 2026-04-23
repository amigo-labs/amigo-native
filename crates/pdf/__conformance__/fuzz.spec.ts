import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { generate } from '../index.js'

describe('fuzz invariants', () => {
  it('single-page documents never panic', () => {
    fc.assert(
      fc.property(
        fc.stringMatching(/^[a-zA-Z0-9 ]{0,80}$/),
        fc.float({ min: 10, max: 500, noNaN: true }),
        fc.float({ min: 10, max: 500, noNaN: true }),
        (text, w, h) => {
          const buf = generate({
            pages: [
              {
                width: w,
                height: h,
                elements: [
                  {
                    kind: 'text',
                    text: { kind: 'text', x: 5, y: 5, text, fontSize: 12 },
                  },
                ],
              },
            ],
          })
          expect(buf.toString('ascii', 0, 5)).toBe('%PDF-')
        },
      ),
      { numRuns: 30 },
    )
  })

  it('variable page counts never panic', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 10 }), (n) => {
        const pages = Array.from({ length: n }, () => ({
          width: 100,
          height: 50,
          elements: [],
        }))
        const buf = generate({ pages })
        expect(buf.length).toBeGreaterThan(100)
      }),
      { numRuns: 20 },
    )
  })
})
