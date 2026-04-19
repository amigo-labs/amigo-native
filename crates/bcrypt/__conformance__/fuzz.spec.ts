import { describe, it } from 'vitest'
import fc from 'fast-check'
import { hash, verify } from '../index.js'

// bcrypt is deliberately slow; keep run count low and use minimum cost.
const OPTS = { cost: 4 } as const

describe('bcrypt fuzzing', () => {
  it('hash → verify roundtrip for random passwords', async () => {
    await fc.assert(
      fc.asyncProperty(
        // bcrypt truncates at 72 bytes; bound input length to keep the
        // roundtrip well-defined under the truncation contract.
        fc.string({ minLength: 0, maxLength: 70 }),
        async (pw) => {
          const hashed = await hash(pw, OPTS)
          return await verify(hashed, pw)
        },
      ),
      { numRuns: 50, seed: 42 },
    )
  })

  it('wrong password is never accepted', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 70 }),
        fc.string({ minLength: 1, maxLength: 70 }),
        async (pw1, pw2) => {
          fc.pre(pw1 !== pw2)
          // Skip the truncation collision case: if both strings agree on
          // their first 72 bytes after UTF-8 encoding, bcrypt treats them
          // as identical by spec.
          const e1 = new TextEncoder().encode(pw1).slice(0, 72)
          const e2 = new TextEncoder().encode(pw2).slice(0, 72)
          fc.pre(!(e1.length === e2.length && e1.every((b, i) => b === e2[i])))
          const hashed = await hash(pw1, OPTS)
          return !(await verify(hashed, pw2))
        },
      ),
      { numRuns: 50, seed: 42 },
    )
  })
})
