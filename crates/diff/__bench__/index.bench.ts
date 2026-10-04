import { test } from 'vitest'
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

test('diff — diffLines 1 KB', async ({ bench }) => {
  await bench('@amigo-labs/diff (napi)', () => {
    diffLines(A_SMALL, B_SMALL)
  }).run()
  if (wasmDiffLines) await bench('@amigo-labs/diff (wasm)', () => { wasmDiffLines!(A_SMALL, B_SMALL) }).run()
  await bench('diff', () => {
    jsdiff.diffLines(A_SMALL, B_SMALL)
  }).run()
})

test('diff — diffLines 20 KB', async ({ bench }) => {
  await bench('@amigo-labs/diff (napi)', () => {
    diffLines(A_MED, B_MED)
  }).run()
  if (wasmDiffLines) await bench('@amigo-labs/diff (wasm)', () => { wasmDiffLines!(A_MED, B_MED) }).run()
  await bench('diff', () => {
    jsdiff.diffLines(A_MED, B_MED)
  }).run()
})

test('diff — diffLines 200 KB', async ({ bench }) => {
  await bench('@amigo-labs/diff (napi)', () => {
    diffLines(A_LARGE, B_LARGE)
  }).run()
  if (wasmDiffLines) await bench('@amigo-labs/diff (wasm)', () => { wasmDiffLines!(A_LARGE, B_LARGE) }).run()
  await bench('diff', () => {
    jsdiff.diffLines(A_LARGE, B_LARGE)
  }).run()
})

test('diff — diffLinesToOffsets 20 KB (packed hot-path)', async ({ bench }) => {
  await bench('@amigo-labs/diff (napi) (offsets)', () => {
    diffLinesToOffsets(A_MED, B_MED)
  }).run()
  if (wasmDiffLinesToOffsets) await bench('@amigo-labs/diff (wasm) (offsets)', () => { wasmDiffLinesToOffsets!(A_MED, B_MED) }).run()
  await bench('@amigo-labs/diff (napi) (hunks)', () => {
    diffLines(A_MED, B_MED)
  }).run()
  if (wasmDiffLines) await bench('@amigo-labs/diff (wasm) (hunks)', () => { wasmDiffLines!(A_MED, B_MED) }).run()
})

test('diff — createPatch 20 KB', async ({ bench }) => {
  await bench('@amigo-labs/diff (napi)', () => {
    createPatch('f.txt', A_MED, B_MED)
  }).run()
  if (wasmCreatePatch) await bench('@amigo-labs/diff (wasm)', () => { wasmCreatePatch!('f.txt', A_MED, B_MED) }).run()
  await bench('diff.createPatch', () => {
    jsdiff.createPatch('f.txt', A_MED, B_MED)
  }).run()
})

test('diff — diffChars 5 KB', async ({ bench }) => {
  const a = 'x'.repeat(5000)
  const b = a.slice(0, 2500) + 'Y' + a.slice(2500)
  await bench('@amigo-labs/diff (napi)', () => {
    diffChars(a, b)
  }).run()
  if (wasmDiffChars) await bench('@amigo-labs/diff (wasm)', () => { wasmDiffChars!(a, b) }).run()
  await bench('diff', () => {
    jsdiff.diffChars(a, b)
  }).run()
})
