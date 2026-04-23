import { describe, expect, it } from 'vitest'
import { simulate } from '../index.js'

function nodes(n: number) {
  return Array.from({ length: n }, (_, i) => ({ id: `n${i}` }))
}

describe('simulate', () => {
  it('returns positions for each input node', () => {
    const r = simulate(nodes(10), [])
    expect(r.nodes).toHaveLength(10)
    for (const n of r.nodes) {
      expect(Number.isFinite(n.x)).toBe(true)
      expect(Number.isFinite(n.y)).toBe(true)
    }
  })

  it('fixed nodes keep their coordinates', () => {
    const ns = nodes(5)
    ns[0].x = 100
    ns[0].y = 200
    ns[0].fixed = true
    const r = simulate(ns, [])
    expect(r.nodes[0].x).toBe(100)
    expect(r.nodes[0].y).toBe(200)
  })

  it('linked pair converges to around link distance', () => {
    const r = simulate([{ id: 'a' }, { id: 'b' }], [{ source: 'a', target: 'b', distance: 50 }], {
      iterations: 500,
      charge: -1,
      centerStrength: 0,
    })
    const [a, b] = r.nodes
    const dist = Math.hypot(a.x - b.x, a.y - b.y)
    expect(Math.abs(dist - 50)).toBeLessThan(25)
  })

  it('custom iterations honored', () => {
    const r = simulate(nodes(3), [], { iterations: 1 })
    expect(r.nodes).toHaveLength(3)
  })

  it('empty graph returns empty nodes', () => {
    const r = simulate([], [])
    expect(r.nodes).toEqual([])
  })

  it('preserves ids in order', () => {
    const r = simulate(nodes(4), [])
    expect(r.nodes.map((n) => n.id)).toEqual(['n0', 'n1', 'n2', 'n3'])
  })

  it('collision prevents overlap', () => {
    const r = simulate([{ id: 'a' }, { id: 'b' }], [], {
      iterations: 500,
      charge: 0,
      collideRadius: 30,
      centerStrength: 0,
    })
    const [a, b] = r.nodes
    const dist = Math.hypot(a.x - b.x, a.y - b.y)
    expect(dist).toBeGreaterThan(40)
  })

  it('custom center moves nodes toward it', () => {
    const r = simulate(nodes(5), [], {
      iterations: 500,
      centerX: 1000,
      centerY: 1000,
      centerStrength: 0.5,
    })
    for (const n of r.nodes) {
      expect(n.x).toBeGreaterThan(100)
      expect(n.y).toBeGreaterThan(100)
    }
  })
})
