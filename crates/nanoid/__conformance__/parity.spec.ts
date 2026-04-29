/**
 * Core parity smoke against nanoid@5. The full structural-properties
 * matrix lives in `upstream.spec.ts`; this file is the contract gate
 * that every release must pass.
 */
import { describe, it, expect } from 'vitest'
import { nanoid as amigoNanoid, customAlphabet as amigoCustomAlphabet } from '../wrapper.js'
import { nanoid as upstreamNanoid } from 'nanoid'

const DEFAULT_ALPHABET = /^[A-Za-z0-9_-]+$/

describe('nanoid — parity gate', () => {
  it('default length is 21', () => {
    expect(amigoNanoid().length).toBe(21)
    expect(upstreamNanoid().length).toBe(21)
  })

  it('default alphabet matches URL-safe', () => {
    for (let i = 0; i < 50; i++) {
      expect(amigoNanoid()).toMatch(DEFAULT_ALPHABET)
    }
  })

  it('respects custom size', () => {
    for (const n of [1, 16, 32, 64]) {
      expect(amigoNanoid(n).length).toBe(n)
    }
  })

  it('no collisions in 1000 ids', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 1000; i++) seen.add(amigoNanoid())
    expect(seen.size).toBe(1000)
  })

  it('customAlphabet respects alphabet and size', () => {
    const factory = amigoCustomAlphabet('AB', 8)
    const id = factory()
    expect(id.length).toBe(8)
    expect(id).toMatch(/^[AB]+$/)
  })
})
