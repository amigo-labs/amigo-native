/**
 * Parity tests against jsonwebtoken@9.
 *
 * Cross-validation: tokens signed by amigo must be verifiable by jsonwebtoken
 * and vice-versa, across all symmetric and asymmetric algorithms.
 */
import { describe, it, expect } from 'vitest'
import * as amigo from '../wrapper.js'
import jsonwebtoken from 'jsonwebtoken'
import { generateKeyPairSync } from 'node:crypto'

const HS_SECRET = 'amigo-labs-test-secret-at-least-32-bytes-long-pad'

const rsa = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
})

const ec = generateKeyPairSync('ec', {
  namedCurve: 'prime256v1',
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
})

describe('jwt — parity with jsonwebtoken@9: HS256', () => {
  it('amigo-signed → jsonwebtoken-verified', async () => {
    const token = await amigo.sign({ sub: 'alice' }, HS_SECRET, { algorithm: 'HS256' })
    const decoded = jsonwebtoken.verify(token, HS_SECRET, { algorithms: ['HS256'] }) as Record<
      string,
      unknown
    >
    expect(decoded.sub).toBe('alice')
  })

  it('jsonwebtoken-signed → amigo-verified', async () => {
    const token = jsonwebtoken.sign({ sub: 'bob' }, HS_SECRET, { algorithm: 'HS256' })
    const payload = (await amigo.verify(token, HS_SECRET, { algorithms: ['HS256'] })) as Record<
      string,
      unknown
    >
    expect(payload.sub).toBe('bob')
  })

  it('expiresIn option matches upstream', async () => {
    const t1 = await amigo.sign({ a: 1 }, HS_SECRET, { expiresIn: 600 })
    const t2 = jsonwebtoken.sign({ a: 1 }, HS_SECRET, { expiresIn: 600 })
    const p1 = (await amigo.verify(t1, HS_SECRET)) as Record<string, unknown>
    const p2 = jsonwebtoken.verify(t2, HS_SECRET) as Record<string, unknown>
    // both should have exp set approximately equal
    expect(typeof p1.exp).toBe('number')
    expect(typeof p2.exp).toBe('number')
    expect(Math.abs((p1.exp as number) - (p2.exp as number))).toBeLessThan(5)
  })
})

describe('jwt — parity: RS256', () => {
  it('cross-verified (bidirectional)', async () => {
    const t1 = await amigo.sign({ sub: 'rsa' }, rsa.privateKey, { algorithm: 'RS256' })
    const p1 = jsonwebtoken.verify(t1, rsa.publicKey, { algorithms: ['RS256'] }) as Record<
      string,
      unknown
    >
    expect(p1.sub).toBe('rsa')

    const t2 = jsonwebtoken.sign({ sub: 'rsa2' }, rsa.privateKey, { algorithm: 'RS256' })
    const p2 = (await amigo.verify(t2, rsa.publicKey, { algorithms: ['RS256'] })) as Record<
      string,
      unknown
    >
    expect(p2.sub).toBe('rsa2')
  })
})

describe('jwt — parity: ES256', () => {
  it('cross-verified (bidirectional)', async () => {
    const t1 = await amigo.sign({ sub: 'ec' }, ec.privateKey, { algorithm: 'ES256' })
    const p1 = jsonwebtoken.verify(t1, ec.publicKey, { algorithms: ['ES256'] }) as Record<
      string,
      unknown
    >
    expect(p1.sub).toBe('ec')

    const t2 = jsonwebtoken.sign({ sub: 'ec2' }, ec.privateKey, { algorithm: 'ES256' })
    const p2 = (await amigo.verify(t2, ec.publicKey, { algorithms: ['ES256'] })) as Record<
      string,
      unknown
    >
    expect(p2.sub).toBe('ec2')
  })
})

describe('jwt — parity: security rules', () => {
  it('both reject alg=none', async () => {
    const token = jsonwebtoken.sign({ sub: 'x' }, '', { algorithm: 'none' })
    await expect(amigo.verify(token, 'whatever')).rejects.toThrow()
    expect(() => jsonwebtoken.verify(token, 'whatever')).toThrow()
  })

  it('both reject expired tokens', async () => {
    const token = await amigo.sign({ a: 1 }, HS_SECRET, { expiresIn: -10 })
    await expect(amigo.verify(token, HS_SECRET)).rejects.toThrow()
    expect(() => jsonwebtoken.verify(token, HS_SECRET)).toThrow()
  })
})
