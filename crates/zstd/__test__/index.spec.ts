import { describe, it, expect } from 'vitest'
import { compress, decompress, Compressor, Decompressor, trainDictionary } from '../index.js'

const payload = Buffer.from(
  'The quick brown fox jumps over the lazy dog. '.repeat(100),
)

describe('zstd — smoke', () => {
  it('one-shot compress → decompress is loss-less', () => {
    const compressed = compress(payload)
    expect(compressed.length).toBeLessThan(payload.length)
    const decompressed = decompress(compressed)
    expect(decompressed.equals(payload)).toBe(true)
  })

  it('Compressor + Decompressor classes round-trip', () => {
    const c = new Compressor(3)
    const d = new Decompressor()
    const out = c.compress(payload)
    expect(d.decompress(out).equals(payload)).toBe(true)
  })

  it('compressMany batches', () => {
    const c = new Compressor(3)
    const inputs = [payload, Buffer.from('short'), payload]
    const compressed = c.compressMany(inputs)
    expect(compressed.length).toBe(3)
    const d = new Decompressor()
    const roundtripped = d.decompressMany(compressed)
    expect(roundtripped[0].equals(payload)).toBe(true)
    expect(roundtripped[1].toString()).toBe('short')
  })

  it('trainDictionary produces a non-empty dict from many samples', () => {
    const samples: Buffer[] = []
    for (let i = 0; i < 50; i++) {
      samples.push(Buffer.from(`{"id":${i},"kind":"sample","payload":"repeating data ${i}"}`))
    }
    const dict = trainDictionary(samples, 4096)
    expect(dict.length).toBeGreaterThan(0)
  })
})
