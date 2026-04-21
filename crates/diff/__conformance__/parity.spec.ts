import { describe, it, expect } from 'vitest'
import { diffLines, diffChars, diffLinesToOffsets } from '../index.js'

describe('diff — parity invariants', () => {
  it('identical inputs yield only Equal hunks', () => {
    const h = diffLines('alpha\nbeta\n', 'alpha\nbeta\n')
    expect(h.length).toBe(1)
    expect(h[0].added).toBeFalsy()
    expect(h[0].removed).toBeFalsy()
  })

  it('reconstructing from line-hunks yields the new string', () => {
    const a = 'alpha\nbeta\ngamma\n'
    const b = 'alpha\nBETA\ngamma\ndelta\n'
    const h = diffLines(a, b)
    const reconstructed = h
      .filter((x) => !x.removed)
      .map((x) => x.value)
      .join('')
    expect(reconstructed).toBe(b)
  })

  it('offset-packed entries are contiguous in the new stream', () => {
    const buf = diffLinesToOffsets('abc\ndef\nghi\n', 'abc\nDEF\nghi\n')
    const view = new Uint32Array(buf.buffer, buf.byteOffset, buf.length / 4)
    let prevNewEnd = 0
    for (let i = 0; i < view.length; i += 5) {
      const newStart = view[i + 3]
      const newEnd = view[i + 4]
      expect(newStart).toBe(prevNewEnd)
      expect(newEnd).toBeGreaterThanOrEqual(newStart)
      prevNewEnd = newEnd
    }
  })

  it('diffChars single-char insert yields exactly one added hunk', () => {
    const h = diffChars('cat', 'cats')
    const added = h.filter((x) => x.added)
    const removed = h.filter((x) => x.removed)
    expect(added.length).toBe(1)
    expect(removed.length).toBe(0)
    expect(added[0].value).toBe('s')
  })
})
