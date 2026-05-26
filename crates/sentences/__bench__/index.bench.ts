import { bench, describe } from 'vitest'
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

describe('short (~50 chars, 4 sentences)', () => {
  bench('@amigo-labs/sentences (napi) split()', () => {
    split(SHORT)
  })
  if (wasmSplit) bench('@amigo-labs/sentences (wasm) split()', () => { wasmSplit!(SHORT) })
  bench('@amigo-labs/sentences (napi) splitToOffsets()', () => {
    splitToOffsets(SHORT)
  })
  if (wasmSplitToOffsets) bench('@amigo-labs/sentences (wasm) splitToOffsets()', () => { wasmSplitToOffsets!(SHORT) })
  bench('sbd', () => {
    sbd.sentences(SHORT)
  })
})

describe('medium (~5 KB, 50 sentences)', () => {
  bench('@amigo-labs/sentences (napi) split()', () => {
    split(MEDIUM)
  })
  if (wasmSplit) bench('@amigo-labs/sentences (wasm) split()', () => { wasmSplit!(MEDIUM) })
  bench('@amigo-labs/sentences (napi) splitToOffsets()', () => {
    splitToOffsets(MEDIUM)
  })
  if (wasmSplitToOffsets) bench('@amigo-labs/sentences (wasm) splitToOffsets()', () => { wasmSplitToOffsets!(MEDIUM) })
  bench('sbd', () => {
    sbd.sentences(MEDIUM)
  })
})
