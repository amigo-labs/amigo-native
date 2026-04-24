// No JS drop-in exists for Typst. Parity target: the Typst spec
// itself — source compiles, produces valid PDF, core language
// features work.

import { describe, expect, it } from 'vitest'
import { compile } from '../index.js'

describe('Typst spec: basic document features', () => {
  it('paragraph', () => {
    const res = compile('A paragraph of text.')
    expect(res.pdf.length).toBeGreaterThan(200)
  })

  it('heading + body', () => {
    const res = compile('= H1\n\nBody text.\n\n== H2\n\nMore body.')
    expect(res.pdf.toString('ascii', 0, 5)).toBe('%PDF-')
  })

  it('unordered list', () => {
    const res = compile('- one\n- two\n- three')
    expect(res.pdf.toString('ascii', 0, 5)).toBe('%PDF-')
  })

  it('ordered list', () => {
    const res = compile('+ one\n+ two\n+ three')
    expect(res.pdf.toString('ascii', 0, 5)).toBe('%PDF-')
  })

  it('bold + italic inline', () => {
    const res = compile('*bold* and _italic_ and `code`.')
    expect(res.pdf.length).toBeGreaterThan(200)
  })

  it('math formula', () => {
    const res = compile('$ integral_0^infinity e^(-x^2) dif x = sqrt(pi) / 2 $')
    expect(res.pdf.toString('ascii', 0, 5)).toBe('%PDF-')
  })

  it('table with header row', () => {
    const res = compile(
      '#table(columns: 2, [*Name*], [*Age*], [Alice], [30], [Bob], [25])',
    )
    expect(res.pdf.length).toBeGreaterThan(500)
  })
})

describe('Typst spec: scripting', () => {
  it('variable binding', () => {
    const res = compile('#let x = 42\nThe answer is #x.')
    expect(res.pdf.toString('ascii', 0, 5)).toBe('%PDF-')
  })

  it('for loop', () => {
    const res = compile('#for i in range(3) { [Item #i ] }')
    expect(res.pdf.toString('ascii', 0, 5)).toBe('%PDF-')
  })

  it('if expression', () => {
    const res = compile('#if 1 < 2 [less] else [more]')
    expect(res.pdf.toString('ascii', 0, 5)).toBe('%PDF-')
  })
})
