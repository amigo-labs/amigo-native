import { describe, it, expect } from 'vitest'
import { Tiktoken } from '../index.js'

// Upstream baselines: tiktoken (WASM) and gpt-tokenizer (pure JS).
// Both wrap OpenAI's BPE algorithm, so token IDs must match bit-exactly
// for every encoding we claim to support.
import * as wasmTiktoken from 'tiktoken'
import * as gptTokenizerCl100k from 'gpt-tokenizer/encoding/cl100k_base'
import * as gptTokenizerO200k from 'gpt-tokenizer/encoding/o200k_base'

// Ordinary fixtures — no special tokens. Safe to cross-verify against
// every upstream's default `encode` (which defaults to disallow specials).
const ORDINARY_FIXTURES: string[] = [
  '',
  'hi',
  'Hello, world!',
  'The quick brown fox jumps over the lazy dog.',
  'a'.repeat(1000),
  'word '.repeat(200),
  '日本語テキスト',
  '🔑🔐🔒 emoji test',
  'mixed — émoji 🚀 and ASCII',
  'Code: `const x = 42;` with backticks',
  'Multi\nline\n\ttext with tabs',
]

// Fixtures containing special tokens — only valid against our
// `encode()` (which enables all specials) and `wasm.encode(text, "all")`.
const SPECIAL_FIXTURES: string[] = ['<|endoftext|> treated as special']

const utf8 = new TextDecoder()

describe('tiktoken parity — cl100k_base encodeOrdinary vs. tiktoken (WASM)', () => {
  const amigo = Tiktoken.getEncoding('cl100k_base')
  const wasm = wasmTiktoken.get_encoding('cl100k_base')

  for (const text of ORDINARY_FIXTURES) {
    it(`encodeOrdinary: ${JSON.stringify(text.slice(0, 30))}${text.length > 30 ? '…' : ''}`, () => {
      const ours = Array.from(amigo.encodeOrdinary(text))
      const theirs = Array.from(wasm.encode_ordinary(text))
      expect(ours).toEqual(theirs)
    })
  }

})

describe('tiktoken parity — o200k_base encodeOrdinary vs. tiktoken (WASM)', () => {
  const amigo = Tiktoken.getEncoding('o200k_base')
  const wasm = wasmTiktoken.get_encoding('o200k_base')

  for (const text of ORDINARY_FIXTURES) {
    it(`encodeOrdinary: ${JSON.stringify(text.slice(0, 30))}${text.length > 30 ? '…' : ''}`, () => {
      const ours = Array.from(amigo.encodeOrdinary(text))
      const theirs = Array.from(wasm.encode_ordinary(text))
      expect(ours).toEqual(theirs)
    })
  }

})

describe('tiktoken parity — cl100k_base encode (with specials) vs. tiktoken (WASM)', () => {
  const amigo = Tiktoken.getEncoding('cl100k_base')
  const wasm = wasmTiktoken.get_encoding('cl100k_base')

  for (const text of [...ORDINARY_FIXTURES, ...SPECIAL_FIXTURES]) {
    it(`encode: ${JSON.stringify(text.slice(0, 30))}${text.length > 30 ? '…' : ''}`, () => {
      const ours = Array.from(amigo.encode(text))
      const theirs = Array.from(wasm.encode(text, 'all'))
      expect(ours).toEqual(theirs)
    })
  }

})

describe('tiktoken parity — cl100k_base encodeOrdinary vs. gpt-tokenizer', () => {
  const amigo = Tiktoken.getEncoding('cl100k_base')

  for (const text of ORDINARY_FIXTURES) {
    it(`encode: ${JSON.stringify(text.slice(0, 30))}${text.length > 30 ? '…' : ''}`, () => {
      const ours = Array.from(amigo.encodeOrdinary(text))
      const theirs = gptTokenizerCl100k.encode(text)
      expect(ours).toEqual(theirs)
    })
  }
})

describe('tiktoken parity — o200k_base encodeOrdinary vs. gpt-tokenizer', () => {
  const amigo = Tiktoken.getEncoding('o200k_base')

  for (const text of ORDINARY_FIXTURES) {
    it(`encode: ${JSON.stringify(text.slice(0, 30))}${text.length > 30 ? '…' : ''}`, () => {
      const ours = Array.from(amigo.encodeOrdinary(text))
      const theirs = gptTokenizerO200k.encode(text)
      expect(ours).toEqual(theirs)
    })
  }
})

describe('tiktoken parity — decode roundtrip vs. tiktoken (WASM)', () => {
  const amigo = Tiktoken.getEncoding('cl100k_base')
  const wasm = wasmTiktoken.get_encoding('cl100k_base')

  for (const text of ORDINARY_FIXTURES) {
    it(`decode(wasm.encode(x)) == x: ${JSON.stringify(text.slice(0, 30))}${text.length > 30 ? '…' : ''}`, () => {
      const theirTokens = wasm.encode_ordinary(text)
      const ourRoundtrip = amigo.decode(theirTokens)
      const theirRoundtrip = utf8.decode(wasm.decode(theirTokens))
      expect(ourRoundtrip).toBe(text)
      expect(ourRoundtrip).toBe(theirRoundtrip)
    })
  }

})

describe('tiktoken parity — chat framing matches tiktoken-rs built-in', () => {
  // Verifies that countChatCompletionTokens produces the ChatML-framed
  // count, not the raw content sum. The exact framing constants depend on
  // model version (3/3 for most, 4/2 for legacy gpt-3.5-turbo-0301), so
  // we assert the framing adds non-zero overhead rather than a fixed
  // constant.
  const messages = [
    { role: 'system', content: 'You are a helpful assistant.' },
    { role: 'user', content: 'What is 2+2?' },
    { role: 'assistant', content: '2+2 is 4.' },
  ]

  for (const model of ['gpt-3.5-turbo', 'gpt-4', 'gpt-4o']) {
    it(`${model}: framing adds overhead over raw content`, () => {
      const enc = Tiktoken.encodingForModel(model)
      const framed = enc.countChatCompletionTokens(messages, model)
      const contentOnly = messages.reduce(
        (s, m) => s + enc.countTokens(m.content),
        0,
      )
      expect(framed).toBeGreaterThan(contentOnly)
    })
  }
})
