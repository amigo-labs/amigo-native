import { bench, describe } from 'vitest'
import { ZipReader, ZipWriter } from '../index.js'
import AdmZip from 'adm-zip'

function amigoWriteMany(n: number, size: number): Buffer {
  const w = new ZipWriter()
  const body = Buffer.alloc(size, 0x41)
  for (let i = 0; i < n; i++) w.add(`file-${i}.bin`, body)
  return w.finalize()
}

function admWriteMany(n: number, size: number): Buffer {
  const adm = new AdmZip()
  const body = Buffer.alloc(size, 0x41)
  for (let i = 0; i < n; i++) adm.addFile(`file-${i}.bin`, body)
  return adm.toBuffer()
}

const smallArchive = amigoWriteMany(100, 1024)
const largeArchive = (() => {
  const w = new ZipWriter()
  w.add('big.bin', Buffer.alloc(10 * 1024 * 1024, 0x41))
  return w.finalize()
})()

describe('zip — write 100 x 1KB files', () => {
  bench('@amigo-labs/zip', () => {
    amigoWriteMany(100, 1024)
  })
  bench('adm-zip', () => {
    admWriteMany(100, 1024)
  })
})

describe('zip — write 1 x 10MB file', () => {
  bench('@amigo-labs/zip', () => {
    const w = new ZipWriter()
    w.add('big.bin', Buffer.alloc(10 * 1024 * 1024, 0x41))
    w.finalize()
  })
  bench('adm-zip', () => {
    const a = new AdmZip()
    a.addFile('big.bin', Buffer.alloc(10 * 1024 * 1024, 0x41))
    a.toBuffer()
  })
})

describe('zip — read entries (100 files)', () => {
  bench('@amigo-labs/zip', () => {
    ZipReader.fromBuffer(smallArchive).entries()
  })
  bench('adm-zip', () => {
    new AdmZip(smallArchive).getEntries()
  })
})

describe('zip — extract all (100 files)', () => {
  bench('@amigo-labs/zip (extractAll)', () => {
    ZipReader.fromBuffer(smallArchive).extractAll()
  })
  bench('@amigo-labs/zip (entries + read loop)', () => {
    const r = ZipReader.fromBuffer(smallArchive)
    for (const e of r.entries()) r.read(e.name)
  })
  bench('adm-zip', () => {
    const a = new AdmZip(smallArchive)
    for (const e of a.getEntries()) e.getData()
  })
})

describe('zip — extract large (10MB)', () => {
  bench('@amigo-labs/zip', () => {
    const r = ZipReader.fromBuffer(largeArchive)
    r.read('big.bin')
  })
  bench('adm-zip', () => {
    const a = new AdmZip(largeArchive)
    a.getEntries()[0].getData()
  })
})
