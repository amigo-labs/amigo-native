import { describe, it, expect } from 'vitest'
import { hash, hashSync, verify, verifySync } from '../index.js'

const LOW_COST = { cost: 4 } as const

describe('bcrypt', () => {
  it('hash and verify (async)', async () => {
    const hashed = await hash('my-password', LOW_COST)
    expect(hashed).toMatch(/^\$2[aby]\$/)
    expect(await verify(hashed, 'my-password')).toBe(true)
    expect(await verify(hashed, 'wrong')).toBe(false)
  })

  it('hash and verify (sync)', () => {
    const hashed = hashSync('test', LOW_COST)
    expect(hashed).toMatch(/^\$2[aby]\$/)
    expect(verifySync(hashed, 'test')).toBe(true)
    expect(verifySync(hashed, 'wrong')).toBe(false)
  })

  it('custom cost is reflected in the hash string', () => {
    const hashed = hashSync('pw', { cost: 6 })
    expect(hashed).toMatch(/^\$2[aby]\$06\$/)
    expect(verifySync(hashed, 'pw')).toBe(true)
  })

  it('different passwords produce different hashes', () => {
    const a = hashSync('password-a', LOW_COST)
    const b = hashSync('password-b', LOW_COST)
    expect(a).not.toBe(b)
  })

  it('same password produces different hashes (random salt)', () => {
    const a = hashSync('same', LOW_COST)
    const b = hashSync('same', LOW_COST)
    expect(a).not.toBe(b)
  })

  it('passwords longer than 72 bytes are truncated (bcrypt spec)', () => {
    const a = hashSync('a'.repeat(72), LOW_COST)
    expect(verifySync(a, 'a'.repeat(72))).toBe(true)
    // 73-byte password verifies against the 72-byte hash — proof of truncation
    expect(verifySync(a, 'a'.repeat(73))).toBe(true)
  })
})
