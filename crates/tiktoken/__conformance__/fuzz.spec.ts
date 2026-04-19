import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { Tiktoken } from '../index.js'

const runs = Number(process.env.FUZZ_RUNS ?? 200)

describe('tiktoken — fuzz (totality + safety)', () => {
  const cl100k = Tiktoken.getEncoding('cl100k_base')
  const o200k = Tiktoken.getEncoding('o200k_base')

  it('never throws on arbitrary unicode input (cl100k_base)', () => {
    fc.assert(
      fc.property(fc.fullUnicodeString(), (input) => {
        cl100k.encode(input)
      }),
      { numRuns: runs, seed: 42 },
    )
  })

  it('encode → decode is lossless for arbitrary unicode (cl100k_base)', () => {
    fc.assert(
      fc.property(fc.fullUnicodeString(), (input) => {
        expect(cl100k.decode(cl100k.encode(input))).toBe(input)
      }),
      { numRuns: runs, seed: 42 },
    )
  })

  it('encode → decode is lossless for arbitrary unicode (o200k_base)', () => {
    fc.assert(
      fc.property(fc.fullUnicodeString(), (input) => {
        expect(o200k.decode(o200k.encode(input))).toBe(input)
      }),
      { numRuns: runs, seed: 42 },
    )
  })

  it('countTokens is consistent with encodeOrdinary.length', () => {
    fc.assert(
      fc.property(fc.fullUnicodeString(), (input) => {
        expect(cl100k.countTokens(input)).toBe(cl100k.encodeOrdinary(input).length)
      }),
      { numRuns: runs, seed: 42 },
    )
  })

  it('isWithinTokenLimit is consistent with countTokens', () => {
    fc.assert(
      fc.property(
        fc.fullUnicodeString(),
        fc.integer({ min: 0, max: 10_000 }),
        (input, limit) => {
          const count = cl100k.countTokens(input)
          expect(cl100k.isWithinTokenLimit(input, limit)).toBe(count <= limit)
        },
      ),
      { numRuns: runs, seed: 42 },
    )
  })

  it('encodeMany matches per-call encodeOrdinary', () => {
    fc.assert(
      fc.property(fc.array(fc.fullUnicodeString(), { maxLength: 20 }), (inputs) => {
        const batch = cl100k.encodeMany(inputs)
        expect(batch).toHaveLength(inputs.length)
        for (let i = 0; i < inputs.length; i++) {
          expect(Array.from(batch[i])).toEqual(
            Array.from(cl100k.encodeOrdinary(inputs[i])),
          )
        }
      }),
      { numRuns: Math.min(runs, 50), seed: 42 },
    )
  })
})
