import { test } from 'vitest'
import { fileTypeFromBufferSync as amigoSync, fileTypeFromBuffer as amigoAsync } from '../index.js'
// WASM is built as build output, not committed. On a fresh checkout
// run `pnpm build:wasm` before `pnpm bench` to include the WASM
// comparator; otherwise the bench skips those entries with a warning.
// Only the sync variant ships in WASM — the async `fileTypeFromBuffer`
// has no WASM counterpart (no thread pool in the browser), so there is
// no `(wasm) (async)` comparator to bench.
let wasmAmigoSync: typeof amigoSync | null = null
try {
  // @ts-expect-error — generated artifact path; not in source tree
  const mod = await import('../wasm/pkg/amigo_file_type_wasm.js')
  wasmAmigoSync = mod.fileTypeFromBufferSync
} catch {
  console.warn('[bench] WASM artifact missing — run `pnpm build:wasm` to include WASM comparator')
}
import { fileTypeFromBuffer as upstream } from 'file-type'

const pngHeader = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
])

const jpegMedium = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]),
  Buffer.alloc(100 * 1024 - 8, 0xaa),
])

const mp4Large = Buffer.concat([
  Buffer.from([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32]),
  Buffer.alloc(10 * 1024 * 1024 - 12, 0x00),
])

test('file-type — small header (12 bytes PNG)', async ({ bench }) => {
  await bench('@amigo-labs/file-type (napi) (sync)', () => {
    amigoSync(pngHeader)
  }).run()

  if (wasmAmigoSync) await bench('@amigo-labs/file-type (wasm) (sync)', () => { wasmAmigoSync!(pngHeader) }).run()
  await bench('file-type (upstream async)', async () => {
    await upstream(new Uint8Array(pngHeader))
  }).run()
})

test('file-type — medium JPEG buffer (100KB)', async ({ bench }) => {
  await bench('@amigo-labs/file-type (napi) (sync)', () => {
    amigoSync(jpegMedium)
  }).run()

  if (wasmAmigoSync) await bench('@amigo-labs/file-type (wasm) (sync)', () => { wasmAmigoSync!(jpegMedium) }).run()
  await bench('file-type (upstream async)', async () => {
    await upstream(new Uint8Array(jpegMedium))
  }).run()
})

test('file-type — large MP4 buffer (10MB)', async ({ bench }) => {
  await bench('@amigo-labs/file-type (napi) (sync)', () => {
    amigoSync(mp4Large)
  }).run()

  if (wasmAmigoSync) await bench('@amigo-labs/file-type (wasm) (sync)', () => { wasmAmigoSync!(mp4Large) }).run()
  await bench('@amigo-labs/file-type (napi) (async)', async () => {
    await amigoAsync(mp4Large)
  }).run()

  await bench('file-type (upstream async)', async () => {
    await upstream(new Uint8Array(mp4Large))
  }).run()
})
