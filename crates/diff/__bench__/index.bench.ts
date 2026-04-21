import { bench, describe } from 'vitest'
import { diffLines, diffChars, diffLinesToOffsets, createPatch } from '../index.js'
import * as jsdiff from 'diff'

function makeDoc(lines: number, seed = 0): string {
  const out: string[] = []
  let s = seed
  for (let i = 0; i < lines; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff
    out.push(`line ${i} value ${s.toString(16)}`)
  }
  return out.join('\n') + '\n'
}

const A_SMALL = makeDoc(50, 1)
const B_SMALL = makeDoc(50, 2)
const A_MED = makeDoc(1000, 1)
const B_MED = makeDoc(1000, 2)
const A_LARGE = makeDoc(10000, 1)
const B_LARGE = makeDoc(10000, 2)

describe('diff — diffLines 1 KB', () => {
  bench('@amigo-labs/diff', () => {
    diffLines(A_SMALL, B_SMALL)
  })
  bench('diff', () => {
    jsdiff.diffLines(A_SMALL, B_SMALL)
  })
})

describe('diff — diffLines 20 KB', () => {
  bench('@amigo-labs/diff', () => {
    diffLines(A_MED, B_MED)
  })
  bench('diff', () => {
    jsdiff.diffLines(A_MED, B_MED)
  })
})

describe('diff — diffLines 200 KB', () => {
  bench('@amigo-labs/diff', () => {
    diffLines(A_LARGE, B_LARGE)
  })
  bench('diff', () => {
    jsdiff.diffLines(A_LARGE, B_LARGE)
  })
})

describe('diff — diffLinesToOffsets 20 KB (packed hot-path)', () => {
  bench('@amigo-labs/diff (offsets)', () => {
    diffLinesToOffsets(A_MED, B_MED)
  })
  bench('@amigo-labs/diff (hunks)', () => {
    diffLines(A_MED, B_MED)
  })
})

describe('diff — createPatch 20 KB', () => {
  bench('@amigo-labs/diff', () => {
    createPatch('f.txt', A_MED, B_MED)
  })
  bench('diff.createPatch', () => {
    jsdiff.createPatch('f.txt', A_MED, B_MED)
  })
})

describe('diff — diffChars 5 KB', () => {
  const a = 'x'.repeat(5000)
  const b = a.slice(0, 2500) + 'Y' + a.slice(2500)
  bench('@amigo-labs/diff', () => {
    diffChars(a, b)
  })
  bench('diff', () => {
    jsdiff.diffChars(a, b)
  })
})
