import { describe, it, expect } from 'vitest'
import { encode, decode, encodingExists } from '../index.js'

describe('encoding', () => {
  describe('encodingExists', () => {
    for (const e of [
      'utf-8',
      'UTF-8',
      'utf8',
      'latin1',
      'windows-1252',
      'shift_jis',
      'cp932',
      'gbk',
      'big5',
      'euc-kr',
    ]) {
      it(`knows "${e}"`, () => {
        expect(encodingExists(e)).toBe(true)
      })
    }

    it('returns false for nonsense', () => {
      expect(encodingExists('klingon-1982')).toBe(false)
    })
  })

  describe('encode/decode roundtrip', () => {
    // encoding_rs (WHATWG spec) does not expose encoders for utf-16be, utf-16le,
    // or replacement — only decoders. They roundtrip via their utf-8 form.
    for (const enc of ['utf-8', 'windows-1252', 'latin1']) {
      it(`${enc}: "café"`, () => {
        const bytes = encode('café', enc)
        expect(decode(bytes, enc)).toBe('café')
      })
    }

    it('shift_jis handles japanese', () => {
      expect(decode(encode('こんにちは', 'shift_jis'), 'shift_jis')).toBe('こんにちは')
    })

    it('utf-16le decodes', () => {
      const bytes = Buffer.from([0x68, 0x00, 0x69, 0x00]) // "hi" utf-16le
      expect(decode(bytes, 'utf-16le')).toBe('hi')
    })

    it('throws on unknown encoding', () => {
      expect(() => encode('hi', 'klingon-1982')).toThrow()
      expect(() => decode(Buffer.from([0]), 'klingon-1982')).toThrow()
    })
  })
})
