/**
 * Core parity smoke against deepmerge@4. The exhaustive case matrix
 * lives in `upstream.spec.ts`; this file is the contract gate that
 * every release must pass.
 */
import { describe, it, expect } from 'vitest'
import amigoMerge from '../wrapper.js'
import upstream from 'deepmerge'

describe('deepmerge — parity gate', () => {
  it('flat object merge matches upstream', () => {
    const a = { x: 1, y: 2 }
    const b = { y: 99, z: 3 }
    expect(amigoMerge(a, b)).toEqual(upstream(a, b))
  })

  it('deep nested merge matches upstream', () => {
    const a = { x: { a: 1, y: { z: 1 } } }
    const b = { x: { b: 2, y: { w: 2 } } }
    expect(amigoMerge(a, b)).toEqual(upstream(a, b))
  })

  it('default array concat matches upstream', () => {
    const a = { l: [1, 2] }
    const b = { l: [3, 4] }
    expect(amigoMerge(a, b)).toEqual(upstream(a, b))
  })

  it('__proto__ pollution is filtered (matches upstream)', () => {
    const poison = JSON.parse('{"__proto__": {"polluted": true}}')
    const amigo = amigoMerge({}, poison) as Record<string, unknown>
    const ups = upstream({}, poison) as Record<string, unknown>
    expect(amigo.polluted).toBeUndefined()
    expect(ups.polluted).toBeUndefined()
  })
})
