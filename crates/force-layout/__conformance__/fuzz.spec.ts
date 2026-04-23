import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { simulate } from '../index.js'

describe('fuzz invariants', () => {
  it('never panics on random node counts', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 30 }), (n) => {
        const nodes = Array.from({ length: n }, (_, i) => ({ id: `n${i}` }))
        const r = simulate(nodes, [], { iterations: 50 })
        expect(r.nodes).toHaveLength(n)
      }),
      { numRuns: 30 },
    )
  })

  it('positions stay finite', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 20 }), (n) => {
        const nodes = Array.from({ length: n }, (_, i) => ({ id: `n${i}` }))
        const edges: Array<{ source: string; target: string }> = []
        for (let i = 0; i + 1 < n; i++) {
          edges.push({ source: `n${i}`, target: `n${i + 1}` })
        }
        const r = simulate(nodes, edges, { iterations: 100 })
        for (const p of r.nodes) {
          expect(Number.isFinite(p.x)).toBe(true)
          expect(Number.isFinite(p.y)).toBe(true)
        }
      }),
      { numRuns: 30 },
    )
  })
})
