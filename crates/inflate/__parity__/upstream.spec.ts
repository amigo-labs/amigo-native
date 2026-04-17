/**
 * Parity tests against pako@2 and Node's built-in zlib.
 *
 * Strategy: for each input, compress with pako and decompress with amigo
 * (and vice-versa). Same for gzip/raw. Byte-equivalence is required.
 * Also cross-validate against Node's zlib as the format ground truth.
 */
import { describe, it, expect } from 'vitest'
import {
  deflate as amigoDeflate,
  inflate as amigoInflate,
  deflateRaw as amigoDeflateRaw,
  inflateRaw as amigoInflateRaw,
  gzip as amigoGzip,
  ungzip as amigoUngzip,
} from '../index.js'
import pako from 'pako'
import * as zlib from 'node:zlib'

const INPUTS: Array<[string, Buffer]> = [
  ['empty', Buffer.alloc(0)],
  ['small-ascii', Buffer.from('hello world', 'utf-8')],
  ['repeated-100KB', Buffer.from('amigo '.repeat(20_000), 'utf-8')],
  ['random-10KB', (() => {
    const b = Buffer.alloc(10 * 1024)
    for (let i = 0; i < b.length; i++) b[i] = (i * 2654435761) & 0xff
    return b
  })()],
]

describe('inflate — parity with pako@2', () => {
  for (const [name, input] of INPUTS) {
    it(`zlib: amigo.deflate → pako.inflate (${name})`, () => {
      const enc = amigoDeflate(input)
      const dec = Buffer.from(pako.inflate(enc))
      expect(dec.equals(input)).toBe(true)
    })

    it(`zlib: pako.deflate → amigo.inflate (${name})`, () => {
      const enc = Buffer.from(pako.deflate(input))
      const dec = amigoInflate(enc)
      expect(dec.equals(input)).toBe(true)
    })

    it(`raw: amigo.deflateRaw → pako.inflateRaw (${name})`, () => {
      const enc = amigoDeflateRaw(input)
      const dec = Buffer.from(pako.inflateRaw(enc))
      expect(dec.equals(input)).toBe(true)
    })

    it(`raw: pako.deflateRaw → amigo.inflateRaw (${name})`, () => {
      const enc = Buffer.from(pako.deflateRaw(input))
      const dec = amigoInflateRaw(enc)
      expect(dec.equals(input)).toBe(true)
    })

    it(`gzip: amigo.gzip → pako.ungzip (${name})`, () => {
      const enc = amigoGzip(input)
      const dec = Buffer.from(pako.ungzip(enc))
      expect(dec.equals(input)).toBe(true)
    })

    it(`gzip: pako.gzip → amigo.ungzip (${name})`, () => {
      const enc = Buffer.from(pako.gzip(input))
      const dec = amigoUngzip(enc)
      expect(dec.equals(input)).toBe(true)
    })
  }
})

describe('inflate — parity with node:zlib (format ground truth)', () => {
  for (const [name, input] of INPUTS) {
    it(`amigo.deflate → zlib.inflateSync (${name})`, () => {
      const enc = amigoDeflate(input)
      const dec = zlib.inflateSync(enc)
      expect(Buffer.from(dec).equals(input)).toBe(true)
    })

    it(`zlib.deflateSync → amigo.inflate (${name})`, () => {
      const enc = zlib.deflateSync(input)
      const dec = amigoInflate(Buffer.from(enc))
      expect(dec.equals(input)).toBe(true)
    })

    it(`amigo.gzip → zlib.gunzipSync (${name})`, () => {
      const enc = amigoGzip(input)
      const dec = zlib.gunzipSync(enc)
      expect(Buffer.from(dec).equals(input)).toBe(true)
    })
  }
})
