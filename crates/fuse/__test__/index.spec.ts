import { describe, it, expect } from 'vitest'
import { Fuse } from '../index.js'

describe('fuse — smoke', () => {
  const records = [
    JSON.stringify({ title: 'The Old Man and the Sea', author: 'Hemingway' }),
    JSON.stringify({ title: 'War and Peace', author: 'Tolstoy' }),
    JSON.stringify({ title: 'Moby Dick', author: 'Melville' }),
  ]

  it('returns matches in ranking order', () => {
    const fuse = new Fuse(records, { keys: [{ name: 'title' }, { name: 'author' }] })
    const results = fuse.search('peace')
    expect(results.length).toBeGreaterThan(0)
    expect(results[0]?.refIndex).toBe(1)
  })

  it('respects limit', () => {
    const fuse = new Fuse(records, { keys: [{ name: 'title' }] })
    const results = fuse.search('the', 1)
    expect(results.length).toBeLessThanOrEqual(1)
  })

  it('empty query yields no results', () => {
    const fuse = new Fuse(records, { keys: [{ name: 'title' }] })
    expect(fuse.search('').length).toBe(0)
  })

  it('size matches record count', () => {
    const fuse = new Fuse(records, { keys: [{ name: 'title' }] })
    expect(fuse.size()).toBe(3)
  })
})
