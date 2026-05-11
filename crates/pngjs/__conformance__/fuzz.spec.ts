import { describe, it } from 'vitest'
import fc from 'fast-check'
// import { something } from '../index.js'

const runs = Number(process.env.FUZZ_RUNS ?? 200)

describe('pngjs — fuzz (totality + safety)', () => {
  it.todo('never throws on arbitrary unicode input', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'binary' }), (_input) => {
        // something(_input)
      }),
      { numRuns: runs },
    )
  })

  it.todo('output is always valid UTF-8 (Buffer round-trip)', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'binary' }), (_input) => {
        // const out = something(_input)
        // expect(Buffer.from(out, 'utf8').toString('utf8')).toBe(out)
      }),
      { numRuns: runs },
    )
  })
})
