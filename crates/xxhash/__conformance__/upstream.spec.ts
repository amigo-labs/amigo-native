import { describe, it, expect, beforeAll } from 'vitest'
import { xxh32, xxh64, xxh3_64 } from '../index.js'
import createXxhash from 'xxhash-wasm'
import XXH from 'xxhashjs'

/**
 * Upstream conformance for `@amigo-labs/xxhash` against two independent
 * reference implementations (`xxhash-wasm` — WASM binding of the reference
 * C, and `xxhashjs` — pure-JS port) across a large corpus. Divergence on
 * any input is a bug, either in us or upstream.
 *
 * Hardcoded ground-truth vectors come from the xxHash v0.8.2 reference:
 *   https://github.com/Cyan4973/xxHash
 */

// Canonical vectors from the xxHash reference implementation.
const CANONICAL_XXH32: Array<{ input: string; seed: number; expected: number }> = [
  { input: '', seed: 0, expected: 0x02cc5d05 },
  { input: '', seed: 1, expected: 0x0b2cb792 },
]

const CANONICAL_XXH64: Array<{ input: string; seed: bigint; expected: bigint }> = [
  { input: '', seed: 0n, expected: 0xef46db3751d8e999n },
]

describe('xxhash — canonical reference vectors', () => {
  for (const { input, seed, expected } of CANONICAL_XXH32) {
    it(`XXH32(${JSON.stringify(input)}, seed=${seed}) === 0x${expected.toString(16)}`, () => {
      expect(xxh32(Buffer.from(input), seed)).toBe(expected)
    })
  }

  for (const { input, seed, expected } of CANONICAL_XXH64) {
    it(`XXH64(${JSON.stringify(input)}, seed=${seed}) === 0x${expected.toString(16)}`, () => {
      expect(xxh64(Buffer.from(input), seed)).toBe(expected)
    })
  }
})

// --- Corpus cross-check against xxhash-wasm (reference C via WASM) -----

const CORPUS: string[] = [
  '',
  'a',
  'ab',
  'abc',
  'abcd',
  'abcdefgh',
  'abcdefghijklmnop',
  'The quick brown fox jumps over the lazy dog',
  'hello world',
  '\x00'.repeat(16),
  '\x00'.repeat(256),
  '\xff'.repeat(256),
  'a'.repeat(1024),
  'a'.repeat(65536),
  'Ärger über Übel — Ümlaute',
  '🎉🚀🌍 emoji coverage',
  Buffer.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]).toString('binary'),
]

let wasm: Awaited<ReturnType<typeof createXxhash>>

beforeAll(async () => {
  wasm = await createXxhash()
})

describe('xxhash vs xxhash-wasm (reference C via WASM)', () => {
  for (const input of CORPUS) {
    const label = `${input.length}B ${JSON.stringify(input.slice(0, 24))}${input.length > 24 ? '…' : ''}`

    it(`XXH32 ${label}`, () => {
      const buf = Buffer.from(input, 'binary')
      expect(xxh32(buf, 0)).toBe(wasm.h32Raw(buf, 0))
    })

    it(`XXH64 ${label}`, () => {
      const buf = Buffer.from(input, 'binary')
      expect(xxh64(buf, 0n)).toBe(wasm.h64Raw(buf))
    })
  }
})

describe('xxhash vs xxhashjs (pure-JS reference)', () => {
  for (const input of CORPUS) {
    const label = `${input.length}B ${JSON.stringify(input.slice(0, 24))}${input.length > 24 ? '…' : ''}`

    it(`XXH32 ${label}`, () => {
      const buf = Buffer.from(input, 'binary')
      expect(xxh32(buf, 0)).toBe(XXH.h32(buf, 0).toNumber())
    })

    it(`XXH64 ${label}`, () => {
      const buf = Buffer.from(input, 'binary')
      // xxhashjs returns a UINT64 object; compare hex to avoid bigint / object mismatch
      expect(xxh64(buf, 0n).toString(16)).toBe(XXH.h64(buf, 0).toString(16))
    })
  }
})

describe('xxhash XXH3 — seed invariants', () => {
  it('XXH3_64 is deterministic for the whole corpus', () => {
    for (const input of CORPUS) {
      const buf = Buffer.from(input, 'binary')
      expect(xxh3_64(buf)).toBe(xxh3_64(buf))
    }
  })

  it('XXH3_64 with distinct seeds yields distinct results on non-trivial input', () => {
    const buf = Buffer.from('the quick brown fox')
    const hashes = new Set<bigint>()
    for (let s = 0n; s < 100n; s++) hashes.add(xxh3_64(buf, s))
    expect(hashes.size).toBeGreaterThanOrEqual(99)
  })
})
