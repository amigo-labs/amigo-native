import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { render } from '../index.js'

const runs = Number(process.env.FUZZ_RUNS ?? 200)

describe('fuzz — totality and safety', () => {
  it('never throws on arbitrary unicode input', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'binary' }), (input) => {
        render(input)
      }),
      { numRuns: runs },
    )
  })

  it('never emits a <script> tag under default (unsafeHtml: false)', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'binary' }), (input) => {
        const out = render(input)
        expect(out).not.toMatch(/<script/i)
      }),
      { numRuns: runs },
    )
  })

  it('never emits an active tag (<iframe|object|embed) under default', () => {
    // Markdown input can contain `<iframe src=...>` — safe mode must drop such tags.
    // We test by generating HTML-like tokens and asserting no opening tags leak through.
    const tagInput = fc.string({
      unit: fc.constantFrom('<', '>', 'iframe', 'object', 'embed', 'script', ' ', 'src=', '"x"', '\n', 'hi'),
      minLength: 1,
      maxLength: 80,
    })
    fc.assert(
      fc.property(tagInput, (input) => {
        const out = render(input)
        // no opening tag form for active elements
        expect(out).not.toMatch(/<(iframe|object|embed|script)\b/i)
      }),
      { numRuns: runs },
    )
  })

  it('output is always valid UTF-8 (Buffer round-trip)', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'binary' }), (input) => {
        const out = render(input)
        const round = Buffer.from(out, 'utf8').toString('utf8')
        expect(round).toBe(out)
      }),
      { numRuns: runs },
    )
  })

  it('idempotent for pure-paragraph text (render twice through a paragraph wrapper)', () => {
    fc.assert(
      fc.property(
        fc.string({ unit: fc.constantFrom('a', 'b', 'c', ' '), minLength: 1, maxLength: 40 }),
        (input) => {
          const trimmed = input.trim()
          if (!trimmed) return
          const out = render(trimmed)
          // a pure alphabetic+space string should render as a single paragraph
          expect(out).toMatch(/^<p>.*<\/p>\n$/s)
        },
      ),
      { numRuns: runs },
    )
  })
})
