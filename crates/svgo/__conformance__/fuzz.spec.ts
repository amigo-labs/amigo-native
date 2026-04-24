import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { optimize } from '../index.js'

// Generate well-formed SVG trees via a small grammar. Goal is to
// exercise the pipeline without producing pathological XML.

const attrValue = fc.oneof(
  fc.integer({ min: 0, max: 999 }).map(String),
  fc.float({ min: 0, max: 999, noNaN: true }).map((n) => n.toFixed(3)),
  fc.constantFrom('red', 'blue', 'green', 'black', 'white'),
  fc.constantFrom('#fff', '#000', '#abc'),
)

const attr = fc.record({
  k: fc.constantFrom('width', 'height', 'x', 'y', 'fill', 'stroke'),
  v: attrValue,
})

const leaf = fc.record({
  name: fc.constantFrom('rect', 'circle', 'path', 'line'),
  attrs: fc.array(attr, { maxLength: 4 }),
})

function renderLeaf({ name, attrs }: { name: string; attrs: Array<{ k: string; v: string }> }) {
  const parts = attrs.map((a) => `${a.k}="${a.v}"`).join(' ')
  return parts ? `<${name} ${parts}/>` : `<${name}/>`
}

describe('fuzz invariants', () => {
  it('never panics on random well-formed svg trees', () => {
    fc.assert(
      fc.property(fc.array(leaf, { minLength: 0, maxLength: 20 }), (leaves) => {
        const svg = `<svg>${leaves.map(renderLeaf).join('')}</svg>`
        const result = optimize(svg)
        expect(typeof result.data).toBe('string')
        expect(result.outputBytes).toBeGreaterThanOrEqual(0)
      }),
      { numRuns: 200 },
    )
  })

  it('output grows by at most a small, bounded factor', () => {
    // convertColors normalises `red` → `#f00` which is 1 byte longer —
    // that's a canonicalisation, not a regression. Overall output is
    // dominated by shrink-pass savings, so we assert a loose bound.
    fc.assert(
      fc.property(fc.array(leaf, { minLength: 1, maxLength: 10 }), (leaves) => {
        const svg = `<svg>${leaves.map(renderLeaf).join('')}</svg>`
        const result = optimize(svg)
        expect(result.outputBytes).toBeLessThanOrEqual(result.inputBytes + 32)
      }),
      { numRuns: 200 },
    )
  })

  it('contains <svg tag after optimize', () => {
    fc.assert(
      fc.property(fc.array(leaf, { minLength: 0, maxLength: 10 }), (leaves) => {
        const svg = `<svg>${leaves.map(renderLeaf).join('')}</svg>`
        const out = optimize(svg).data
        expect(out).toMatch(/<svg/)
      }),
      { numRuns: 100 },
    )
  })
})
