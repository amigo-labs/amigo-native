import { describe, it, expect } from 'vitest'
import {
  diffChars,
  diffWords,
  diffLines,
  diffTrimmedLines,
  diffLinesToOffsets,
  diffCharsToOffsets,
  createPatch,
} from '../index.js'

describe('diff — hunk-array shape', () => {
  it('diffLines detects identical strings (no added/removed flags)', () => {
    const h = diffLines('alpha\nbeta\n', 'alpha\nbeta\n')
    expect(h.every((x) => !x.added && !x.removed)).toBe(true)
  })

  it('diffLines surfaces line changes', () => {
    const h = diffLines('alpha\nbeta\ngamma\n', 'alpha\nBETA\ngamma\n')
    expect(h.some((x) => x.added)).toBe(true)
    expect(h.some((x) => x.removed)).toBe(true)
  })

  it('diffChars detects single-character insertion', () => {
    const h = diffChars('cat', 'cats')
    expect(h.some((x) => x.added && x.value === 's')).toBe(true)
  })

  it('diffWords detects word-level changes', () => {
    const h = diffWords('the quick fox', 'the slow fox')
    const added = h.filter((x) => x.added).map((x) => x.value)
    const removed = h.filter((x) => x.removed).map((x) => x.value)
    expect(added.some((v) => v.includes('slow'))).toBe(true)
    expect(removed.some((v) => v.includes('quick'))).toBe(true)
  })

  it('diffTrimmedLines ignores trailing whitespace', () => {
    const h = diffTrimmedLines('hello  \nworld\n', 'hello\nworld\n')
    expect(h.every((x) => !x.added && !x.removed)).toBe(true)
  })

  it('diffLines on empty inputs returns an empty hunk array', () => {
    expect(diffLines('', '')).toEqual([])
  })
})

describe('diff — offset-packed output', () => {
  it('diffLinesToOffsets returns a multiple-of-20-byte Buffer', () => {
    const buf = diffLinesToOffsets('alpha\nbeta\n', 'alpha\nBETA\n')
    expect(buf.length % 20).toBe(0)
  })

  it('diffCharsToOffsets returns entries with sensible bounds', () => {
    const buf = diffCharsToOffsets('cat', 'cats')
    expect(buf.length).toBeGreaterThan(0)
    expect(buf.length % 20).toBe(0)

    const view = new Uint32Array(
      buf.buffer,
      buf.byteOffset,
      buf.length / 4,
    )
    const newEnd = view[view.length - 1]
    expect(newEnd).toBe(4) // "cats".length
  })

  it('diffLinesToOffsets on identical strings returns a single Equal entry', () => {
    const buf = diffLinesToOffsets('hello\n', 'hello\n')
    expect(buf.length).toBe(20)
    const view = new Uint32Array(
      buf.buffer,
      buf.byteOffset,
      buf.length / 4,
    )
    expect(view[0]).toBe(0) // tag 0 = Equal
  })
})

describe('diff — createPatch', () => {
  it('produces a unified-diff-format string', () => {
    const patch = createPatch('f.txt', 'alpha\nbeta\n', 'alpha\nBETA\n')
    expect(patch).toContain('---')
    expect(patch).toContain('+++')
    expect(patch).toContain('@@')
    expect(patch).toContain('-beta')
    expect(patch).toContain('+BETA')
  })

  it('accepts custom old/new headers', () => {
    const patch = createPatch(
      'file.txt',
      'a\n',
      'b\n',
      'file.txt (before)',
      'file.txt (after)',
    )
    expect(patch).toContain('file.txt (before)')
    expect(patch).toContain('file.txt (after)')
  })
})
