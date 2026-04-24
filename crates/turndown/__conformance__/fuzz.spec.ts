import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { turndown } from '../index.js'

describe('fuzz invariants', () => {
  it('never panics on random HTML-ish strings', () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        const out = turndown(s)
        expect(typeof out).toBe('string')
      }),
      { numRuns: 200 },
    )
  })

  it('never panics on mixed-element HTML', () => {
    const tag = fc.constantFrom('p', 'h1', 'h2', 'strong', 'em', 'a', 'ul', 'li')
    fc.assert(
      fc.property(fc.array(tag, { minLength: 1, maxLength: 20 }), (tags) => {
        const html = tags.map((t) => `<${t}>x</${t}>`).join('')
        const out = turndown(html)
        expect(typeof out).toBe('string')
      }),
      { numRuns: 200 },
    )
  })

  it('always returns <= input bytes * 3 (rough bound)', () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        const out = turndown(s)
        expect(out.length).toBeLessThanOrEqual(Math.max(s.length * 3 + 16, 128))
      }),
      { numRuns: 100 },
    )
  })
})
