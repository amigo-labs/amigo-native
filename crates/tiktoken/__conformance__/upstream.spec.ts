import { describe, it, expect } from 'vitest'
import { Tiktoken } from '../index.js'

/**
 * Upstream conformance — hardcoded reference vectors from OpenAI's
 * `tiktoken` reference implementation (https://github.com/openai/tiktoken).
 *
 * Where `parity.spec.ts` cross-verifies dynamically against `tiktoken`-WASM
 * and `gpt-tokenizer` on a rolling corpus, this file pins a set of
 * compile-time constants so BPE-table drift is caught immediately — the
 * same inputs must always produce the same token IDs for the algorithm
 * to be correct.
 *
 * The expected token IDs are taken from OpenAI's own test suite and
 * documentation at https://github.com/openai/tiktoken/tree/main/tests.
 */

describe('tiktoken — cl100k_base reference vectors', () => {
  const cl100k = Tiktoken.getEncoding('cl100k_base')

  it('empty string encodes to []', () => {
    expect(Array.from(cl100k.encode(''))).toEqual([])
  })

  it('"hello world" matches OpenAI reference', () => {
    expect(Array.from(cl100k.encode('hello world'))).toEqual([15339, 1917])
  })

  it('"tiktoken is great!" matches OpenAI reference', () => {
    expect(Array.from(cl100k.encode('tiktoken is great!'))).toEqual([
      83, 1609, 5963, 374, 2294, 0,
    ])
  })

  it('"The quick brown fox" encodes and decodes round-trip', () => {
    const text = 'The quick brown fox jumps over the lazy dog.'
    const tokens = cl100k.encode(text)
    expect(cl100k.decode(tokens)).toBe(text)
  })

  it('encodeOrdinary treats <|endoftext|> as text', () => {
    const tokens = cl100k.encodeOrdinary('<|endoftext|>')
    // The literal string must decode back to itself.
    expect(cl100k.decode(tokens)).toBe('<|endoftext|>')
  })

  it('encode treats <|endoftext|> as the special token (100257)', () => {
    const tokens = Array.from(cl100k.encode('<|endoftext|>'))
    expect(tokens).toContain(100257) // cl100k_base EOT token id
  })
})

describe('tiktoken — o200k_base reference vectors (GPT-4o)', () => {
  const o200k = Tiktoken.getEncoding('o200k_base')

  it('empty string encodes to []', () => {
    expect(Array.from(o200k.encode(''))).toEqual([])
  })

  it('round-trip preserves ASCII exactly', () => {
    const text = 'The quick brown fox jumps over the lazy dog.'
    expect(o200k.decode(o200k.encode(text))).toBe(text)
  })

  it('round-trip preserves multibyte UTF-8 (CJK + emoji)', () => {
    const text = '日本語テキスト 🔑🔐🔒'
    expect(o200k.decode(o200k.encode(text))).toBe(text)
  })
})

describe('tiktoken — encodingForModel mappings', () => {
  it('gpt-4 → cl100k_base', () => {
    const a = Tiktoken.encodingForModel('gpt-4')
    const b = Tiktoken.getEncoding('cl100k_base')
    const text = 'sanity check'
    expect(Array.from(a.encode(text))).toEqual(Array.from(b.encode(text)))
  })

  it('gpt-4o → o200k_base', () => {
    const a = Tiktoken.encodingForModel('gpt-4o')
    const b = Tiktoken.getEncoding('o200k_base')
    const text = 'sanity check'
    expect(Array.from(a.encode(text))).toEqual(Array.from(b.encode(text)))
  })

  it('gpt-3.5-turbo → cl100k_base', () => {
    const a = Tiktoken.encodingForModel('gpt-3.5-turbo')
    const b = Tiktoken.getEncoding('cl100k_base')
    const text = 'sanity check'
    expect(Array.from(a.encode(text))).toEqual(Array.from(b.encode(text)))
  })
})

describe('tiktoken — countTokens vs encode.length (invariant)', () => {
  const enc = Tiktoken.getEncoding('cl100k_base')
  const samples = [
    '',
    'one token',
    'a'.repeat(100),
    'The quick brown fox jumps over the lazy dog.',
    'mixed — émoji 🚀 and ASCII',
  ]

  for (const text of samples) {
    it(`countTokens === encode.length on ${JSON.stringify(text.slice(0, 30))}${text.length > 30 ? '…' : ''}`, () => {
      expect(enc.countTokens(text)).toBe(enc.encodeOrdinary(text).length)
    })
  }
})
