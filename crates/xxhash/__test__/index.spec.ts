import { describe, it, expect } from 'vitest'
import { xxh32, xxh64, xxh3_64, xxh3_128, Xxh3Hasher } from '../index.js'

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
    const a = xxh64(Buffer.from('test'), 0)
    const b = xxh64(Buffer.from('test'), 42)
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
})
