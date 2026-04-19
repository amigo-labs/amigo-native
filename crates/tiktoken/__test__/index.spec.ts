import { describe, it, expect } from 'vitest'
import { Tiktoken } from '../index.js'

describe('Tiktoken basics', () => {
  it('getEncoding creates a reusable instance', () => {
    const enc = Tiktoken.getEncoding('cl100k_base')
    expect(enc.name).toBe('cl100k_base')
  })

  it('encode returns a Uint32Array of token ids', () => {
    const enc = Tiktoken.getEncoding('cl100k_base')
    const tokens = enc.encode('Hello, world!')
    expect(tokens).toBeInstanceOf(Uint32Array)
    expect(tokens.length).toBeGreaterThan(0)
    expect(tokens.length).toBeLessThan(10)
  })

  it('encode → decode roundtrip is lossless', () => {
    const enc = Tiktoken.getEncoding('cl100k_base')
    const text = 'The quick brown fox jumps over the lazy dog.'
    expect(enc.decode(enc.encode(text))).toBe(text)
  })

  it('encode → decode roundtrip on unicode', () => {
    const enc = Tiktoken.getEncoding('o200k_base')
    const text = '日本語テキスト — 🔑🔐🔒 — émojis & áccénts'
    expect(enc.decode(enc.encode(text))).toBe(text)
  })

  it('countTokens matches encode(...).length', () => {
    const enc = Tiktoken.getEncoding('cl100k_base')
    const text = 'The quick brown fox jumps over the lazy dog.'
    expect(enc.countTokens(text)).toBe(enc.encodeOrdinary(text).length)
  })

  it('isWithinTokenLimit is true for short inputs', () => {
    const enc = Tiktoken.getEncoding('cl100k_base')
    expect(enc.isWithinTokenLimit('hi', 100)).toBe(true)
  })

  it('isWithinTokenLimit is false when exceeded', () => {
    const enc = Tiktoken.getEncoding('cl100k_base')
    const longText = 'word '.repeat(1000)
    expect(enc.isWithinTokenLimit(longText, 10)).toBe(false)
  })

  it('encodeMany returns one Uint32Array per input', () => {
    const enc = Tiktoken.getEncoding('cl100k_base')
    const results = enc.encodeMany(['one', 'two three', 'four five six'])
    expect(results).toHaveLength(3)
    expect(results[0]).toBeInstanceOf(Uint32Array)
    expect(results[0].length).toBeLessThan(results[2].length)
  })

  it('encodingForModel resolves gpt-4o to o200k_base', () => {
    const enc = Tiktoken.encodingForModel('gpt-4o')
    const text = 'Hello, world!'
    const direct = Tiktoken.getEncoding('o200k_base').encode(text)
    expect(Array.from(enc.encode(text))).toEqual(Array.from(direct))
  })

  it('unknown encoding throws', () => {
    expect(() => Tiktoken.getEncoding('nonexistent')).toThrow(/unknown encoding/)
  })
})

describe('Tiktoken chat helpers', () => {
  const messages = [
    { role: 'system', content: 'You are a helpful assistant.' },
    { role: 'user', content: 'What is the capital of France?' },
    { role: 'assistant', content: 'The capital of France is Paris.' },
  ]

  it('countChatCompletionTokens is > raw content token count', () => {
    const enc = Tiktoken.encodingForModel('gpt-4')
    const chatCount = enc.countChatCompletionTokens(messages, 'gpt-4')
    const rawCount = messages.reduce(
      (sum, m) => sum + enc.countTokens(m.content),
      0,
    )
    // ChatML framing adds per-message overhead + reply-priming tokens
    expect(chatCount).toBeGreaterThan(rawCount)
  })

  it('encodeChat returns content tokens + full framing count', () => {
    const enc = Tiktoken.encodingForModel('gpt-4')
    const result = enc.encodeChat(messages, 'gpt-4')
    expect(result.tokens).toBeInstanceOf(Uint32Array)
    expect(result.count).toBeGreaterThan(result.tokens.length)
  })
})
