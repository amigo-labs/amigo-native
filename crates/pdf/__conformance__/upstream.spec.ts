import { describe, expect, it } from 'vitest'
import { generate, generateMany } from '../index.js'

describe('scenario: 100-label batch', () => {
  it('generates 100 labels in one FFI call', () => {
    const docs = Array.from({ length: 100 }, (_, i) => ({
      title: `label-${i}`,
      pages: [
        {
          width: 100,
          height: 50,
          elements: [
            {
              kind: 'text',
              text: {
                kind: 'text',
                x: 10,
                y: 25,
                text: `Label ${i}`,
                fontSize: 12,
              },
            },
          ],
        },
      ],
    }))
    const out = generateMany(docs)
    expect(out).toHaveLength(100)
    for (const buf of out) {
      expect(buf.toString('ascii', 0, 5)).toBe('%PDF-')
    }
  })
})

describe('scenario: a4 multi-element page', () => {
  it('text + lines + rectangles on one A4 page', () => {
    const buf = generate({
      title: 'invoice',
      pages: [
        {
          width: 210,
          height: 297,
          elements: [
            {
              kind: 'text',
              text: { kind: 'text', x: 20, y: 275, text: 'Invoice', fontSize: 24 },
            },
            {
              kind: 'line',
              line: {
                kind: 'line',
                x1: 20,
                y1: 265,
                x2: 190,
                y2: 265,
                thickness: 0.5,
              },
            },
            {
              kind: 'rect',
              rect: {
                kind: 'rect',
                x: 20,
                y: 100,
                width: 170,
                height: 50,
                filled: false,
              },
            },
          ],
        },
      ],
    })
    expect(buf.length).toBeGreaterThan(500)
  })
})
