import { bench, describe } from 'vitest'
import { simulate } from '../index.js'
// WASM is built as build output, not committed. On a fresh checkout
// run `pnpm build:wasm` before `pnpm bench` to include the WASM
// comparator; otherwise the bench skips those entries with a warning.
let wasmSimulate: typeof simulate | null = null
try {
  // @ts-expect-error — generated artifact path; not in source tree
  const mod = await import('../wasm/pkg/amigo_force_layout_wasm.js')
  wasmSimulate = mod.simulate
} catch {
  console.warn('[bench] WASM artifact missing — run `pnpm build:wasm` to include WASM comparator')
}
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
  bench('@amigo-labs/force-layout (napi)', () => {
    simulate(SMALL.nodes, SMALL.edges)
  })
  if (wasmSimulate) bench('@amigo-labs/force-layout (wasm)', () => { wasmSimulate!(SMALL.nodes, SMALL.edges) })
  bench('d3-force', () => {
    runD3(SMALL)
  })
})

describe('medium (100 nodes)', () => {
  bench('@amigo-labs/force-layout (napi)', () => {
    simulate(MEDIUM.nodes, MEDIUM.edges)
  })
  if (wasmSimulate) bench('@amigo-labs/force-layout (wasm)', () => { wasmSimulate!(MEDIUM.nodes, MEDIUM.edges) })
  bench('d3-force', () => {
    runD3(MEDIUM)
  })
})
