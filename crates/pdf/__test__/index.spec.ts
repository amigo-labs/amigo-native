import { describe, expect, it } from 'vitest'
import { generate, generateMany } from '../index.js'

function label(text: string) {
  return {
    title: 'label',
    pages: [
      {
        width: 100,
        height: 50,
        elements: [
          {
            kind: 'text',
            text: { kind: 'text', x: 10, y: 25, text, fontSize: 12 },
          },
        ],
      },
    ],
  }
}

describe('generate', () => {
  it('produces a PDF buffer starting with %PDF-', () => {
    const buf = generate(label('Hello'))
    expect(buf.toString('ascii', 0, 5)).toBe('%PDF-')
    expect(buf.length).toBeGreaterThan(200)
  })

  it('multi-page document', () => {
    const doc = {
      title: 'multi',
      pages: [
        { width: 100, height: 50, elements: [] },
        { width: 100, height: 50, elements: [] },
      ],
    }
    const buf = generate(doc)
    expect(buf.toString('ascii', 0, 5)).toBe('%PDF-')
  })

  it('line element renders', () => {
    const buf = generate({
      pages: [
        {
          width: 100,
          height: 50,
          elements: [
            {
              kind: 'line',
              line: {
                kind: 'line',
                x1: 10,
                y1: 10,
                x2: 90,
                y2: 40,
                thickness: 1.0,
              },
            },
          ],
        },
      ],
    })
    expect(buf.length).toBeGreaterThan(100)
  })

  it('rect element (outlined)', () => {
    const buf = generate({
      pages: [
        {
          width: 100,
          height: 50,
          elements: [
            {
              kind: 'rect',
              rect: {
                kind: 'rect',
                x: 5,
                y: 5,
                width: 80,
                height: 40,
                filled: false,
              },
            },
          ],
        },
      ],
    })
    expect(buf.length).toBeGreaterThan(100)
  })

  it('rect element (filled)', () => {
    const buf = generate({
      pages: [
        {
          width: 100,
          height: 50,
          elements: [
            {
              kind: 'rect',
              rect: {
                kind: 'rect',
                x: 5,
                y: 5,
                width: 80,
                height: 40,
                filled: true,
              },
            },
          ],
        },
      ],
    })
    expect(buf.length).toBeGreaterThan(100)
  })

  it('rejects empty pages array', () => {
    expect(() => generate({ pages: [] })).toThrow()
  })
})

describe('generateMany', () => {
  it('returns N buffers', () => {
    const out = generateMany([label('A'), label('B'), label('C')])
    expect(out).toHaveLength(3)
    for (const buf of out) {
      expect(buf.toString('ascii', 0, 5)).toBe('%PDF-')
    }
  })

  it('empty input returns empty array', () => {
    expect(generateMany([])).toEqual([])
  })
})
