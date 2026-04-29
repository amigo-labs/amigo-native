/**
 * Core parity smoke against jsonwebtoken@9. Algorithm matrix and
 * RSA/ECDSA round-trips live in `upstream.spec.ts`; this file is the
 * contract gate that every release must pass.
 */
import { describe, it, expect } from 'vitest'
import * as amigo from '../wrapper.js'
import jsonwebtoken from 'jsonwebtoken'

const HS_SECRET = 'amigo-labs-test-secret-at-least-32-bytes-long-pad'

describe('jwt — parity gate: HS256 cross-verify', () => {
  it('amigo-signed verifies under jsonwebtoken', async () => {
    const token = await amigo.sign({ sub: 'alice' }, HS_SECRET, { algorithm: 'HS256' })
    const decoded = jsonwebtoken.verify(token, HS_SECRET, { algorithms: ['HS256'] }) as Record<
      string,
      unknown
    >
    expect(decoded.sub).toBe('alice')
  })

  it('jsonwebtoken-signed verifies under amigo', async () => {
    const token = jsonwebtoken.sign({ sub: 'bob' }, HS_SECRET, { algorithm: 'HS256' })
    const payload = (await amigo.verify(token, HS_SECRET, { algorithms: ['HS256'] })) as Record<
      string,
      unknown
    >
    expect(payload.sub).toBe('bob')
  })

  it('rejects tokens with tampered payload', async () => {
    const token = await amigo.sign({ sub: 'alice' }, HS_SECRET, { algorithm: 'HS256' })
    const [h, , s] = token.split('.')
    const tampered = `${h}.${Buffer.from(JSON.stringify({ sub: 'eve' })).toString('base64url')}.${s}`
    await expect(amigo.verify(tampered, HS_SECRET)).rejects.toThrow()
  })

  it('rejects "alg=none" attacks (matches jsonwebtoken)', async () => {
    const noneToken =
      Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url') +
      '.' +
      Buffer.from('{"sub":"eve"}').toString('base64url') +
      '.'
    await expect(amigo.verify(noneToken, HS_SECRET)).rejects.toThrow()
  })
})
