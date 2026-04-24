import { bench, describe } from 'vitest'
import { MiniSearch } from '../index.js'
import UpstreamMiniSearch from 'minisearch'

const DOCS = Array.from({ length: 1000 }, (_, i) => ({
  id: `${i}`,
  text: `doc ${i} contains alpha beta gamma delta and token${i}`,
}))

describe('index build (1000 docs)', () => {
  bench('@amigo-labs/minisearch', () => {
    const m = new MiniSearch()
    m.addAll(DOCS)
  })
  bench('minisearch', () => {
    const m = new UpstreamMiniSearch({
      fields: ['text'],
      storeFields: ['id'],
    })
    m.addAll(DOCS)
  })
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

describe('query (1000 docs indexed)', () => {
  bench('@amigo-labs/minisearch search', () => {
    ours.search('alpha')
  })
  bench('minisearch search', () => {
    upstream.search('alpha')
  })
})

describe('autosuggest', () => {
  bench('@amigo-labs/minisearch autoSuggest', () => {
    ours.autoSuggest('alph')
  })
  bench('minisearch autoSuggest', () => {
    upstream.autoSuggest('alph')
  })
})
