import { describe, expect, it } from 'vitest'
import { simulate } from '../index.js'

describe('d3-force README-style scenarios', () => {
  it('triangle reaches equilateral-ish equilibrium', () => {
    const r = simulate(
      [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      [
        { source: 'a', target: 'b', distance: 60 },
        { source: 'b', target: 'c', distance: 60 },
        { source: 'c', target: 'a', distance: 60 },
      ],
      { iterations: 500, charge: -10, centerStrength: 0.05 },
    )
    const [a, b, c] = r.nodes
    const ab = Math.hypot(a.x - b.x, a.y - b.y)
    const bc = Math.hypot(b.x - c.x, b.y - c.y)
    const ca = Math.hypot(c.x - a.x, c.y - a.y)
    for (const d of [ab, bc, ca]) {
      expect(Math.abs(d - 60)).toBeLessThan(30)
    }
  })

  it('star graph: centre node is central', () => {
    const nodes = [
      { id: 'c' },
      ...Array.from({ length: 5 }, (_, i) => ({ id: `s${i}` })),
    ]
    const edges = Array.from({ length: 5 }, (_, i) => ({
      source: 'c',
      target: `s${i}`,
      distance: 50,
    }))
    const r = simulate(nodes, edges, {
      iterations: 500,
      charge: -30,
      centerStrength: 0.1,
    })
    const centre = r.nodes.find((n) => n.id === 'c')!
    const meanX =
      r.nodes.filter((n) => n.id !== 'c').reduce((s, n) => s + n.x, 0) / 5
    const meanY =
      r.nodes.filter((n) => n.id !== 'c').reduce((s, n) => s + n.y, 0) / 5
    // Centre should be near the geometric mean of the leaves.
    expect(Math.abs(centre.x - meanX)).toBeLessThan(40)
    expect(Math.abs(centre.y - meanY)).toBeLessThan(40)
  })
})
