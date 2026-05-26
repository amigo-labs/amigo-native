import { bench, describe } from 'vitest'
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

describe('language-detect — tweet (50 B)', () => {
  bench('@amigo-labs/language-detect (napi)', () => {
    detect(TWEET)
  })
  if (wasmDetect) bench('@amigo-labs/language-detect (wasm)', () => { wasmDetect!(TWEET) })
  bench('franc', () => {
    franc(TWEET)
  })
})

describe('language-detect — paragraph (~300 B)', () => {
  bench('@amigo-labs/language-detect (napi)', () => {
    detect(PARAGRAPH)
  })
  if (wasmDetect) bench('@amigo-labs/language-detect (wasm)', () => { wasmDetect!(PARAGRAPH) })
  bench('franc', () => {
    franc(PARAGRAPH)
  })
})

describe('language-detect — article (~11 KB)', () => {
  bench('@amigo-labs/language-detect (napi)', () => {
    detect(ARTICLE)
  })
  if (wasmDetect) bench('@amigo-labs/language-detect (wasm)', () => { wasmDetect!(ARTICLE) })
  bench('franc', () => {
    franc(ARTICLE)
  })
})
