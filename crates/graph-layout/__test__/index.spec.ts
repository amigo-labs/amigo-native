import { describe, expect, it } from 'vitest'
import { layout, layoutMany } from '../index.js'

function spec(nodes: Array<[string, number?, number?]>, edges: Array<[string, string]>) {
  return {
    nodes: nodes.map(([id, w = 50, h = 30]) => ({ id, width: w, height: h })),
    edges: edges.map(([source, target]) => ({ source, target })),
  }
}

describe('layout', () => {
  it('single node returns that node', () => {
    const r = layout(spec([['a']], []))
    expect(r.nodes).toHaveLength(1)
    expect(r.nodes[0].id).toBe('a')
    expect(r.width).toBeGreaterThan(0)
    expect(r.height).toBeGreaterThan(0)
  })

  it('chain a → b → c assigns increasing y', () => {
    const r = layout(spec([['a'], ['b'], ['c']], [['a', 'b'], ['b', 'c']]))
    const y = Object.fromEntries(r.nodes.map((n) => [n.id, n.y]))
    expect(y.a).toBeLessThan(y.b)
    expect(y.b).toBeLessThan(y.c)
  })

  it('fork: siblings share y', () => {
    const r = layout(
      spec([['root'], ['a'], ['b']], [['root', 'a'], ['root', 'b']]),
    )
    const y = Object.fromEntries(r.nodes.map((n) => [n.id, n.y]))
    expect(y.a).toBeCloseTo(y.b)
  })

  it('LR rankdir swaps axes', () => {
    const r = layout({
      nodes: [
        { id: 'a', width: 50, height: 30 },
        { id: 'b', width: 50, height: 30 },
      ],
      edges: [{ source: 'a', target: 'b' }],
      options: { rankdir: 'LR' },
    })
    const a = r.nodes.find((n) => n.id === 'a')!
    const b = r.nodes.find((n) => n.id === 'b')!
    expect(b.x).toBeGreaterThan(a.x)
    expect(Math.abs(a.y - b.y)).toBeLessThan(1e-6)
  })

  it('edges carry two points', () => {
    const r = layout(spec([['a'], ['b']], [['a', 'b']]))
    expect(r.edges).toHaveLength(1)
    expect(r.edges[0].points).toHaveLength(2)
  })

  it('cycle does not panic', () => {
    const r = layout(spec([['a'], ['b']], [['a', 'b'], ['b', 'a']]))
    expect(r.nodes).toHaveLength(2)
  })

  it('empty graph returns 0×0', () => {
    const r = layout({ nodes: [], edges: [] })
    expect(r.nodes).toHaveLength(0)
    expect(r.width).toBe(0)
  })

  it('honours nodesep option', () => {
    const tight = layout({
      ...spec([['a'], ['b']], []),
      options: { nodesep: 10 },
    })
    const loose = layout({
      ...spec([['a'], ['b']], []),
      options: { nodesep: 200 },
    })
    expect(loose.width).toBeGreaterThan(tight.width)
  })

  it('honours ranksep option', () => {
    const tight = layout({
      ...spec([['a'], ['b']], [['a', 'b']]),
      options: { ranksep: 10 },
    })
    const loose = layout({
      ...spec([['a'], ['b']], [['a', 'b']]),
      options: { ranksep: 200 },
    })
    expect(loose.height).toBeGreaterThan(tight.height)
  })

  it('pinned rank honored', () => {
    const r = layout({
      nodes: [
        { id: 'a', width: 10, height: 10 },
        { id: 'b', width: 10, height: 10, rank: 5 },
      ],
      edges: [],
    })
    const a = r.nodes.find((n) => n.id === 'a')!
    const b = r.nodes.find((n) => n.id === 'b')!
    expect(b.y).toBeGreaterThan(a.y)
  })
})

describe('layoutMany', () => {
  it('runs N independent layouts', () => {
    const out = layoutMany([
      spec([['a']], []),
      spec([['x'], ['y']], [['x', 'y']]),
    ])
    expect(out).toHaveLength(2)
    expect(out[0].nodes).toHaveLength(1)
    expect(out[1].nodes).toHaveLength(2)
  })
})
