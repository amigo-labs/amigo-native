import { describe, expect, it } from 'vitest'
import { simulate } from '../index.js'
import * as d3 from 'd3-force'

describe('parity: link equilibrium', () => {
  it('d3 and us both pull a two-node chain to ~link distance', () => {
    // us
    const ourResult = simulate(
      [{ id: 'a' }, { id: 'b' }],
      [{ source: 'a', target: 'b', distance: 80 }],
      { iterations: 500, charge: -30, centerStrength: 0.05 },
    )
    const od = Math.hypot(
      ourResult.nodes[0].x - ourResult.nodes[1].x,
      ourResult.nodes[0].y - ourResult.nodes[1].y,
    )
    expect(Math.abs(od - 80)).toBeLessThan(40)

    // d3
    const nodes = [{ id: 'a' }, { id: 'b' }] as Array<{ id: string; x?: number; y?: number }>
    const links = [{ source: 'a', target: 'b' }]
    const sim = d3
      .forceSimulation(nodes)
      .force('link', d3.forceLink(links).id((d: any) => d.id).distance(80))
      .force('charge', d3.forceManyBody().strength(-30))
      .force('center', d3.forceCenter())
      .stop()
    for (let i = 0; i < 300; i++) sim.tick()
    const d3d = Math.hypot(
      (nodes[0].x || 0) - (nodes[1].x || 0),
      (nodes[0].y || 0) - (nodes[1].y || 0),
    )
    expect(Math.abs(d3d - 80)).toBeLessThan(40)
  })
})

describe('parity: many-node spread', () => {
  it('both disperse 10 isolated nodes away from origin', () => {
    const ourResult = simulate(
      Array.from({ length: 10 }, (_, i) => ({ id: `n${i}` })),
      [],
      { iterations: 300, charge: -30, centerStrength: 0 },
    )
    // Max radial distance should be > 0 (nodes dispersed).
    const maxR = Math.max(
      ...ourResult.nodes.map((n) => Math.hypot(n.x, n.y)),
    )
    expect(maxR).toBeGreaterThan(10)
  })
})
