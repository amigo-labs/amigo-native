import { describe, it, expect } from 'vitest'
import { diffLines, diffChars } from '../index.js'
import * as jsdiff from 'diff'

function counts(
  hunks: Array<{ added?: boolean | null; removed?: boolean | null }>,
) {
  return {
    added: hunks.filter((h) => h.added).length,
    removed: hunks.filter((h) => h.removed).length,
    equal: hunks.filter((h) => !h.added && !h.removed).length,
  }
}

describe('diff — cross-verification against jsdiff', () => {
  it('diffLines agrees on change direction for a typical 3-line diff', () => {
    const a = 'alpha\nbeta\ngamma\n'
    const b = 'alpha\nBETA\ngamma\n'
    const ours = counts(diffLines(a, b))
    const theirs = counts(jsdiff.diffLines(a, b))
    // Both engines must detect at least one added and one removed line.
    expect(ours.added).toBeGreaterThan(0)
    expect(ours.removed).toBeGreaterThan(0)
    expect(theirs.added).toBeGreaterThan(0)
    expect(theirs.removed).toBeGreaterThan(0)
  })

  it('diffChars agrees on insertion for cat → cats', () => {
    const ours = counts(diffChars('cat', 'cats'))
    const theirs = counts(jsdiff.diffChars('cat', 'cats'))
    expect(ours.added).toBe(theirs.added)
    expect(ours.removed).toBe(theirs.removed)
  })

  it('both engines agree that identical strings have no changes', () => {
    const ours = diffLines('same\n', 'same\n')
    const theirs = jsdiff.diffLines('same\n', 'same\n')
    expect(ours.every((h) => !h.added && !h.removed)).toBe(true)
    expect(theirs.every((h) => !h.added && !h.removed)).toBe(true)
  })
})
