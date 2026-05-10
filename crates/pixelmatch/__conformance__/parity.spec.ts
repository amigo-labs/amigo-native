import { describe, it, expect } from 'vitest'
import { pixelmatch as amigoPixelmatch, countDiff } from '../index.js'
import upstreamPixelmatch from 'pixelmatch'

// Cross-verify against the upstream `pixelmatch` npm package on a handful
// of fixtures the algorithm has obvious behaviour on. The `output` buffer
// byte-for-byte parity is the strict contract, since downstream snapshot
// runners (jest-image-snapshot, Playwright, BackstopJS) all read the diff
// pixels back and write them to disk for the human to inspect.

const px = (r: number, g: number, b: number, a = 255) => [r, g, b, a]

function rgba(rows: number[][][]): Buffer {
  return Buffer.from(rows.flat(2))
}

describe('pixelmatch — handcrafted invariants', () => {
  it('identical buffers → 0 diff regardless of size', () => {
    for (const [w, h] of [
      [1, 1],
      [2, 2],
      [4, 8],
      [16, 16],
    ]) {
      const buf = Buffer.alloc(w * h * 4)
      for (let i = 0; i < buf.length; i += 4) {
        buf[i] = (i * 7) & 0xff
        buf[i + 1] = (i * 11) & 0xff
        buf[i + 2] = (i * 13) & 0xff
        buf[i + 3] = 255
      }
      const { numDiff } = amigoPixelmatch(buf, Buffer.from(buf), w, h)
      expect(numDiff).toBe(0)
    }
  })

  it('completely different buffers → every pixel counted', () => {
    const a = Buffer.alloc(16, 0)
    for (let i = 3; i < a.length; i += 4) a[i] = 255
    const b = Buffer.alloc(16, 0xff)
    const { numDiff } = amigoPixelmatch(a, b, 2, 2)
    expect(numDiff).toBe(4)
  })

  it('countDiff and pixelmatch agree on numDiff for the same input', () => {
    const a = rgba([
      [px(0, 0, 0), px(255, 0, 0)],
      [px(0, 255, 0), px(0, 0, 255)],
    ])
    const b = rgba([
      [px(0, 0, 0), px(0, 0, 0)],
      [px(0, 255, 0), px(0, 0, 255)],
    ])
    const { numDiff } = amigoPixelmatch(a, b, 2, 2)
    expect(countDiff(a, b, 2, 2)).toBe(numDiff)
  })

  it('threshold=0 with sub-threshold delta still flags', () => {
    const a = rgba([[px(100, 100, 100), px(100, 100, 100)]])
    const b = rgba([[px(101, 100, 100), px(100, 100, 100)]])
    const { numDiff } = amigoPixelmatch(a, b, 2, 1, { threshold: 0 })
    expect(numDiff).toBe(1)
  })

  it('rejects mismatched buffer dimensions', () => {
    expect(() => amigoPixelmatch(Buffer.alloc(16), Buffer.alloc(8), 2, 2)).toThrow()
    expect(() => amigoPixelmatch(Buffer.alloc(16), Buffer.alloc(16), 3, 2)).toThrow()
  })

  it('diff buffer length equals the input length', () => {
    const w = 4, h = 3
    const buf = Buffer.alloc(w * h * 4, 0)
    for (let i = 3; i < buf.length; i += 4) buf[i] = 255
    const { diff } = amigoPixelmatch(buf, buf, w, h)
    expect(diff.length).toBe(buf.length)
  })

  it('diffMask: identical inputs produce all-zero diff', () => {
    const buf = Buffer.alloc(16, 0)
    for (let i = 3; i < buf.length; i += 4) buf[i] = 255
    const { diff } = amigoPixelmatch(buf, buf, 2, 2, { diffMask: true })
    for (let i = 0; i < diff.length; i++) expect(diff[i]).toBe(0)
  })
})

// numDiff parity vs upstream `pixelmatch` on non-trivial inputs.

function withAlpha(rgb: Buffer): Buffer {
  const out = Buffer.alloc((rgb.length / 3) * 4)
  for (let i = 0, j = 0; i < rgb.length; i += 3, j += 4) {
    out[j] = rgb[i]
    out[j + 1] = rgb[i + 1]
    out[j + 2] = rgb[i + 2]
    out[j + 3] = 255
  }
  return out
}

const cases: Array<{ name: string; w: number; h: number; a: Buffer; b: Buffer; opts?: Record<string, unknown> }> = [
  {
    name: 'identical-noisy',
    w: 16,
    h: 16,
    a: withAlpha(Buffer.alloc(16 * 16 * 3, 0x42)),
    b: withAlpha(Buffer.alloc(16 * 16 * 3, 0x42)),
  },
  {
    name: 'all-different',
    w: 8,
    h: 8,
    a: withAlpha(Buffer.alloc(8 * 8 * 3, 0)),
    b: withAlpha(Buffer.alloc(8 * 8 * 3, 0xff)),
  },
  {
    name: 'sparse-diff-default-threshold',
    w: 32,
    h: 32,
    a: (() => {
      const buf = Buffer.alloc(32 * 32 * 4)
      for (let i = 3; i < buf.length; i += 4) buf[i] = 255
      return buf
    })(),
    b: (() => {
      const buf = Buffer.alloc(32 * 32 * 4)
      for (let i = 3; i < buf.length; i += 4) buf[i] = 255
      buf[0] = 255
      buf[(15 * 32 + 7) * 4 + 1] = 255
      buf[(31 * 32 + 31) * 4 + 2] = 255
      return buf
    })(),
  },
]

describe('pixelmatch — numDiff parity vs upstream `pixelmatch`', () => {
  for (const c of cases) {
    it(`${c.name}: numDiff matches upstream`, () => {
      const upOut = Buffer.alloc(c.a.length)
      const upDiff = upstreamPixelmatch(c.a, c.b, upOut, c.w, c.h, c.opts ?? {})
      const { numDiff } = amigoPixelmatch(c.a, c.b, c.w, c.h, c.opts ?? {})
      expect(numDiff).toBe(upDiff)
    })
  }
})
