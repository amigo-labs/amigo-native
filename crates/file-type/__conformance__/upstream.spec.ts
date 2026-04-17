/**
 * Parity tests against file-type@19.
 *
 * Methodology: for each well-known magic-byte signature, we assert that
 * @amigo-labs/file-type and file-type agree on either the mime type or
 * that both return a null-ish value. Ext names can differ (jpg/jpeg,
 * mp4/m4v, …) so we normalise on mime.
 */
import { describe, it, expect } from 'vitest'
import { fileTypeFromBufferSync as amigoSync } from '../index.js'
import { fileTypeFromBuffer as upstreamAsync } from 'file-type'

type Fixture = { name: string; bytes: number[] }

const FIXTURES: Fixture[] = [
  {
    // Minimal 1x1 PNG. Upstream file-type@19 reads the IHDR chunk via strtok3 and
    // rejects short buffers with End-Of-Stream, so we need the full header.
    name: 'PNG',
    bytes: [
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44,
      0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f,
      0x15, 0xc4, 0x89,
    ],
  },
  { name: 'JPEG', bytes: [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46] },
  { name: 'GIF87a', bytes: [0x47, 0x49, 0x46, 0x38, 0x37, 0x61] },
  { name: 'GIF89a', bytes: [0x47, 0x49, 0x46, 0x38, 0x39, 0x61] },
  { name: 'PDF', bytes: [0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e] },
  { name: 'ZIP', bytes: [0x50, 0x4b, 0x03, 0x04, 0x14, 0x00] },
  { name: 'GZIP', bytes: [0x1f, 0x8b, 0x08, 0x00, 0x00, 0x00, 0x00, 0x00] },
  {
    name: 'WEBP',
    bytes: [
      0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38,
      0x20,
    ],
  },
  { name: 'TEXT', bytes: Array.from(Buffer.from('just some plain text')) },
]

function mimeEquiv(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return !a && !b
  if (a === b) return true
  const normA = a.replace('application/x-zip', 'application/zip')
  const normB = b.replace('application/x-zip', 'application/zip')
  return normA === normB
}

describe('file-type — parity with upstream file-type@19', () => {
  for (const fx of FIXTURES) {
    it(`matches on ${fx.name}`, async () => {
      const buf = Buffer.from(fx.bytes)
      const ours = amigoSync(buf)
      const theirs = await upstreamAsync(new Uint8Array(buf))

      const oursDetected = !!ours
      const theirsDetected = !!theirs
      expect(oursDetected).toBe(theirsDetected)

      if (ours && theirs) {
        expect(mimeEquiv(ours.mime, theirs.mime)).toBe(true)
      }
    })
  }
})
