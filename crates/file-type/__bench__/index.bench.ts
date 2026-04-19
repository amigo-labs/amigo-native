import { bench, describe } from 'vitest'
import { fileTypeFromBufferSync as amigoSync, fileTypeFromBuffer as amigoAsync } from '../index.js'
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

describe('file-type — small header (12 bytes PNG)', () => {
  bench('@amigo-labs/file-type (sync)', () => {
    amigoSync(pngHeader)
  })

  bench('file-type (upstream async)', async () => {
    await upstream(new Uint8Array(pngHeader))
  })
})

describe('file-type — medium JPEG buffer (100KB)', () => {
  bench('@amigo-labs/file-type (sync)', () => {
    amigoSync(jpegMedium)
  })

  bench('file-type (upstream async)', async () => {
    await upstream(new Uint8Array(jpegMedium))
  })
})

describe('file-type — large MP4 buffer (10MB)', () => {
  bench('@amigo-labs/file-type (sync)', () => {
    amigoSync(mp4Large)
  })

  bench('@amigo-labs/file-type (async)', async () => {
    await amigoAsync(mp4Large)
  })

  bench('file-type (upstream async)', async () => {
    await upstream(new Uint8Array(mp4Large))
  })
})
