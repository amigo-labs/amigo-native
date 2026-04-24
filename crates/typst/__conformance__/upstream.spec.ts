import { describe, expect, it } from 'vitest'
import { compile } from '../index.js'

describe('Typst invoice template scenario', () => {
  it('renders an invoice-like document', () => {
    const src = [
      '#set page(paper: "a4", margin: 2cm)',
      '#set text(font: "Libertinus Serif")',
      '',
      '= Invoice 2025-042',
      '',
      '*Issued:* 2025-04-01',
      '',
      '*Due:* 2025-04-30',
      '',
      '#table(',
      '  columns: (1fr, auto, auto),',
      '  [*Description*], [*Qty*], [*Amount*],',
      '  [Consulting hours], [20], [USD 2000],',
      '  [Travel expenses], [1], [USD 300],',
      ')',
      '',
      '*Total:* USD 2300',
    ].join('\n')
    const res = compile(src)
    expect(res.pdf.toString('ascii', 0, 5)).toBe('%PDF-')
    expect(res.pdf.length).toBeGreaterThan(1000)
  })
})

describe('Typst data injection scenario', () => {
  it('renders a templated letter with sys.inputs', () => {
    const template = `
#let to = sys.inputs.at("to", default: "Unknown")
#let from = sys.inputs.at("from", default: "Unknown")

Dear #to,

Regards,\\
#from
`
    const res = compile(template, {
      data: { to: 'Alice', from: 'Bob' },
    })
    expect(res.pdf.toString('ascii', 0, 5)).toBe('%PDF-')
  })
})
