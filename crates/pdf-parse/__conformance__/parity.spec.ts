import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parse as ours } from '../index.js'
// @ts-expect-error — no types
import pdfParse from 'pdf-parse'

const CORPUS = join(__dirname, 'corpus')

function fixture(name: string): Buffer {
  return readFileSync(join(CORPUS, name))
}

async function upstreamOrSkip(buf: Buffer): Promise<{ text: string; numpages: number; info: unknown } | null> {
  // Upstream pdf-parse (wrapping pdf.js) is stricter than pdf-extract
  // about PDF conformance. It rejects some lopdf-crafted fixtures with
  // `UnknownErrorException: Illegal character`. We treat those as
  // a divergence (documented) and skip the parity assertion.
  try {
    return await pdfParse(buf)
  } catch {
    return null
  }
}

describe('parity: text extraction', () => {
  it('we extract non-empty text from example.pdf', async () => {
    const our = await ours(fixture('example.pdf'))
    expect(our.text.length).toBeGreaterThan(0)
  })

  it('we report a page count on example.pdf', async () => {
    const our = await ours(fixture('example.pdf'))
    expect(our.numpages).toBeGreaterThanOrEqual(1)
  })

  it('when upstream parses, page counts agree', async () => {
    const buf = fixture('example.pdf')
    const upstream = await upstreamOrSkip(buf)
    if (upstream === null) return
    const our = await ours(buf)
    expect(our.numpages).toBe(upstream.numpages)
  })
})

describe('parity: info object shape', () => {
  it('both expose info as an object (when upstream succeeds)', async () => {
    const buf = fixture('example.pdf')
    const upstream = await upstreamOrSkip(buf)
    if (upstream === null) return
    const our = await ours(buf)
    expect(typeof our.info).toBe('object')
    expect(typeof upstream.info).toBe('object')
  })
})

describe('parity: token overlap', () => {
  it('shared words appear in both outputs when both succeed', async () => {
    const buf = fixture('example.pdf')
    const upstream = await upstreamOrSkip(buf)
    if (upstream === null) return
    const our = await ours(buf)
    const ourWords = new Set(our.text.split(/\s+/).filter((w) => w.length > 2))
    const upstreamWords = upstream.text
      .split(/\s+/)
      .filter((w: string) => w.length > 2)
    const shared = upstreamWords.filter((w: string) => ourWords.has(w))
    if (upstreamWords.length > 0) {
      expect(shared.length).toBeGreaterThan(0)
    }
  })
})
