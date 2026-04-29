/**
 * Core parity smoke against pako@2 and node:zlib. The full input matrix
 * (including 100 KB inputs and the raw-vs-zlib variants) lives in
 * `upstream.spec.ts`; this file is the contract gate that every release
 * must pass.
 */
import { describe, it, expect } from 'vitest'
import {
  deflate as amigoDeflate,
  inflate as amigoInflate,
  gzip as amigoGzip,
  ungzip as amigoUngzip,
} from '../index.js'
import pako from 'pako'
import * as zlib from 'node:zlib'

const INPUTS: Array<[string, Buffer]> = [
  ['empty', Buffer.alloc(0)],
  ['small-ascii', Buffer.from('hello world', 'utf-8')],
  ['repeated-1KB', Buffer.from('amigo '.repeat(200), 'utf-8')],
]

describe('inflate — parity gate vs pako@2', () => {
  for (const [name, input] of INPUTS) {
    it(`amigo.deflate → pako.inflate (${name})`, () => {
      const enc = amigoDeflate(input)
      const dec = Buffer.from(pako.inflate(enc))
      expect(dec.equals(input)).toBe(true)
    })

    it(`pako.deflate → amigo.inflate (${name})`, () => {
      const enc = Buffer.from(pako.deflate(input))
      const dec = amigoInflate(enc)
      expect(dec.equals(input)).toBe(true)
    })

    it(`amigo.gzip → pako.ungzip (${name})`, () => {
      const enc = amigoGzip(input)
      const dec = Buffer.from(pako.ungzip(enc))
      expect(dec.equals(input)).toBe(true)
    })
  }
})

describe('inflate — parity gate vs node:zlib', () => {
  it('amigo.deflate → zlib.inflateSync round-trips', () => {
    const input = Buffer.from('the quick brown fox', 'utf-8')
    const enc = amigoDeflate(input)
    const dec = zlib.inflateSync(enc)
    expect(Buffer.from(dec).equals(input)).toBe(true)
  })

  it('zlib.deflateSync → amigo.inflate round-trips', () => {
    const input = Buffer.from('the quick brown fox', 'utf-8')
    const enc = zlib.deflateSync(input)
    const dec = amigoInflate(Buffer.from(enc))
    expect(dec.equals(input)).toBe(true)
  })

  it('amigo.ungzip rejects oversize input above maxOutputSize', () => {
    const input = Buffer.alloc(1024 * 1024)
    const enc = amigoGzip(input)
    expect(() => amigoUngzip(enc, { maxOutputSize: 256 * 1024 })).toThrow(/max_output_size/)
  })
})
