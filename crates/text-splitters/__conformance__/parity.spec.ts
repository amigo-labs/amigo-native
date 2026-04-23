import { describe, expect, it } from 'vitest'
import { splitText } from '../index.js'
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters'

async function upstream(text: string, opts: { chunkSize: number; chunkOverlap?: number }) {
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: opts.chunkSize,
    chunkOverlap: opts.chunkOverlap ?? 0,
  })
  return splitter.splitText(text)
}

describe('parity: both produce non-empty chunks', () => {
  const cases = [
    { text: 'a '.repeat(500), chunkSize: 100 },
    { text: 'paragraph.\n\nother.\n\nthird.\n\nfourth.', chunkSize: 25 },
    { text: 'lorem ipsum dolor sit amet consectetur adipiscing elit'.repeat(10), chunkSize: 200 },
  ]
  for (const [i, c] of cases.entries()) {
    it(`case ${i}`, async () => {
      const ourChunks = splitText(c.text, { chunkSize: c.chunkSize })
      const upstreamChunks = await upstream(c.text, { chunkSize: c.chunkSize })
      expect(ourChunks.length).toBeGreaterThan(0)
      expect(upstreamChunks.length).toBeGreaterThan(0)
    })
  }
})

describe('parity: chunk-size budget is respected', () => {
  it('both honor chunkSize', async () => {
    const text = 'x y '.repeat(500)
    const ourChunks = splitText(text, { chunkSize: 50 })
    const upstreamChunks = await upstream(text, { chunkSize: 50 })
    for (const c of ourChunks) expect(c.length).toBeLessThanOrEqual(50)
    for (const c of upstreamChunks) expect(c.length).toBeLessThanOrEqual(60) // upstream can slightly exceed
  })
})

describe('self-invariant: reassembly covers input content', () => {
  // Not a parity claim — upstream langchain's overlap semantics
  // differ from ours, so we only assert on our chunks. See
  // divergences.md for upstream-parity notes.
  it('every source token appears in at least one chunk', () => {
    const text = 'alpha beta gamma delta epsilon zeta eta theta'
    const ourChunks = splitText(text, { chunkSize: 20, chunkOverlap: 5 })
    for (const tok of text.split(' ')) {
      expect(ourChunks.some((c) => c.includes(tok))).toBe(true)
    }
  })
})
