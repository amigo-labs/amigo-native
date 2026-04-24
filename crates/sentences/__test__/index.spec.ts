import { describe, expect, it } from 'vitest'
import {
  split,
  splitToOffsets,
  splitBatch,
  splitBatchToOffsets,
} from '../index.js'

describe('split', () => {
  it('splits two simple sentences', () => {
    expect(split('Hello world. How are you?')).toEqual([
      'Hello world.',
      'How are you?',
    ])
  })

  it('keeps abbreviations intact (Mr.)', () => {
    expect(split('Mr. Smith went home. He was tired.')).toEqual([
      'Mr. Smith went home.',
      'He was tired.',
    ])
  })

  it('treats decimals as part of the same sentence', () => {
    expect(split('The value is 3.14 here.')).toHaveLength(1)
  })

  it('handles ellipses', () => {
    const out = split('He said... Go away.')
    expect(out).toHaveLength(2)
  })

  it('returns an empty array on empty input', () => {
    expect(split('')).toEqual([])
  })

  it('handles single sentence with no terminator', () => {
    expect(split('no terminator here')).toEqual(['no terminator here'])
  })

  it('handles exclamation + question terminators', () => {
    expect(split('Run! Now!')).toEqual(['Run!', 'Now!'])
  })

  it('respects preserveWhitespace', () => {
    const out = split('Hello world.  Second sentence.', {
      preserveWhitespace: true,
    })
    expect(out).toHaveLength(2)
    expect(out[1]).toMatch(/^\s/)
  })

  it('respects newlineBoundaries', () => {
    const out = split('para one\n\npara two', { newlineBoundaries: true })
    expect(out).toHaveLength(2)
  })

  it('supports a language option', () => {
    // In German, "z.B." is an abbreviation; "Das ist z.B. gut. Super."
    // should split once.
    const out = split('Das ist z.B. gut. Super.', { language: 'de' })
    expect(out).toHaveLength(2)
  })

  it('accepts customAbbreviations', () => {
    const out = split('Foo LLC. continues here.', {
      customAbbreviations: ['llc'],
    })
    expect(out).toHaveLength(1)
  })

  it('handles question mark inside quotes', () => {
    const out = split('"Why?" she asked. He left.')
    expect(out).toHaveLength(2)
  })
})

describe('splitToOffsets', () => {
  it('returns a buffer of u32 pairs', () => {
    const buf = splitToOffsets('Hello. World.')
    expect(buf.length % 8).toBe(0)
    expect(buf.length).toBeGreaterThanOrEqual(16)
  })

  it('offsets reconstruct the original sentences', () => {
    const input = 'First one. Second one. Third!'
    const buf = splitToOffsets(input)
    const view = new Uint32Array(buf.buffer, buf.byteOffset, buf.length / 4)
    const reconstructed: string[] = []
    for (let i = 0; i < view.length; i += 2) {
      reconstructed.push(input.slice(view[i], view[i + 1]))
    }
    expect(reconstructed).toEqual(split(input))
  })
})

describe('batch', () => {
  it('splitBatch returns an array of arrays', () => {
    const out = splitBatch(['Hello. World.', 'Foo! Bar?'])
    expect(out).toHaveLength(2)
    expect(out[0]).toHaveLength(2)
    expect(out[1]).toHaveLength(2)
  })

  it('splitBatchToOffsets returns an array of buffers', () => {
    const out = splitBatchToOffsets(['Hello. World.', 'Foo! Bar?'])
    expect(out).toHaveLength(2)
    for (const buf of out) {
      expect(buf.length % 8).toBe(0)
    }
  })
})
