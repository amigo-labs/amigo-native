/**
 * Core parity smoke against file-type@19. The exhaustive magic-byte
 * matrix lives in `upstream.spec.ts`; this file is the contract gate
 * that every release must pass.
 */
import { describe, it, expect } from 'vitest'
import { fileTypeFromBufferSync as amigoSync } from '../index.js'
import { fileTypeFromBuffer as upstreamAsync } from 'file-type'

const FIXTURES: Array<{ name: string; bytes: number[] }> = [
  {
    name: 'PNG',
    bytes: [
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44,
      0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f,
      0x15, 0xc4, 0x89,
    ],
  },
  { name: 'JPEG', bytes: [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46] },
  { name: 'PDF', bytes: [0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e] },
  { name: 'GZIP', bytes: [0x1f, 0x8b, 0x08, 0x00, 0x00, 0x00, 0x00, 0x00] },
]

function mimeEquiv(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return !a && !b
  if (a === b) return true
  return a.replace('application/x-zip', 'application/zip') === b.replace('application/x-zip', 'application/zip')
}

describe('file-type — parity gate', () => {
  for (const fx of FIXTURES) {
    it(`agrees on ${fx.name}`, async () => {
      const buf = Buffer.from(fx.bytes)
      const ours = amigoSync(buf)
      const theirs = await upstreamAsync(new Uint8Array(buf))
      expect(!!ours).toBe(!!theirs)
      if (ours && theirs) expect(mimeEquiv(ours.mime, theirs.mime)).toBe(true)
    })
  }

  it('returns null on plain text (matches upstream)', async () => {
    const buf = Buffer.from('just some plain text')
    const ours = amigoSync(buf)
    const theirs = await upstreamAsync(new Uint8Array(buf))
    expect(!!ours).toBe(!!theirs)
  })
})
