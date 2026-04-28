/**
 * Core parity smoke against iconv-lite@0.6. The exhaustive encoding
 * matrix lives in `upstream.spec.ts`; this file is the contract gate
 * that every release must pass.
 */
import { describe, it, expect } from 'vitest'
import { encode as amigoEncode, decode as amigoDecode, encodingExists as amigoExists } from '../index.js'
import * as iconv from 'iconv-lite'

const STRINGS: Array<[string, string]> = [
  ['ascii', 'Hello, World!'],
  ['latin1-range', 'café résumé'],
  ['cyrillic', 'Привет мир'],
  ['japanese', 'こんにちは世界'],
  ['emoji', 'Hello 🌍'],
]

describe('encoding — parity gate: utf-8 roundtrip', () => {
  for (const [name, s] of STRINGS) {
    it(`utf-8 encode(${name})`, () => {
      const a = Buffer.from(amigoEncode(s, 'utf-8'))
      const b = iconv.encode(s, 'utf-8')
      expect(a.equals(b)).toBe(true)
    })

    it(`utf-8 decode(${name})`, () => {
      const bytes = iconv.encode(s, 'utf-8')
      expect(amigoDecode(bytes, 'utf-8')).toBe(iconv.decode(bytes, 'utf-8'))
    })
  }
})

describe('encoding — parity gate: encodingExists', () => {
  for (const label of ['utf-8', 'utf8', 'latin1', 'windows-1252', 'shift_jis', 'gbk']) {
    it(`recognises "${label}"`, () => {
      expect(amigoExists(label)).toBe(iconv.encodingExists(label))
    })
  }
})
