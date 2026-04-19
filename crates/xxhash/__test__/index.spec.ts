import { describe, it, expect } from 'vitest'
import {
  xxh32,
  xxh64,
  xxh3_64,
  xxh3_128,
  xxh32Many,
  xxh64Many,
  xxh3_64Many,
  Xxh3Hasher,
} from '../index.js'

describe('xxhash', () => {
  it('xxh32 deterministic', () => {
    const a = xxh32(Buffer.from('hello'))
    const b = xxh32(Buffer.from('hello'))
    expect(a).toBe(b)
  })

  it('xxh32 different input produces different hash', () => {
    expect(xxh32(Buffer.from('hello'))).not.toBe(xxh32(Buffer.from('world')))
  })

  it('xxh64 with seed', () => {
    const a = xxh64(Buffer.from('test'), 0n)
    const b = xxh64(Buffer.from('test'), 42n)
    expect(a).not.toBe(b)
  })

  it('xxh3_64 deterministic', () => {
    const a = xxh3_64(Buffer.from('hello'))
    const b = xxh3_64(Buffer.from('hello'))
    expect(a).toBe(b)
  })

  it('xxh3_128 returns 32-char hex string', () => {
    const result = xxh3_128(Buffer.from('hello'))
    expect(result).toMatch(/^[0-9a-f]{32}$/)
  })

  it('streaming hasher matches one-shot', () => {
    const hasher = new Xxh3Hasher()
    hasher.update(Buffer.from('hello '))
    hasher.update(Buffer.from('world'))
    const streamed = hasher.digest()

    const oneShot = xxh3_64(Buffer.from('hello world'))
    expect(streamed).toBe(oneShot)
  })

  it('streaming hasher reset', () => {
    const hasher = new Xxh3Hasher()
    hasher.update(Buffer.from('hello'))
    const first = hasher.digest()
    hasher.reset()
    hasher.update(Buffer.from('hello'))
    expect(hasher.digest()).toBe(first)
  })

  it('digestHex returns hex string', () => {
    const hasher = new Xxh3Hasher()
    hasher.update(Buffer.from('test'))
    expect(hasher.digestHex()).toMatch(/^[0-9a-f]{16}$/)
  })

  it('xxh32Many packs each chunk hash as little-endian u32', () => {
    // Three fixed-size chunks: 'aa' 'bb' 'cc'
    const input = Buffer.concat([Buffer.from('aa'), Buffer.from('bb'), Buffer.from('cc')])
    const out = xxh32Many(input, 2)
    expect(out.length).toBe(12) // 3 × 4 bytes
    expect(out.readUInt32LE(0)).toBe(xxh32(Buffer.from('aa')))
    expect(out.readUInt32LE(4)).toBe(xxh32(Buffer.from('bb')))
    expect(out.readUInt32LE(8)).toBe(xxh32(Buffer.from('cc')))
  })

  it('xxh64Many packs each chunk hash as little-endian u64', () => {
    const input = Buffer.concat([Buffer.from('aa'), Buffer.from('bb')])
    const out = xxh64Many(input, 2)
    expect(out.length).toBe(16) // 2 × 8 bytes
    expect(out.readBigUInt64LE(0)).toBe(xxh64(Buffer.from('aa')))
    expect(out.readBigUInt64LE(8)).toBe(xxh64(Buffer.from('bb')))
  })

  it('xxh3_64Many packs each chunk hash as little-endian u64', () => {
    const input = Buffer.concat([Buffer.from('a'), Buffer.from('b'), Buffer.from('c')])
    const out = xxh3_64Many(input, 1)
    expect(out.length).toBe(24)
    expect(out.readBigUInt64LE(0)).toBe(xxh3_64(Buffer.from('a')))
    expect(out.readBigUInt64LE(8)).toBe(xxh3_64(Buffer.from('b')))
    expect(out.readBigUInt64LE(16)).toBe(xxh3_64(Buffer.from('c')))
  })

  it('Many functions accept a trailing short chunk', () => {
    const input = Buffer.from('aabbc') // chunk_size 2 → 'aa', 'bb', 'c'
    const out = xxh32Many(input, 2)
    expect(out.length).toBe(12)
    expect(out.readUInt32LE(8)).toBe(xxh32(Buffer.from('c')))
  })
})
