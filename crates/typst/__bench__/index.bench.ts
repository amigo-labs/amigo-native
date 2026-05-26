import { bench, describe } from 'vitest'
import { compile } from '../index.js'

// WASM is built as build output, not committed. On a fresh checkout
// run `pnpm build:wasm` before `pnpm bench` to include the WASM
// comparator; otherwise the bench skips those entries with a warning.
let wasmCompile: typeof compile | null = null
try {
  // @ts-expect-error — generated artifact path; not in source tree
  const mod = await import('../wasm/pkg/amigo_typst_wasm.js')
  wasmCompile = mod.compile
} catch {
  console.warn('[bench] WASM artifact missing — run `pnpm build:wasm` to include WASM comparator')
}
const SMALL = 'Hello World'
const MEDIUM = `
= Report

#for i in range(10) [
  == Section #i

  Some filler text for section #i.
]
`
const INVOICE = `
#set page(paper: "a4", margin: 2cm)
= Invoice

#table(
  columns: (1fr, auto, auto),
  [*Item*], [*Qty*], [*Amount*],
  ..for i in range(20) { ([Item #i], [1], [$1.00]) },
)
`

describe('trivial source', () => {
  bench('@amigo-labs/typst (napi) compile', () => {
    compile(SMALL)
  })
  if (wasmCompile) bench('@amigo-labs/typst (wasm) compile', () => { wasmCompile!(SMALL) })
})

describe('multi-section report (10 sections)', () => {
  bench('@amigo-labs/typst (napi) compile', () => {
    compile(MEDIUM)
  })
  if (wasmCompile) bench('@amigo-labs/typst (wasm) compile', () => { wasmCompile!(MEDIUM) })
})

describe('invoice with 20-row table', () => {
  bench('@amigo-labs/typst (napi) compile', () => {
    compile(INVOICE)
  })
  if (wasmCompile) bench('@amigo-labs/typst (wasm) compile', () => { wasmCompile!(INVOICE) })
})
