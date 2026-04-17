import { describe, it, expect } from 'vitest'
import { deflate, inflate, deflateRaw, inflateRaw, gzip, ungzip } from '../index.js'

const sample = Buffer.from('the quick brown fox jumps over the lazy dog '.repeat(100), 'utf-8')

describe('inflate', () => {
  it('deflate + inflate roundtrip', () => {
    const enc = deflate(sample)
    const dec = inflate(enc)
    expect(dec.equals(sample)).toBe(true)
  })

  it('deflateRaw + inflateRaw roundtrip', () => {
    const enc = deflateRaw(sample)
    const dec = inflateRaw(enc)
    expect(dec.equals(sample)).toBe(true)
  })

  it('gzip + ungzip roundtrip', () => {
    const enc = gzip(sample)
    const dec = ungzip(enc)
    expect(dec.equals(sample)).toBe(true)
  })

  it('respects compression level (higher = smaller for compressible input)', () => {
    const low = deflate(sample, { level: 1 })
    const high = deflate(sample, { level: 9 })
    expect(high.length).toBeLessThanOrEqual(low.length)
  })

  it('compresses empty buffer', () => {
    const enc = deflate(Buffer.alloc(0))
    expect(inflate(enc).length).toBe(0)
  })

  it('throws on malformed zlib input', () => {
    expect(() => inflate(Buffer.from([0, 1, 2, 3]))).toThrow()
  })
})
