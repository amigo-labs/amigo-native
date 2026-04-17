import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { ZipReader, ZipWriter } from '../index.js'

describe('zip fuzzing', () => {
  it('single-entry roundtrip preserves bytes (deflate)', () => {
    fc.assert(
      fc.property(fc.uint8Array({ minLength: 0, maxLength: 8192 }), (bytes) => {
        const writer = new ZipWriter()
        writer.add('data.bin', Buffer.from(bytes), { compression: 'deflate' })
        const archive = writer.finalize()
        const reader = ZipReader.fromBuffer(archive)
        const read = reader.read('data.bin')
        expect(read.equals(Buffer.from(bytes))).toBe(true)
      }),
      { numRuns: 100, seed: 42 },
    )
  })

  it('single-entry roundtrip preserves bytes (stored)', () => {
    fc.assert(
      fc.property(fc.uint8Array({ minLength: 0, maxLength: 8192 }), (bytes) => {
        const writer = new ZipWriter()
        writer.add('data.bin', Buffer.from(bytes), { compression: 'stored' })
        const archive = writer.finalize()
        const reader = ZipReader.fromBuffer(archive)
        const read = reader.read('data.bin')
        expect(read.equals(Buffer.from(bytes))).toBe(true)
      }),
      { numRuns: 100, seed: 42 },
    )
  })

  it('multi-entry archive keeps every name addressable', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.tuple(fc.stringMatching(/^[a-z0-9][a-z0-9_.-]{0,20}$/), fc.uint8Array({ minLength: 0, maxLength: 256 })),
          { minLength: 1, maxLength: 8 },
        ),
        (entries) => {
          const names = new Set(entries.map((e) => e[0]))
          fc.pre(names.size === entries.length)
          const writer = new ZipWriter()
          for (const [name, bytes] of entries) writer.add(name, Buffer.from(bytes))
          const archive = writer.finalize()
          const reader = ZipReader.fromBuffer(archive)
          for (const [name, bytes] of entries) {
            expect(reader.read(name).equals(Buffer.from(bytes))).toBe(true)
          }
        },
      ),
      { numRuns: 50, seed: 42 },
    )
  })
})
