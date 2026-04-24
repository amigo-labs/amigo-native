import { bench, describe } from 'vitest'
import { compile } from '../index.js'

const SMALL = 'Hello World'
const MEDIUM = `
= Report

#for i in range(10) [
  == Section #i

  Some filler text for section #i.
]
`
const INVOICE = `
#set page(paper: "a4", margin: 2cm)
= Invoice

#table(
  columns: (1fr, auto, auto),
  [*Item*], [*Qty*], [*Amount*],
  ..for i in range(20) { ([Item #i], [1], [$1.00]) },
)
`

describe('trivial source', () => {
  bench('@amigo-labs/typst compile', () => {
    compile(SMALL)
  })
})

describe('multi-section report (10 sections)', () => {
  bench('@amigo-labs/typst compile', () => {
    compile(MEDIUM)
  })
})

describe('invoice with 20-row table', () => {
  bench('@amigo-labs/typst compile', () => {
    compile(INVOICE)
  })
})
