import { bench, describe } from 'vitest'
import { splitText as ours } from '../index.js'
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters'

const upstream = new RecursiveCharacterTextSplitter({
  chunkSize: 1000,
  chunkOverlap: 200,
})

const SHORT = 'hello world '.repeat(20)
const MEDIUM = 'lorem ipsum dolor sit amet '.repeat(500)
const LONG = 'the quick brown fox jumps over the lazy dog. '.repeat(3000)

describe('short (~240 bytes)', () => {
  bench('@amigo-labs/text-splitters splitText', () => {
    ours(SHORT, { chunkSize: 1000, chunkOverlap: 200 })
  })
  bench('@langchain/textsplitters', async () => {
    await upstream.splitText(SHORT)
  })
})

describe('medium (~14 KB)', () => {
  bench('@amigo-labs/text-splitters splitText', () => {
    ours(MEDIUM, { chunkSize: 1000, chunkOverlap: 200 })
  })
  bench('@langchain/textsplitters', async () => {
    await upstream.splitText(MEDIUM)
  })
})

describe('long (~140 KB)', () => {
  bench('@amigo-labs/text-splitters splitText', () => {
    ours(LONG, { chunkSize: 1000, chunkOverlap: 200 })
  })
  bench('@langchain/textsplitters', async () => {
    await upstream.splitText(LONG)
  })
})
