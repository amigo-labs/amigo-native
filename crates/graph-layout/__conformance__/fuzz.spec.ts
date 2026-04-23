import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { layout } from '../index.js'

const nodeIdGen = fc.stringMatching(/^[a-z]{1,8}$/)

describe('fuzz invariants', () => {
  it('never panics on a random DAG spec', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(nodeIdGen, { maxLength: 20 }),
        (ids) => {
          if (ids.length === 0) return
          // Randomly create edges i → j where i < j (ensures DAG).
          const edges: Array<{ source: string; target: string }> = []
          for (let i = 0; i < ids.length; i++) {
            for (let j = i + 1; j < ids.length; j++) {
              if (Math.random() < 0.2) {
                edges.push({ source: ids[i], target: ids[j] })
              }
            }
          }
          const r = layout({
            nodes: ids.map((id) => ({ id, width: 50, height: 30 })),
            edges,
          })
          expect(r.nodes.length).toBe(ids.length)
          expect(r.width).toBeGreaterThan(0)
        },
      ),
      { numRuns: 50 },
    )
  })

  it('all node positions are finite', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(nodeIdGen, { minLength: 1, maxLength: 10 }),
        (ids) => {
          const r = layout({
            nodes: ids.map((id) => ({ id, width: 50, height: 30 })),
            edges: [],
          })
          for (const n of r.nodes) {
            expect(Number.isFinite(n.x)).toBe(true)
            expect(Number.isFinite(n.y)).toBe(true)
          }
        },
      ),
      { numRuns: 50 },
    )
  })
})
