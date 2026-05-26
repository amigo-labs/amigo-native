import { bench, describe } from 'vitest'
import { layout as ours } from '../index.js'
// WASM is built as build output, not committed. On a fresh checkout
// run `pnpm build:wasm` before `pnpm bench` to include the WASM
// comparator; otherwise the bench skips those entries with a warning.
let wasmOurs: typeof ours | null = null
try {
  // @ts-expect-error — generated artifact path; not in source tree
  const mod = await import('../wasm/pkg/amigo_graph_layout_wasm.js')
  wasmOurs = mod.layout
} catch {
  console.warn('[bench] WASM artifact missing — run `pnpm build:wasm` to include WASM comparator')
}
import * as dagre from '@dagrejs/dagre'

function buildSpec(nodeCount: number, edgeCount: number) {
  const nodes = Array.from({ length: nodeCount }, (_, i) => ({
    id: `n${i}`,
    width: 50,
    height: 30,
  }))
  const edges: Array<{ source: string; target: string }> = []
  for (let k = 0; k < edgeCount; k++) {
    const i = Math.floor(Math.random() * (nodeCount - 1))
    const j = i + 1 + Math.floor(Math.random() * (nodeCount - i - 1))
    edges.push({ source: `n${i}`, target: `n${j}` })
  }
  return { nodes, edges }
}

function runDagre(spec: ReturnType<typeof buildSpec>) {
  const g = new dagre.graphlib.Graph()
  g.setGraph({})
  g.setDefaultEdgeLabel(() => ({}))
  for (const n of spec.nodes) g.setNode(n.id, { width: n.width, height: n.height })
  for (const e of spec.edges) g.setEdge(e.source, e.target)
  dagre.layout(g)
}

const SMALL = buildSpec(20, 25)
const MEDIUM = buildSpec(100, 140)

describe('small (20 nodes, 25 edges)', () => {
  bench('@amigo-labs/graph-layout (napi)', () => {
    ours(SMALL)
  })
  if (wasmOurs) bench('@amigo-labs/graph-layout (wasm)', () => { wasmOurs!(SMALL) })
  bench('@dagrejs/dagre', () => {
    runDagre(SMALL)
  })
})

describe('medium (100 nodes, 140 edges)', () => {
  bench('@amigo-labs/graph-layout (napi)', () => {
    ours(MEDIUM)
  })
  if (wasmOurs) bench('@amigo-labs/graph-layout (wasm)', () => { wasmOurs!(MEDIUM) })
  bench('@dagrejs/dagre', () => {
    runDagre(MEDIUM)
  })
})
