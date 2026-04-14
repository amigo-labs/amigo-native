import { describe, it, expect } from 'vitest'
import { hash, hashSync, verify, verifySync } from '../index.js'

describe('argon2', () => {
  it('hash and verify (async)', async () => {
    const hashed = await hash('my-password')
    expect(hashed).toMatch(/^\$argon2id\$/)
    expect(await verify(hashed, 'my-password')).toBe(true)
    expect(await verify(hashed, 'wrong')).toBe(false)
  })

  it('hash and verify (sync)', () => {
    const hashed = hashSync('test')
    expect(hashed).toMatch(/^\$argon2id\$/)
    expect(verifySync(hashed, 'test')).toBe(true)
    expect(verifySync(hashed, 'wrong')).toBe(false)
  })

  it('custom options', async () => {
    const hashed = await hash('pw', {
      memoryCost: 32768,
      timeCost: 2,
      parallelism: 2,
    })
    expect(await verify(hashed, 'pw')).toBe(true)
  })

  it('different passwords produce different hashes', () => {
    const a = hashSync('password-a')
    const b = hashSync('password-b')
    expect(a).not.toBe(b)
  })

  it('same password produces different hashes (random salt)', () => {
    const a = hashSync('same')
    const b = hashSync('same')
    expect(a).not.toBe(b)
  })
})
