import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { layout } from '../index.js'

const nodeIdGen = fc.stringMatching(/^[a-z]{1,8}$/)

describe('fuzz invariants', () => {
  it('never panics on a random DAG spec', () => {
    fc.assert(
      fc.property(
        fc
          .uniqueArray(nodeIdGen, { minLength: 2, maxLength: 10 })
          .chain((ids) =>
            fc
              .array(fc.boolean(), {
                minLength: (ids.length * (ids.length - 1)) / 2,
                maxLength: (ids.length * (ids.length - 1)) / 2,
              })
              .map((mask) => {
                // Only forward edges i → j (i < j) keep the graph
                // acyclic. `mask` is seeded by fast-check so each
                // run is reproducible from its seed.
                const edges: Array<{ source: string; target: string }> = []
                let k = 0
                for (let i = 0; i < ids.length; i++) {
                  for (let j = i + 1; j < ids.length; j++) {
                    if (mask[k++]) {
                      edges.push({ source: ids[i], target: ids[j] })
                    }
                  }
                }
                return { ids, edges }
              }),
          ),
        ({ ids, edges }) => {
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
