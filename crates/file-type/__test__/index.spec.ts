import { describe, it, expect } from 'vitest'
import { fileTypeFromBuffer, fileTypeFromBufferSync } from '../index.js'

const PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
])
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46])
const PDF = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e])
const ZIP = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00])
const TEXT = Buffer.from('hello world, plain text', 'utf-8')

describe('file-type', () => {
  describe('fileTypeFromBufferSync', () => {
    it('detects PNG', () => {
      expect(fileTypeFromBufferSync(PNG)).toEqual({ ext: 'png', mime: 'image/png' })
    })

    it('detects JPEG', () => {
      expect(fileTypeFromBufferSync(JPEG)).toEqual({ ext: 'jpg', mime: 'image/jpeg' })
    })

    it('detects PDF', () => {
      expect(fileTypeFromBufferSync(PDF)).toEqual({ ext: 'pdf', mime: 'application/pdf' })
    })

    it('detects ZIP', () => {
      expect(fileTypeFromBufferSync(ZIP)).toEqual({ ext: 'zip', mime: 'application/zip' })
    })

    it('returns null for plain text', () => {
      expect(fileTypeFromBufferSync(TEXT)).toBeNull()
    })

    it('returns null for empty buffer', () => {
      expect(fileTypeFromBufferSync(Buffer.alloc(0))).toBeNull()
    })
  })

  describe('fileTypeFromBuffer (async)', () => {
    it('resolves to PNG descriptor', async () => {
      await expect(fileTypeFromBuffer(PNG)).resolves.toEqual({
        ext: 'png',
        mime: 'image/png',
      })
    })

    it('resolves to null for plain text', async () => {
      await expect(fileTypeFromBuffer(TEXT)).resolves.toBeNull()
    })
  })
})
