/**
 * Correctness & interop tests against yauzl@3 and adm-zip@0.5.
 *
 * This package does not claim drop-in parity — yauzl (event-based), adm-zip
 * (sync class) and jszip (promise-tree) have incompatible APIs. Instead we
 * assert that archives produced by amigo can be read by yauzl and adm-zip,
 * and that archives produced by those libraries can be read by amigo.
 */
import { describe, it, expect } from 'vitest'
import { ZipReader, ZipWriter } from '../index.js'
import AdmZip from 'adm-zip'
import yauzl from 'yauzl'

function amigoWrite(entries: Array<[string, string]>): Buffer {
  const w = new ZipWriter()
  for (const [n, c] of entries) w.add(n, Buffer.from(c, 'utf-8'))
  return w.finalize()
}

function yauzlRead(buf: Buffer): Promise<Record<string, string>> {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(buf, { lazyEntries: true }, (err, zipfile) => {
      if (err) return reject(err)
      if (!zipfile) return reject(new Error('no zipfile'))
      const out: Record<string, string> = {}
      zipfile.on('entry', (entry) => {
        zipfile.openReadStream(entry, (err2, stream) => {
          if (err2) return reject(err2)
          const chunks: Buffer[] = []
          stream.on('data', (c: Buffer) => chunks.push(c))
          stream.on('end', () => {
            out[entry.fileName] = Buffer.concat(chunks).toString('utf-8')
            zipfile.readEntry()
          })
        })
      })
      zipfile.on('end', () => resolve(out))
      zipfile.on('error', reject)
      zipfile.readEntry()
    })
  })
}

const CASES: Array<[string, Array<[string, string]>]> = [
  ['single file', [['hello.txt', 'hello world']]],
  [
    'multiple files',
    [
      ['a.txt', 'AAA'],
      ['b.txt', 'BBB'],
      ['c/d.txt', 'nested'],
    ],
  ],
  ['compressible content', [['repeat.txt', 'amigo-native '.repeat(500)]]],
]

describe('zip — interop: amigo-written → yauzl-read', () => {
  for (const [label, entries] of CASES) {
    it(label, async () => {
      const zip = amigoWrite(entries)
      const read = await yauzlRead(zip)
      for (const [name, content] of entries) expect(read[name]).toBe(content)
    })
  }
})

describe('zip — interop: amigo-written → adm-zip-read', () => {
  for (const [label, entries] of CASES) {
    it(label, () => {
      const zip = amigoWrite(entries)
      const adm = new AdmZip(zip)
      const read: Record<string, string> = {}
      for (const e of adm.getEntries()) read[e.entryName] = e.getData().toString('utf-8')
      for (const [name, content] of entries) expect(read[name]).toBe(content)
    })
  }
})

describe('zip — interop: adm-zip-written → amigo-read', () => {
  for (const [label, entries] of CASES) {
    it(label, () => {
      const adm = new AdmZip()
      for (const [n, c] of entries) adm.addFile(n, Buffer.from(c, 'utf-8'))
      const buf = adm.toBuffer()
      const r = ZipReader.fromBuffer(buf)
      for (const [name, content] of entries) {
        expect(r.read(name).toString('utf-8')).toBe(content)
      }
    })
  }
})
