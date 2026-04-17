import { bench, describe } from 'vitest'
import * as amigo from '../wrapper.js'
import jsonwebtoken from 'jsonwebtoken'
import { generateKeyPairSync } from 'node:crypto'

const HS_SECRET = 'amigo-labs-test-secret-at-least-32-bytes-long-pad'
const payload = { sub: 'user-1', roles: ['admin', 'editor'], iat: 1_700_000_000 }

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

const amigoHs = amigo.signSync(payload, HS_SECRET, { algorithm: 'HS256' })
const upstreamHs = jsonwebtoken.sign(payload, HS_SECRET, { algorithm: 'HS256' })

const amigoRs = amigo.signSync(payload, rsa.privateKey, { algorithm: 'RS256' })
const upstreamRs = jsonwebtoken.sign(payload, rsa.privateKey, { algorithm: 'RS256' })

const amigoEs = amigo.signSync(payload, ec.privateKey, { algorithm: 'ES256' })
const upstreamEs = jsonwebtoken.sign(payload, ec.privateKey, { algorithm: 'ES256' })

describe('jwt — sign HS256', () => {
  bench('@amigo-labs/jwt', () => {
    amigo.signSync(payload, HS_SECRET, { algorithm: 'HS256' })
  })
  bench('jsonwebtoken', () => {
    jsonwebtoken.sign(payload, HS_SECRET, { algorithm: 'HS256' })
  })
})

describe('jwt — verify HS256', () => {
  bench('@amigo-labs/jwt', () => {
    amigo.verifySync(amigoHs, HS_SECRET, { algorithms: ['HS256'] })
  })
  bench('jsonwebtoken', () => {
    jsonwebtoken.verify(upstreamHs, HS_SECRET, { algorithms: ['HS256'] })
  })
})

describe('jwt — sign RS256', () => {
  bench('@amigo-labs/jwt', () => {
    amigo.signSync(payload, rsa.privateKey, { algorithm: 'RS256' })
  })
  bench('jsonwebtoken', () => {
    jsonwebtoken.sign(payload, rsa.privateKey, { algorithm: 'RS256' })
  })
})

describe('jwt — verify RS256', () => {
  bench('@amigo-labs/jwt', () => {
    amigo.verifySync(amigoRs, rsa.publicKey, { algorithms: ['RS256'] })
  })
  bench('jsonwebtoken', () => {
    jsonwebtoken.verify(upstreamRs, rsa.publicKey, { algorithms: ['RS256'] })
  })
})

describe('jwt — sign ES256', () => {
  bench('@amigo-labs/jwt', () => {
    amigo.signSync(payload, ec.privateKey, { algorithm: 'ES256' })
  })
  bench('jsonwebtoken', () => {
    jsonwebtoken.sign(payload, ec.privateKey, { algorithm: 'ES256' })
  })
})

describe('jwt — verify ES256', () => {
  bench('@amigo-labs/jwt', () => {
    amigo.verifySync(amigoEs, ec.publicKey, { algorithms: ['ES256'] })
  })
  bench('jsonwebtoken', () => {
    jsonwebtoken.verify(upstreamEs, ec.publicKey, { algorithms: ['ES256'] })
  })
})
