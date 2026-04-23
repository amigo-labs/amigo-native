import { describe, expect, it } from 'vitest'
import { layout as ours } from '../index.js'
import * as dagre from '@dagrejs/dagre'

function upstream(nodes: string[], edges: Array<[string, string]>) {
  const g = new dagre.graphlib.Graph()
  g.setGraph({})
  g.setDefaultEdgeLabel(() => ({}))
  for (const id of nodes) g.setNode(id, { width: 50, height: 30 })
  for (const [a, b] of edges) g.setEdge(a, b)
  dagre.layout(g)
  const nodePositions = nodes.map((id) => ({
    id,
    ...g.node(id),
  }))
  return { nodes: nodePositions, graph: g.graph() }
}

describe('parity: rank ordering matches on a chain', () => {
  it('a → b → c: y_a < y_b < y_c for both', () => {
    const nodes = ['a', 'b', 'c']
    const edges: Array<[string, string]> = [
      ['a', 'b'],
      ['b', 'c'],
    ]
    const o = ours({
      nodes: nodes.map((id) => ({ id, width: 50, height: 30 })),
      edges: edges.map(([s, t]) => ({ source: s, target: t })),
    })
    const u = upstream(nodes, edges)

    const oy = Object.fromEntries(o.nodes.map((n) => [n.id, n.y]))
    const uy = Object.fromEntries(u.nodes.map((n) => [n.id, n.y]))

    expect(oy.a).toBeLessThan(oy.b)
    expect(oy.b).toBeLessThan(oy.c)
    expect(uy.a).toBeLessThan(uy.b)
    expect(uy.b).toBeLessThan(uy.c)
  })
})

describe('parity: bounding box non-zero on non-empty graph', () => {
  it('our layout reports a positive width+height', () => {
    const o = ours({
      nodes: [
        { id: 'a', width: 50, height: 30 },
        { id: 'b', width: 50, height: 30 },
      ],
      edges: [{ source: 'a', target: 'b' }],
    })
    expect(o.width).toBeGreaterThan(0)
    expect(o.height).toBeGreaterThan(0)
  })
  it('upstream layout reports a positive width+height', () => {
    const u = upstream(['a', 'b'], [['a', 'b']])
    expect(u.graph.width).toBeGreaterThan(0)
    expect(u.graph.height).toBeGreaterThan(0)
  })
})
