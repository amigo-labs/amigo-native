import { describe, it, expect } from 'vitest'
import { pixelmatch, countDiff } from '../index.js'

const px = (r: number, g: number, b: number, a = 255) => [r, g, b, a]

describe('pixelmatch — smoke', () => {
  it('identical images return zero diff', () => {
    const a = Buffer.from([...px(0, 0, 0), ...px(0, 0, 0), ...px(0, 0, 0), ...px(0, 0, 0)])
    const b = Buffer.from(a)
    const { numDiff } = pixelmatch(a, b, 2, 2)
    expect(numDiff).toBe(0)
  })

  it('completely different images count every pixel', () => {
    const a = Buffer.from([...px(0, 0, 0), ...px(0, 0, 0), ...px(0, 0, 0), ...px(0, 0, 0)])
    const b = Buffer.from([
      ...px(255, 255, 255),
      ...px(255, 255, 255),
      ...px(255, 255, 255),
      ...px(255, 255, 255),
    ])
    const { numDiff } = pixelmatch(a, b, 2, 2)
    expect(numDiff).toBe(4)
  })

  it('countDiff matches numDiff', () => {
    const a = Buffer.from([...px(0, 0, 0), ...px(0, 0, 0), ...px(0, 0, 0), ...px(255, 0, 0)])
    const b = Buffer.from([...px(0, 0, 0), ...px(0, 0, 0), ...px(0, 0, 0), ...px(0, 0, 0)])
    const r = pixelmatch(a, b, 2, 2)
    expect(countDiff(a, b, 2, 2)).toBe(r.numDiff)
  })

  it('rejects mismatched buffer sizes', () => {
    const a = Buffer.alloc(16)
    const b = Buffer.alloc(8)
    expect(() => pixelmatch(a, b, 2, 2)).toThrow()
  })
})
