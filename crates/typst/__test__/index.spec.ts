import { describe, expect, it } from 'vitest'
import { compile, compileMany } from '../index.js'

describe('compile', () => {
  it('compiles a trivial Typst source', () => {
    const res = compile('Hello World')
    expect(res.pdf.toString('ascii', 0, 5)).toBe('%PDF-')
  })

  it('compiles with a heading', () => {
    const res = compile('= Heading\n\nSome body text.')
    expect(res.pdf.length).toBeGreaterThan(500)
  })

  it('supports sys.inputs via data option', () => {
    const res = compile(
      '#let name = sys.inputs.at("name", default: "World")\nHello #name',
      { data: { name: 'Amigo' } },
    )
    expect(res.pdf.toString('ascii', 0, 5)).toBe('%PDF-')
  })

  it('throws on syntax error', () => {
    expect(() => compile('#let x = ')).toThrow()
  })

  it('throws on @preview imports (offline-only policy)', () => {
    expect(() => compile('#import "@preview/example:0.1.0": *')).toThrow()
  })

  it('warnings are returned as a list', () => {
    const res = compile('= Heading')
    expect(Array.isArray(res.warnings)).toBe(true)
  })

  it('multi-page document', () => {
    const src = Array.from({ length: 5 }, (_, i) => `= Page ${i}\n\nContent.\n\n#pagebreak()`).join('\n')
    const res = compile(src)
    expect(res.pdf.length).toBeGreaterThan(500)
  })

  it('math typesetting works', () => {
    const res = compile('$ x = y + z $')
    expect(res.pdf.toString('ascii', 0, 5)).toBe('%PDF-')
  })

  it('table typesetting works', () => {
    const res = compile(
      '#table(columns: 3, [A], [B], [C], [1], [2], [3])',
    )
    expect(res.pdf.toString('ascii', 0, 5)).toBe('%PDF-')
  })
})

describe('compileMany', () => {
  it('compiles N documents', () => {
    const out = compileMany(['A', 'B', '= C'])
    expect(out).toHaveLength(3)
    for (const r of out) {
      expect(r.pdf.toString('ascii', 0, 5)).toBe('%PDF-')
    }
  })

  it('shared data across batch', () => {
    const src = '#sys.inputs.at("x", default: "?")'
    const out = compileMany([src, src], { data: { x: 'hello' } })
    expect(out).toHaveLength(2)
  })
})
