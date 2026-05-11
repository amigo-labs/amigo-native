import { describe, it, expect } from 'vitest'
import { encodeRgba, decodeRgba } from '../index.js'

describe('jpeg-js — smoke', () => {
  it('round-trip encode → decode preserves dimensions', () => {
    const width = 8
    const height = 8
    const pixels = Buffer.alloc(width * height * 4)
    for (let i = 0; i < pixels.length; i += 4) {
      pixels[i] = 128
      pixels[i + 1] = 64
      pixels[i + 2] = 32
      pixels[i + 3] = 255
    }
    const encoded = encodeRgba(pixels, width, height, { quality: 90 })
    expect(encoded.length).toBeGreaterThan(0)
    const decoded = decodeRgba(encoded)
    expect(decoded.width).toBe(width)
    expect(decoded.height).toBe(height)
    // JPEG is lossy; just ensure each channel landed in the expected ballpark.
    for (let i = 0; i < decoded.data.length; i += 4) {
      expect(Math.abs(decoded.data[i] - 128)).toBeLessThan(20)
    }
  })

  it('encodeRgba rejects mis-sized pixel buffer', () => {
    expect(() => encodeRgba(Buffer.alloc(15), 2, 2)).toThrow()
  })
})
