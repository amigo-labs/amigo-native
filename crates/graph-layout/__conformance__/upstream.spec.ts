import { describe, expect, it } from 'vitest'
import { layout } from '../index.js'

describe('dagre README examples', () => {
  it('diamond graph: root on top, join at bottom', () => {
    const r = layout({
      nodes: [
        { id: 'a', width: 50, height: 30 },
        { id: 'b', width: 50, height: 30 },
        { id: 'c', width: 50, height: 30 },
        { id: 'd', width: 50, height: 30 },
      ],
      edges: [
        { source: 'a', target: 'b' },
        { source: 'a', target: 'c' },
        { source: 'b', target: 'd' },
        { source: 'c', target: 'd' },
      ],
    })
    const y = Object.fromEntries(r.nodes.map((n) => [n.id, n.y]))
    expect(y.a).toBeLessThan(y.b)
    expect(y.a).toBeLessThan(y.c)
    expect(y.b).toBeLessThan(y.d)
    expect(y.c).toBeLessThan(y.d)
  })

  it('minlen pushes target further down', () => {
    const r = layout({
      nodes: [
        { id: 'a', width: 50, height: 30 },
        { id: 'b', width: 50, height: 30 },
      ],
      edges: [{ source: 'a', target: 'b', minlen: 3 }],
    })
    const ya = r.nodes.find((n) => n.id === 'a')!.y
    const yb = r.nodes.find((n) => n.id === 'b')!.y
    // 3 ranks between them, so the y-delta should exceed the default ranksep.
    expect(yb - ya).toBeGreaterThan(100)
  })
})
