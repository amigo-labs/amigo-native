import { bench, describe } from 'vitest'
import { ZipReader, ZipWriter } from '../index.js'
// WASM is built as build output, not committed. On a fresh checkout
// run `pnpm build:wasm` before `pnpm bench` to include the WASM
// comparator; otherwise the bench skips those entries with a warning.
let wasmZipReader: typeof ZipReader | null = null
let wasmZipWriter: typeof ZipWriter | null = null
try {
  // @ts-expect-error — generated artifact path; not in source tree
  const mod = await import('../wasm/pkg/amigo_zip_wasm.js')
  wasmZipReader = mod.ZipReader
  wasmZipWriter = mod.ZipWriter
} catch {
  console.warn('[bench] WASM artifact missing — run `pnpm build:wasm` to include WASM comparator')
}
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

// The WASM `ZipReader` takes its source buffer via the constructor; the
// napi build exposes the static `fromBuffer` factory instead. Bridge the
// two shapes so the WASM comparator can read the same fixtures.
type WasmReaderCtor = { new (buf: Uint8Array): InstanceType<typeof ZipReader> }
const wasmReaderFrom = wasmZipReader
  ? (buf: Buffer) => new (wasmZipReader! as unknown as WasmReaderCtor)(buf)
  : null

function wasmWriteMany(n: number, size: number): void {
  const w = new wasmZipWriter!()
  const body = Buffer.alloc(size, 0x41)
  for (let i = 0; i < n; i++) w.add(`file-${i}.bin`, body)
  w.finalize()
}

describe('zip — write 100 x 1KB files', () => {
  bench('@amigo-labs/zip (napi)', () => {
    amigoWriteMany(100, 1024)
  })
  if (wasmZipWriter) bench('@amigo-labs/zip (wasm)', () => {
    wasmWriteMany(100, 1024)
  })
  bench('adm-zip', () => {
    admWriteMany(100, 1024)
  })
})

describe('zip — write 1 x 10MB file', () => {
  bench('@amigo-labs/zip (napi)', () => {
    const w = new ZipWriter()
    w.add('big.bin', Buffer.alloc(10 * 1024 * 1024, 0x41))
    w.finalize()
  })
  if (wasmZipWriter) bench('@amigo-labs/zip (wasm)', () => {
    const w = new wasmZipWriter!()
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
  bench('@amigo-labs/zip (napi)', () => {
    ZipReader.fromBuffer(smallArchive).entries()
  })
  if (wasmReaderFrom) bench('@amigo-labs/zip (wasm)', () => {
    wasmReaderFrom(smallArchive).entries()
  })
  bench('adm-zip', () => {
    new AdmZip(smallArchive).getEntries()
  })
})

describe('zip — extract all (100 files)', () => {
  bench('@amigo-labs/zip (napi) (extractAll)', () => {
    ZipReader.fromBuffer(smallArchive).extractAll()
  })
  bench('@amigo-labs/zip (napi) (entries + read loop)', () => {
    const r = ZipReader.fromBuffer(smallArchive)
    for (const e of r.entries()) r.read(e.name)
  })
  if (wasmReaderFrom) bench('@amigo-labs/zip (wasm) (extractAll)', () => {
    wasmReaderFrom(smallArchive).extractAll()
  })
  if (wasmReaderFrom) bench('@amigo-labs/zip (wasm) (entries + read loop)', () => {
    const r = wasmReaderFrom(smallArchive)
    for (const e of r.entries()) r.read(e.name)
  })
  bench('adm-zip', () => {
    const a = new AdmZip(smallArchive)
    for (const e of a.getEntries()) e.getData()
  })
})

describe('zip — extract large (10MB)', () => {
  bench('@amigo-labs/zip (napi)', () => {
    const r = ZipReader.fromBuffer(largeArchive)
    r.read('big.bin')
  })
  if (wasmReaderFrom) bench('@amigo-labs/zip (wasm)', () => {
    const r = wasmReaderFrom(largeArchive)
    r.read('big.bin')
  })
  bench('adm-zip', () => {
    const a = new AdmZip(largeArchive)
    a.getEntries()[0].getData()
  })
})
