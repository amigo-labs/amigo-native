import { describe, it, expect } from 'vitest'
import { pixelmatch as amigoPixelmatch } from '../index.js'
import upstreamPixelmatch from 'pixelmatch'

/**
 * Upstream conformance for `@amigo-labs/pixelmatch` against
 * mapbox/pixelmatch (the npm package). The upstream test suite ships
 * 4K PNG fixtures we can't easily clone here; we instead synthesise
 * a corpus of representative cases covering each algorithmic branch:
 *
 *   - identical inputs                 → 0 diff
 *   - all-different inputs             → every pixel diffed
 *   - small RGB deltas at threshold    → threshold boundary
 *   - alpha-blended pixels             → blend() path
 *   - thin-line-on-flat-background     → AA-detection path
 *   - includeAA toggle                 → AA path on/off
 *   - diffMask + diffColorAlt options  → output-formatter branches
 *
 * For every case we assert that `numDiff` matches the upstream package
 * exactly. The output buffer is also compared verbatim — see the
 * `output buffer parity` block — but only for cases where both
 * implementations are documented to produce bit-identical output.
 */

function fillRgba(w: number, h: number, fn: (x: number, y: number) => [number, number, number, number]): Buffer {
  const buf = Buffer.alloc(w * h * 4)
  let i = 0
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, b, a] = fn(x, y)
      buf[i++] = r
      buf[i++] = g
      buf[i++] = b
      buf[i++] = a
    }
  }
  return buf
}

function flat(color: [number, number, number, number], w: number, h: number): Buffer {
  return fillRgba(w, h, () => color)
}

interface Fixture {
  name: string
  w: number
  h: number
  a: Buffer
  b: Buffer
  opts?: Record<string, unknown>
}

const FIXTURES: Fixture[] = [
  {
    name: 'identical-flat-red',
    w: 16,
    h: 16,
    a: flat([255, 0, 0, 255], 16, 16),
    b: flat([255, 0, 0, 255], 16, 16),
  },
  {
    name: 'all-different-black-vs-white',
    w: 16,
    h: 16,
    a: flat([0, 0, 0, 255], 16, 16),
    b: flat([255, 255, 255, 255], 16, 16),
  },
  {
    name: 'small-RGB-delta-default-threshold',
    w: 8,
    h: 8,
    a: flat([100, 100, 100, 255], 8, 8),
    b: flat([102, 100, 100, 255], 8, 8), // sub-threshold delta
  },
  {
    name: 'small-RGB-delta-strict-threshold',
    w: 8,
    h: 8,
    a: flat([100, 100, 100, 255], 8, 8),
    b: flat([102, 100, 100, 255], 8, 8),
    opts: { threshold: 0 },
  },
  {
    name: 'partial-alpha',
    w: 4,
    h: 4,
    a: flat([200, 100, 50, 128], 4, 4),
    b: flat([200, 100, 50, 255], 4, 4),
  },
  {
    name: 'thin-vertical-line-on-white-includeAA-false',
    w: 16,
    h: 16,
    a: flat([255, 255, 255, 255], 16, 16),
    b: fillRgba(16, 16, (x) => (x === 8 ? [0, 0, 0, 255] : [255, 255, 255, 255])),
    opts: { includeAA: false },
  },
  {
    name: 'thin-vertical-line-on-white-includeAA-true',
    w: 16,
    h: 16,
    a: flat([255, 255, 255, 255], 16, 16),
    b: fillRgba(16, 16, (x) => (x === 8 ? [0, 0, 0, 255] : [255, 255, 255, 255])),
    opts: { includeAA: true },
  },
  {
    name: 'gradient-vs-shifted-gradient',
    w: 32,
    h: 8,
    a: fillRgba(32, 8, (x, y) => [(x * 8) & 0xff, (y * 32) & 0xff, 128, 255]),
    b: fillRgba(32, 8, (x, y) => [(x * 8 + 4) & 0xff, (y * 32) & 0xff, 128, 255]),
  },
  {
    name: 'diff-mask-mode',
    w: 8,
    h: 8,
    a: flat([0, 0, 0, 255], 8, 8),
    b: fillRgba(8, 8, (x, y) => ((x + y) % 2 === 0 ? [0, 0, 0, 255] : [255, 255, 255, 255])),
    opts: { diffMask: true },
  },
  {
    name: 'diff-color-alt-set',
    w: 8,
    h: 8,
    a: flat([200, 200, 200, 255], 8, 8),
    b: fillRgba(8, 8, (x) => (x < 4 ? [50, 50, 50, 255] : [255, 255, 255, 255])),
    opts: { diffColorAlt: [0, 0, 255] },
  },
]

describe('pixelmatch — corpus parity vs upstream `pixelmatch` (numDiff)', () => {
  for (const f of FIXTURES) {
    it(`${f.name}: numDiff matches`, () => {
      const upOut = Buffer.alloc(f.a.length)
      const upDiff = upstreamPixelmatch(f.a, f.b, upOut, f.w, f.h, f.opts ?? {})
      const ours = amigoPixelmatch(f.a, f.b, f.w, f.h, f.opts ?? {})
      expect(ours.numDiff).toBe(upDiff)
    })
  }
})

describe('pixelmatch — output buffer byte parity (no-AA branches only)', () => {
  // Cases below pass through the same draw_pixel / draw_gray branches
  // in both implementations and should be bit-identical.
  const noAaFixtures = FIXTURES.filter(
    (f) => !f.name.includes('thin-vertical-line') && !f.name.includes('partial-alpha'),
  )
  for (const f of noAaFixtures) {
    it(`${f.name}: diff buffer matches byte-for-byte`, () => {
      const upOut = Buffer.alloc(f.a.length)
      upstreamPixelmatch(f.a, f.b, upOut, f.w, f.h, f.opts ?? {})
      const ours = amigoPixelmatch(f.a, f.b, f.w, f.h, f.opts ?? {})
      expect(ours.diff.equals(upOut)).toBe(true)
    })
  }
})
