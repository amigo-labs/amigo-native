import { bench, describe } from 'vitest'
import { diffLines, diffChars, diffLinesToOffsets, createPatch } from '../index.js'
// WASM is built as build output, not committed. On a fresh checkout
// run `pnpm build:wasm` before `pnpm bench` to include the WASM
// comparator; otherwise the bench skips those entries with a warning.
let wasmDiffLines: typeof diffLines | null = null
let wasmDiffChars: typeof diffChars | null = null
let wasmDiffLinesToOffsets: typeof diffLinesToOffsets | null = null
let wasmCreatePatch: typeof createPatch | null = null
try {
  // @ts-expect-error — generated artifact path; not in source tree
  const mod = await import('../wasm/pkg/amigo_diff_wasm.js')
  wasmDiffLines = mod.diffLines
  wasmDiffChars = mod.diffChars
  wasmDiffLinesToOffsets = mod.diffLinesToOffsets
  wasmCreatePatch = mod.createPatch
} catch {
  console.warn('[bench] WASM artifact missing — run `pnpm build:wasm` to include WASM comparator')
}
import * as jsdiff from 'diff'

function makeDoc(lines: number, seed = 0): string {
  const out: string[] = []
  let s = seed
  for (let i = 0; i < lines; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff
    out.push(`line ${i} value ${s.toString(16)}`)
  }
  return out.join('\n') + '\n'
}

const A_SMALL = makeDoc(50, 1)
const B_SMALL = makeDoc(50, 2)
const A_MED = makeDoc(1000, 1)
const B_MED = makeDoc(1000, 2)
const A_LARGE = makeDoc(10000, 1)
const B_LARGE = makeDoc(10000, 2)

describe('diff — diffLines 1 KB', () => {
  bench('@amigo-labs/diff (napi)', () => {
    diffLines(A_SMALL, B_SMALL)
  })
  if (wasmDiffLines) bench('@amigo-labs/diff (wasm)', () => { wasmDiffLines!(A_SMALL, B_SMALL) })
  bench('diff', () => {
    jsdiff.diffLines(A_SMALL, B_SMALL)
  })
})

describe('diff — diffLines 20 KB', () => {
  bench('@amigo-labs/diff (napi)', () => {
    diffLines(A_MED, B_MED)
  })
  if (wasmDiffLines) bench('@amigo-labs/diff (wasm)', () => { wasmDiffLines!(A_MED, B_MED) })
  bench('diff', () => {
    jsdiff.diffLines(A_MED, B_MED)
  })
})

describe('diff — diffLines 200 KB', () => {
  bench('@amigo-labs/diff (napi)', () => {
    diffLines(A_LARGE, B_LARGE)
  })
  if (wasmDiffLines) bench('@amigo-labs/diff (wasm)', () => { wasmDiffLines!(A_LARGE, B_LARGE) })
  bench('diff', () => {
    jsdiff.diffLines(A_LARGE, B_LARGE)
  })
})

describe('diff — diffLinesToOffsets 20 KB (packed hot-path)', () => {
  bench('@amigo-labs/diff (napi) (offsets)', () => {
    diffLinesToOffsets(A_MED, B_MED)
  })
  if (wasmDiffLinesToOffsets) bench('@amigo-labs/diff (wasm) (offsets)', () => { wasmDiffLinesToOffsets!(A_MED, B_MED) })
  bench('@amigo-labs/diff (napi) (hunks)', () => {
    diffLines(A_MED, B_MED)
  })
  if (wasmDiffLines) bench('@amigo-labs/diff (wasm) (hunks)', () => { wasmDiffLines!(A_MED, B_MED) })
})

describe('diff — createPatch 20 KB', () => {
  bench('@amigo-labs/diff (napi)', () => {
    createPatch('f.txt', A_MED, B_MED)
  })
  if (wasmCreatePatch) bench('@amigo-labs/diff (wasm)', () => { wasmCreatePatch!('f.txt', A_MED, B_MED) })
  bench('diff.createPatch', () => {
    jsdiff.createPatch('f.txt', A_MED, B_MED)
  })
})

describe('diff — diffChars 5 KB', () => {
  const a = 'x'.repeat(5000)
  const b = a.slice(0, 2500) + 'Y' + a.slice(2500)
  bench('@amigo-labs/diff (napi)', () => {
    diffChars(a, b)
  })
  if (wasmDiffChars) bench('@amigo-labs/diff (wasm)', () => { wasmDiffChars!(a, b) })
  bench('diff', () => {
    jsdiff.diffChars(a, b)
  })
})
