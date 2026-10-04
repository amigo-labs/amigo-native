import { test } from 'vitest'
import { split, splitToOffsets } from '../index.js'
// WASM is built as build output, not committed. On a fresh checkout
// run `pnpm build:wasm` before `pnpm bench` to include the WASM
// comparator; otherwise the bench skips those entries with a warning.
let wasmSplit: typeof split | null = null
let wasmSplitToOffsets: typeof splitToOffsets | null = null
try {
  // @ts-expect-error — generated artifact path; not in source tree
  const mod = await import('../wasm/pkg/amigo_sentences_wasm.js')
  wasmSplit = mod.split
  wasmSplitToOffsets = mod.splitToOffsets
} catch {
  console.warn('[bench] WASM artifact missing — run `pnpm build:wasm` to include WASM comparator')
}
// @ts-expect-error — sbd has no types
import sbd from 'sbd'

const SHORT = 'Hello world. How are you? I am fine. Thank you.'
const MEDIUM = Array.from({ length: 50 }, (_, i) =>
  `This is sentence number ${i}, and it contains some filler text to reach a meaningful length.`,
).join(' ')

test('short (~50 chars, 4 sentences)', async ({ bench }) => {
  await bench('@amigo-labs/sentences (napi) split()', () => {
    split(SHORT)
  }).run()
  if (wasmSplit) await bench('@amigo-labs/sentences (wasm) split()', () => { wasmSplit!(SHORT) }).run()
  await bench('@amigo-labs/sentences (napi) splitToOffsets()', () => {
    splitToOffsets(SHORT)
  }).run()
  if (wasmSplitToOffsets) await bench('@amigo-labs/sentences (wasm) splitToOffsets()', () => { wasmSplitToOffsets!(SHORT) }).run()
  await bench('sbd', () => {
    sbd.sentences(SHORT)
  }).run()
})

test('medium (~5 KB, 50 sentences)', async ({ bench }) => {
  await bench('@amigo-labs/sentences (napi) split()', () => {
    split(MEDIUM)
  }).run()
  if (wasmSplit) await bench('@amigo-labs/sentences (wasm) split()', () => { wasmSplit!(MEDIUM) }).run()
  await bench('@amigo-labs/sentences (napi) splitToOffsets()', () => {
    splitToOffsets(MEDIUM)
  }).run()
  if (wasmSplitToOffsets) await bench('@amigo-labs/sentences (wasm) splitToOffsets()', () => { wasmSplitToOffsets!(MEDIUM) }).run()
  await bench('sbd', () => {
    sbd.sentences(MEDIUM)
  }).run()
})
