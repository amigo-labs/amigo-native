import { describe, it, expect } from 'vitest'
import { Jimp } from '../index.js'

describe('jimp — smoke', () => {
  it('create + bitmap returns correct dimensions', () => {
    const img = Jimp.create(8, 4)
    expect(img.width).toBe(8)
    expect(img.height).toBe(4)
    const bm = img.bitmap()
    expect(bm.data.length).toBe(8 * 4 * 4)
  })

  it('resize updates width/height', () => {
    const img = Jimp.create(16, 16)
    img.resize(4, 4)
    expect(img.width).toBe(4)
    expect(img.height).toBe(4)
  })

  it('rotate(90) swaps dimensions', () => {
    const img = Jimp.create(8, 4)
    img.rotate(90)
    expect(img.width).toBe(4)
    expect(img.height).toBe(8)
  })

  it('getBufferSync emits a PNG header', () => {
    const img = Jimp.create(2, 2)
    const out = img.getBufferSync('image/png')
    // PNG magic: 0x89 0x50 0x4E 0x47
    expect(out[0]).toBe(0x89)
    expect(out[1]).toBe(0x50)
    expect(out[2]).toBe(0x4e)
    expect(out[3]).toBe(0x47)
  })

  it('round-trip PNG: encode → decode preserves size', () => {
    const orig = Jimp.create(4, 4)
    const png = orig.getBufferSync('image/png')
    const decoded = Jimp.fromBuffer(png)
    expect(decoded.width).toBe(4)
    expect(decoded.height).toBe(4)
  })

  it('rejects non-90° rotations in v0.1', () => {
    const img = Jimp.create(4, 4)
    expect(() => img.rotate(45)).toThrow()
  })
})
