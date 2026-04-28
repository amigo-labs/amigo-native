/**
 * Core interop gate against adm-zip@0.5. The full case matrix and the
 * yauzl-based async tests live in `upstream.spec.ts`; this file is the
 * contract gate that every release must pass.
 */
import { describe, it, expect } from 'vitest'
import { ZipReader, ZipWriter } from '../index.js'
import AdmZip from 'adm-zip'

describe('zip — parity gate: amigo ↔ adm-zip interop', () => {
  it('amigo-written archive reads under adm-zip', () => {
    const w = new ZipWriter()
    w.add('hello.txt', Buffer.from('hello world', 'utf-8'))
    w.add('nested/file.txt', Buffer.from('nested content', 'utf-8'))
    const buf = w.finalize()

    const ar = new AdmZip(buf)
    const got: Record<string, string> = {}
    for (const e of ar.getEntries()) {
      got[e.entryName] = e.getData().toString('utf-8')
    }
    expect(got).toEqual({
      'hello.txt': 'hello world',
      'nested/file.txt': 'nested content',
    })
  })

  it('adm-zip-written archive reads under amigo', () => {
    const ar = new AdmZip()
    ar.addFile('a.txt', Buffer.from('A', 'utf-8'))
    ar.addFile('b.txt', Buffer.from('B', 'utf-8'))
    const buf = ar.toBuffer()

    const r = ZipReader.fromBuffer(buf)
    const out: Record<string, string> = {}
    for (const e of r.extractAll()) {
      out[e.name] = Buffer.from(e.data).toString('utf-8')
    }
    expect(out).toEqual({ 'a.txt': 'A', 'b.txt': 'B' })
  })

  it('reports BigInt sizes for entries', () => {
    const w = new ZipWriter()
    w.add('payload', Buffer.from('hello'))
    const r = ZipReader.fromBuffer(w.finalize())
    const entry = r.entries()[0]
    expect(typeof entry.size).toBe('bigint')
    expect(entry.size).toBe(5n)
  })
})
