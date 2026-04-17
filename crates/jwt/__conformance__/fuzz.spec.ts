import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { signSync, verifySync } from '../wrapper.js'

describe('jwt fuzzing', () => {
  it('sign → verify roundtrip preserves the payload (HS256)', () => {
    fc.assert(
      fc.property(
        fc.dictionary(
          fc.string({ minLength: 1, maxLength: 8 }).filter((k) => !['exp', 'nbf', 'iat', 'aud', 'iss', 'sub', 'jti'].includes(k)),
          fc.oneof(fc.string(), fc.integer(), fc.boolean()),
          { maxKeys: 5 },
        ),
        fc.string({ minLength: 16, maxLength: 64 }),
        (payload, secretText) => {
          const secret = Buffer.from(secretText)
          const token = signSync(payload, secret, { algorithm: 'HS256' })
          const decoded = verifySync(token, secret) as Record<string, unknown>
          for (const key of Object.keys(payload)) {
            expect(decoded[key]).toEqual(payload[key])
          }
        },
      ),
      { numRuns: 100, seed: 42 },
    )
  })

  it('verify rejects tokens signed with a different secret', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 16, maxLength: 64 }), fc.string({ minLength: 16, maxLength: 64 }), (s1, s2) => {
        fc.pre(s1 !== s2)
        const token = signSync({ sub: 'x' }, Buffer.from(s1), { algorithm: 'HS256' })
        expect(() => verifySync(token, Buffer.from(s2))).toThrow()
      }),
      { numRuns: 50, seed: 42 },
    )
  })
})
