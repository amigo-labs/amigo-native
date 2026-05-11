import { describe, it, expect } from 'vitest'
import { matches, test, matchOffsets } from '../index.js'

describe('linkify-it — smoke', () => {
  it('finds a URL in text', () => {
    const ms = matches('see https://example.com for details')
    expect(ms.length).toBe(1)
    expect(ms[0]?.url).toContain('example.com')
    expect(ms[0]?.schema).toBe('url')
  })

  it('finds an email', () => {
    const ms = matches('email a@b.com')
    expect(ms.length).toBe(1)
    expect(ms[0]?.schema).toBe('email')
  })

  it('test() reports presence', () => {
    expect(test('plain text only')).toBe(false)
    expect(test('go to https://example.com')).toBe(true)
  })

  it('matchOffsets returns packed Uint32Array view', () => {
    const buf = matchOffsets(Buffer.from('https://a.com or b@c.com'))
    // 2 matches × 3 × u32 = 24 bytes
    expect(buf.length).toBe(24)
  })
})
