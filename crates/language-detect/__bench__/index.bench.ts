import { test } from 'vitest'
import { detect } from '../index.js'
// WASM is built as build output, not committed. On a fresh checkout
// run `pnpm build:wasm` before `pnpm bench` to include the WASM
// comparator; otherwise the bench skips those entries with a warning.
let wasmDetect: typeof detect | null = null
try {
  // @ts-expect-error — generated artifact path; not in source tree
  const mod = await import('../wasm/pkg/amigo_language_detect_wasm.js')
  wasmDetect = mod.detect
} catch {
  console.warn('[bench] WASM artifact missing — run `pnpm build:wasm` to include WASM comparator')
}
// @ts-expect-error — franc has no type-declarations package
import { franc } from 'franc'

const TWEET = 'hello world from my tiny test'
const PARAGRAPH =
  'The quick brown fox jumps over the lazy dog and the lazy dog was not amused by this sudden interruption of his peaceful slumber. He had been dreaming of fresh bones and open fields, and the fox appeared entirely unaware that such an interruption would be unwelcome.'
const ARTICLE = PARAGRAPH.repeat(20) // ~11 KB

test('language-detect — tweet (50 B)', async ({ bench }) => {
  await bench('@amigo-labs/language-detect (napi)', () => {
    detect(TWEET)
  }).run()
  if (wasmDetect) await bench('@amigo-labs/language-detect (wasm)', () => { wasmDetect!(TWEET) }).run()
  await bench('franc', () => {
    franc(TWEET)
  }).run()
})

test('language-detect — paragraph (~300 B)', async ({ bench }) => {
  await bench('@amigo-labs/language-detect (napi)', () => {
    detect(PARAGRAPH)
  }).run()
  if (wasmDetect) await bench('@amigo-labs/language-detect (wasm)', () => { wasmDetect!(PARAGRAPH) }).run()
  await bench('franc', () => {
    franc(PARAGRAPH)
  }).run()
})

test('language-detect — article (~11 KB)', async ({ bench }) => {
  await bench('@amigo-labs/language-detect (napi)', () => {
    detect(ARTICLE)
  }).run()
  if (wasmDetect) await bench('@amigo-labs/language-detect (wasm)', () => { wasmDetect!(ARTICLE) }).run()
  await bench('franc', () => {
    franc(ARTICLE)
  }).run()
})
