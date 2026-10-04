import { test } from 'vitest'
import { MiniSearch } from '../index.js'
// WASM is built as build output, not committed. On a fresh checkout
// run `pnpm build:wasm` before `pnpm bench` to include the WASM
// comparator; otherwise the bench skips those entries with a warning.
let wasmMiniSearch: typeof MiniSearch | null = null
try {
  // @ts-expect-error — generated artifact path; not in source tree
  const mod = await import('../wasm/pkg/amigo_minisearch_wasm.js')
  wasmMiniSearch = mod.MiniSearch
} catch {
  console.warn('[bench] WASM artifact missing — run `pnpm build:wasm` to include WASM comparator')
}
import UpstreamMiniSearch from 'minisearch'

const DOCS = Array.from({ length: 1000 }, (_, i) => ({
  id: `${i}`,
  text: `doc ${i} contains alpha beta gamma delta and token${i}`,
}))

test('index build (1000 docs)', async ({ bench }) => {
  await bench('@amigo-labs/minisearch (napi)', () => {
    const m = new MiniSearch()
    m.addAll(DOCS)
  }).run()
  if (wasmMiniSearch) await bench('@amigo-labs/minisearch (wasm)', () => {
    const m = new wasmMiniSearch!()
    m.addAll(DOCS)
  }).run()
  await bench('minisearch', () => {
    const m = new UpstreamMiniSearch({
      fields: ['text'],
      storeFields: ['id'],
    })
    m.addAll(DOCS)
  }).run()
})

const ours = (() => {
  const m = new MiniSearch()
  m.addAll(DOCS)
  return m
})()

const upstream = (() => {
  const m = new UpstreamMiniSearch({
    fields: ['text'],
    storeFields: ['id'],
  })
  m.addAll(DOCS)
  return m
})()

const wasmOurs = wasmMiniSearch
  ? (() => {
      const m = new wasmMiniSearch!()
      m.addAll(DOCS)
      return m
    })()
  : null

test('query (1000 docs indexed)', async ({ bench }) => {
  await bench('@amigo-labs/minisearch (napi) search', () => {
    ours.search('alpha')
  }).run()
  if (wasmOurs) await bench('@amigo-labs/minisearch (wasm) search', () => {
    wasmOurs.search('alpha')
  }).run()
  await bench('minisearch search', () => {
    upstream.search('alpha')
  }).run()
})

test('autosuggest', async ({ bench }) => {
  await bench('@amigo-labs/minisearch (napi) autoSuggest', () => {
    ours.autoSuggest('alph')
  }).run()
  if (wasmOurs) await bench('@amigo-labs/minisearch (wasm) autoSuggest', () => {
    wasmOurs.autoSuggest('alph')
  }).run()
  await bench('minisearch autoSuggest', () => {
    upstream.autoSuggest('alph')
  }).run()
})
