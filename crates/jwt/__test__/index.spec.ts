import { describe, it, expect } from 'vitest'
import { sign, verify, signSync, verifySync, decode } from '../wrapper.js'

const SECRET = 'amigo-labs-test-secret'

describe('jwt', () => {
  it('signs and verifies HS256', async () => {
    const token = await sign({ sub: 'user-1', role: 'admin' }, SECRET, { algorithm: 'HS256' })
    expect(typeof token).toBe('string')
    expect(token.split('.').length).toBe(3)

    const payload = (await verify(token, SECRET, { algorithms: ['HS256'] })) as Record<
      string,
      unknown
    >
    expect(payload.sub).toBe('user-1')
    expect(payload.role).toBe('admin')
  })

  it('sync API', () => {
    const token = signSync({ a: 1 }, SECRET)
    const payload = verifySync(token, SECRET) as Record<string, unknown>
    expect(payload.a).toBe(1)
  })

  it('rejects bad signature', async () => {
    const token = await sign({ x: 1 }, SECRET)
    await expect(verify(token, 'wrong-secret')).rejects.toThrow()
  })

  it('rejects alg=none attack', async () => {
    // Craft a token with alg=none manually
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')
    const payload = Buffer.from(JSON.stringify({ sub: 'attacker' })).toString('base64url')
    const token = `${header}.${payload}.`
    await expect(verify(token, SECRET)).rejects.toThrow()
  })

  it('expiresIn sets exp claim in the future', async () => {
    const token = await sign({ a: 1 }, SECRET, { expiresIn: 3600 })
    const header = decode(token, { complete: true }) as Record<string, unknown>
    const payload = header.payload as Record<string, unknown>
    expect(typeof payload.exp).toBe('number')
    expect(payload.exp as number).toBeGreaterThan(Math.floor(Date.now() / 1000))
  })

  it('expired tokens are rejected', async () => {
    const token = await sign({ a: 1 }, SECRET, { expiresIn: -3600 })
    await expect(verify(token, SECRET)).rejects.toThrow()
  })

  it('audience and issuer are enforced', async () => {
    const token = await sign({ a: 1 }, SECRET, { audience: 'app-1', issuer: 'me' })
    await expect(verify(token, SECRET, { audience: 'app-1', issuer: 'me' })).resolves.toMatchObject(
      { a: 1 },
    )
    await expect(verify(token, SECRET, { audience: 'other' })).rejects.toThrow()
  })

  it('decode returns payload without verification', async () => {
    const token = await sign({ x: 42 }, SECRET)
    const payload = decode(token) as Record<string, unknown>
    expect(payload.x).toBe(42)
  })

  it('callback API works', async () => {
    await new Promise<void>((resolve, reject) => {
      sign({ x: 1 }, SECRET, undefined, (err, token) => {
        if (err || !token) return reject(err)
        verify(token, SECRET, undefined, (err2, payload) => {
          if (err2) return reject(err2)
          try {
            expect((payload as Record<string, number>).x).toBe(1)
            resolve()
          } catch (e) {
            reject(e)
          }
        })
      })
    })
  })
})
