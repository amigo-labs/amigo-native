/**
 * Parity tests against nanoid@5.
 *
 * The output is random, so we test structural properties rather than
 * byte-equivalence: length, alphabet, collision-free generation, and
 * that customAlphabet factories respect their alphabet and default size.
 */
import { describe, it, expect } from 'vitest'
import {
  nanoid as amigoNanoid,
  customAlphabet as amigoCustomAlphabet,
} from '../wrapper.js'
import { nanoid as upstreamNanoid, customAlphabet as upstreamCustomAlphabet } from 'nanoid'

const DEFAULT_ALPHABET = /^[A-Za-z0-9_-]+$/

describe('nanoid — parity with nanoid@5', () => {
  it('default length is 21 (both impls)', () => {
    expect(amigoNanoid().length).toBe(21)
    expect(upstreamNanoid().length).toBe(21)
  })

  it('default alphabet is URL-safe (both impls)', () => {
    for (let i = 0; i < 100; i++) {
      expect(amigoNanoid()).toMatch(DEFAULT_ALPHABET)
      expect(upstreamNanoid()).toMatch(DEFAULT_ALPHABET)
    }
  })

  it('respects custom size (both impls)', () => {
    for (const n of [1, 5, 10, 16, 32, 64, 128]) {
      expect(amigoNanoid(n).length).toBe(n)
      expect(upstreamNanoid(n).length).toBe(n)
    }
  })

  it('no collisions in 10k (both impls)', () => {
    const a = new Set<string>()
    const b = new Set<string>()
    for (let i = 0; i < 10_000; i++) {
      a.add(amigoNanoid())
      b.add(upstreamNanoid())
    }
    expect(a.size).toBe(10_000)
    expect(b.size).toBe(10_000)
  })

  it('byte distribution roughly uniform (chi-square gate)', () => {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-'
    const counts = Array.from({ length: alphabet.length }, () => 0)
    const samples = 100_000
    for (let i = 0; i < samples / 21; i++) {
      const id = amigoNanoid()
      for (const c of id) {
        const idx = alphabet.indexOf(c)
        if (idx >= 0) counts[idx]++
      }
    }
    const expected = samples / alphabet.length
    // Very loose bound: no bucket more than 30% off expected
    for (const c of counts) {
      expect(c).toBeGreaterThan(expected * 0.7)
      expect(c).toBeLessThan(expected * 1.3)
    }
  })
})

describe('customAlphabet — parity', () => {
  it('factory respects alphabet (both impls)', () => {
    const amigoF = amigoCustomAlphabet('ABC')
    const upstreamF = upstreamCustomAlphabet('ABC')
    for (let i = 0; i < 50; i++) {
      expect(amigoF()).toMatch(/^[ABC]+$/)
      expect(upstreamF()).toMatch(/^[ABC]+$/)
    }
  })

  it('factory respects default size (both impls)', () => {
    const amigoF = amigoCustomAlphabet('01', 10)
    const upstreamF = upstreamCustomAlphabet('01', 10)
    expect(amigoF().length).toBe(10)
    expect(upstreamF().length).toBe(10)
  })

  it('factory accepts per-call size (both impls)', () => {
    const amigoF = amigoCustomAlphabet('01', 5)
    const upstreamF = upstreamCustomAlphabet('01', 5)
    expect(amigoF(32).length).toBe(32)
    expect(upstreamF(32).length).toBe(32)
  })
})
