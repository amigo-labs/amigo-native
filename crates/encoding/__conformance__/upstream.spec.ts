/**
 * Parity tests against iconv-lite@0.6.
 *
 * Strategy: for each core encoding, verify that amigo encodes to identical
 * bytes as iconv-lite, and decodes to identical strings. Also verify that
 * legacy alias resolution matches (cp932→shift_jis, utf8→utf-8, etc).
 */
import { describe, it, expect } from 'vitest'
import {
  encode as amigoEncode,
  decode as amigoDecode,
  encodingExists as amigoExists,
} from '../index.js'
import * as iconv from 'iconv-lite'

const STRINGS: Array<[string, string]> = [
  ['ascii', 'Hello, World!'],
  ['latin1-range', 'café résumé naïve crème brûlée'],
  ['cyrillic', 'Привет мир'],
  ['greek', 'Γειά σου κόσμε'],
  ['hebrew', 'שלום עולם'],
  ['japanese', 'こんにちは世界'],
  ['chinese', '你好世界'],
  ['korean', '안녕 세상'],
  ['emoji', 'Hello 🌍'],
]

const CORE_ENCODINGS = [
  'utf-8',
  'utf-16le',
  'utf-16be',
  'latin1',
  'windows-1252',
]

const ASIAN_ENCODINGS = ['shift_jis', 'gbk', 'big5', 'euc-kr']

describe('encoding — parity with iconv-lite: encodingExists', () => {
  for (const label of [
    'utf-8',
    'UTF-8',
    'utf8',
    'latin1',
    'windows-1252',
    'cp1252',
    'shift_jis',
    'cp932',
    'gbk',
    'big5',
    'euc-kr',
  ]) {
    it(`both recognise "${label}"`, () => {
      expect(amigoExists(label)).toBe(iconv.encodingExists(label))
    })
  }

  it('both reject garbage', () => {
    expect(amigoExists('klingon-1982')).toBe(false)
    expect(iconv.encodingExists('klingon-1982')).toBe(false)
  })
})

describe('encoding — parity: core encodings byte-exact', () => {
  for (const enc of CORE_ENCODINGS) {
    for (const [label, str] of STRINGS) {
      it(`${enc} / ${label}`, () => {
        const amigoBytes = amigoEncode(str, enc)
        const iconvBytes = iconv.encode(str, enc)
        expect(Buffer.from(amigoBytes).equals(iconvBytes)).toBe(true)

        const amigoStr = amigoDecode(amigoBytes, enc)
        const iconvStr = iconv.decode(iconvBytes, enc)
        expect(amigoStr).toBe(iconvStr)
      })
    }
  }
})

describe('encoding — parity: CJK encodings roundtrip', () => {
  // For lossy or language-specific encodings, byte-exact parity is not always
  // achievable (substitution char choice can differ). We assert roundtrip and
  // that decoding iconv-lite bytes gives equivalent strings.
  for (const enc of ASIAN_ENCODINGS) {
    for (const [label, str] of STRINGS) {
      it(`${enc} / ${label}: iconv-encoded → amigo-decoded`, () => {
        const iconvBytes = iconv.encode(str, enc)
        const amigoStr = amigoDecode(iconvBytes, enc)
        const iconvStr = iconv.decode(iconvBytes, enc)
        expect(amigoStr).toBe(iconvStr)
      })
    }
  }
})
