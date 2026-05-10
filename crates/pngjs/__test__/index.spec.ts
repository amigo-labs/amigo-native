import { describe, it, expect } from 'vitest'
import { encodeRgba, decodeRgba } from '../index.js'

describe('pngjs — smoke', () => {
  it('round-trip encode → decode preserves dimensions + pixels', () => {
    const width = 4
    const height = 4
    const pixels = Buffer.alloc(width * height * 4)
    for (let i = 0; i < pixels.length; i += 4) {
      pixels[i] = (i * 7) & 0xff
      pixels[i + 1] = (i * 11) & 0xff
      pixels[i + 2] = (i * 13) & 0xff
      pixels[i + 3] = 255
    }
    const encoded = encodeRgba(pixels, width, height)
    expect(encoded.length).toBeGreaterThan(0)

    const decoded = decodeRgba(encoded)
    expect(decoded.width).toBe(width)
    expect(decoded.height).toBe(height)
    expect(decoded.data.equals(pixels)).toBe(true)
  })

  it('encodeRgba rejects mis-sized pixel buffer', () => {
    expect(() => encodeRgba(Buffer.alloc(15), 2, 2)).toThrow()
  })
})
