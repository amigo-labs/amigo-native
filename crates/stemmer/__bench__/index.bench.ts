import { bench, describe } from 'vitest'
import { Stemmer } from '../index.js'
// WASM is built as build output, not committed. On a fresh checkout
// run `pnpm build:wasm` before `pnpm bench` to include the WASM
// comparator; otherwise the bench skips those entries with a warning.
let wasmStemmer: typeof Stemmer | null = null
try {
  // @ts-expect-error — generated artifact path; not in source tree
  const mod = await import('../wasm/pkg/amigo_stemmer_wasm.js')
  wasmStemmer = mod.Stemmer
} catch {
  console.warn('[bench] WASM artifact missing — run `pnpm build:wasm` to include WASM comparator')
}
// @ts-expect-error — natural has no type-declarations package
import natural from 'natural'

const amigo = new Stemmer('english')
const wasmAmigo = wasmStemmer ? new wasmStemmer('english') : null
const SHORT_WORDS = ['running', 'cats', 'jumping', 'swimming', 'fishes']
const WORDS_1000 = Array.from({ length: 1000 }, (_, i) =>
  SHORT_WORDS[i % SHORT_WORDS.length],
)
const WORDS_10000 = Array.from({ length: 10000 }, (_, i) =>
  SHORT_WORDS[i % SHORT_WORDS.length],
)

const DOC_10KB = Array.from({ length: 1500 }, (_, i) =>
  SHORT_WORDS[i % SHORT_WORDS.length],
).join(' ')

const DOC_100KB = Array.from({ length: 15000 }, (_, i) =>
  SHORT_WORDS[i % SHORT_WORDS.length],
).join(' ')

describe('stemmer — stemMany × 1000', () => {
  bench('@amigo-labs/stemmer (napi)', () => {
    amigo.stemMany(WORDS_1000)
  })
  if (wasmAmigo) bench('@amigo-labs/stemmer (wasm)', () => {
    wasmAmigo.stemMany(WORDS_1000)
  })
  bench('natural.PorterStemmer (loop)', () => {
    for (const w of WORDS_1000) natural.PorterStemmer.stem(w)
  })
})

describe('stemmer — stemMany × 10000', () => {
  bench('@amigo-labs/stemmer (napi)', () => {
    amigo.stemMany(WORDS_10000)
  })
  if (wasmAmigo) bench('@amigo-labs/stemmer (wasm)', () => {
    wasmAmigo.stemMany(WORDS_10000)
  })
  bench('natural.PorterStemmer (loop)', () => {
    for (const w of WORDS_10000) natural.PorterStemmer.stem(w)
  })
})

describe('stemmer — tokenizeAndStem 10 KB doc', () => {
  bench('@amigo-labs/stemmer (napi)', () => {
    amigo.tokenizeAndStem(DOC_10KB)
  })
  if (wasmAmigo) bench('@amigo-labs/stemmer (wasm)', () => {
    wasmAmigo.tokenizeAndStem(DOC_10KB)
  })
  bench('natural.PorterStemmer.tokenizeAndStem', () => {
    natural.PorterStemmer.tokenizeAndStem(DOC_10KB)
  })
})

describe('stemmer — tokenizeAndStem 100 KB doc', () => {
  bench('@amigo-labs/stemmer (napi)', () => {
    amigo.tokenizeAndStem(DOC_100KB)
  })
  if (wasmAmigo) bench('@amigo-labs/stemmer (wasm)', () => {
    wasmAmigo.tokenizeAndStem(DOC_100KB)
  })
  bench('natural.PorterStemmer.tokenizeAndStem', () => {
    natural.PorterStemmer.tokenizeAndStem(DOC_100KB)
  })
})
