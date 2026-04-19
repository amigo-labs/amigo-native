import { describe, it, expect } from 'vitest'
import * as jose from 'jose'
import { generateEd25519KeyPair, jwkThumbprint } from '../index.js'

// Parity: JWKs we produce must be importable by panva/jose, and our
// thumbprint must equal panva/jose's calculation on any JWK.

const PINNED_RSA_JWK = {
  kty: 'RSA',
  n: '0vx7agoebGcQSuuPiLJXZptN9nndrQmbXEps2aiAFbWhM78LhWx4cbbfAAtVT86zwu1RK7aPFFxuhDR1L6tSoc_BJECPebWKRXjBZCiFV4n3oknjhMstn64tZ_2W-5JsGY4Hc5n9yBXArwl93lqt7_RN5w6Cf0h4QyQ5v-65YGjQR0_FDW2QvzqY368QQMicAtaSqzs8KJZgnYb9c7d0zgdAZHzu6qMQvRL5hajrn1n91CbOpbISD08qNLyrdkt-bFTWhAI4vMQFh6WeZu0fM4lFd2NcRwr3XPksINHaQ-G_xBniIqbw0Ls1jF44-csFCur-kEgU8awapJzKnqDKgw',
  e: 'AQAB',
}

describe('jose JWK parity — Ed25519', () => {
  it('our generated public JWK is importable by panva/jose', async () => {
    const { publicJwk } = generateEd25519KeyPair() as { publicJwk: any }
    const key = await jose.importJWK(publicJwk, 'EdDSA')
    expect(key).toBeDefined()
  })

  it('our thumbprint matches panva/jose calculateJwkThumbprint (Ed25519)', async () => {
    const { publicJwk } = generateEd25519KeyPair() as { publicJwk: any }
    const ours = jwkThumbprint(publicJwk)
    const theirs = await jose.calculateJwkThumbprint(publicJwk, 'sha256')
    expect(ours).toBe(theirs)
  })

  it('Ed25519 private JWK round-trips through panva/jose import + sign + verify', async () => {
    const { publicJwk, privateJwk } = generateEd25519KeyPair() as {
      publicJwk: any
      privateJwk: any
    }
    const privKey = await jose.importJWK(privateJwk, 'EdDSA')
    const pubKey = await jose.importJWK(publicJwk, 'EdDSA')

    const jwt = await new jose.SignJWT({ sub: 'amigo' })
      .setProtectedHeader({ alg: 'EdDSA' })
      .sign(privKey)

    const { payload } = await jose.jwtVerify(jwt, pubKey)
    expect(payload.sub).toBe('amigo')
  })
})

describe('jose JWK parity — RSA thumbprint', () => {
  it('our thumbprint matches panva/jose for the pinned RSA JWK', async () => {
    const ours = jwkThumbprint(PINNED_RSA_JWK)
    const theirs = await jose.calculateJwkThumbprint(PINNED_RSA_JWK, 'sha256')
    expect(ours).toBe(theirs)
  })

  it('RFC 7638 §3.1 RSA example vector matches panva/jose', async () => {
    const ours = jwkThumbprint(PINNED_RSA_JWK)
    const theirs = await jose.calculateJwkThumbprint(PINNED_RSA_JWK, 'sha256')
    expect(ours).toBe(theirs)
    expect(ours).toBe('NzbLsXh8uDCcd-6MNwXF4W_7noWXFZAfHkxZsRGC9Xs')
  })
})
