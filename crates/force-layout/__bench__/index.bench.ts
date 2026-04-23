import { bench, describe } from 'vitest'
import { simulate } from '../index.js'
import * as d3 from 'd3-force'

function randomGraph(n: number, edgeDensity: number) {
  const nodes = Array.from({ length: n }, (_, i) => ({ id: `n${i}` }))
  const edges: Array<{ source: string; target: string }> = []
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (Math.random() < edgeDensity) {
        edges.push({ source: `n${i}`, target: `n${j}` })
      }
    }
  }
  return { nodes, edges }
}

const SMALL = randomGraph(20, 0.2)
const MEDIUM = randomGraph(100, 0.03)

function runD3(g: ReturnType<typeof randomGraph>) {
  const nodes = g.nodes.map((n) => ({ ...n }))
  const links = g.edges.map((e) => ({ ...e }))
  const sim = d3
    .forceSimulation(nodes)
    .force('link', d3.forceLink(links).id((d: any) => d.id))
    .force('charge', d3.forceManyBody())
    .force('center', d3.forceCenter())
    .stop()
  for (let i = 0; i < 300; i++) sim.tick()
}

describe('small (20 nodes)', () => {
  bench('@amigo-labs/force-layout', () => {
    simulate(SMALL.nodes, SMALL.edges)
  })
  bench('d3-force', () => {
    runD3(SMALL)
  })
})

describe('medium (100 nodes)', () => {
  bench('@amigo-labs/force-layout', () => {
    simulate(MEDIUM.nodes, MEDIUM.edges)
  })
  bench('d3-force', () => {
    runD3(MEDIUM)
  })
})
