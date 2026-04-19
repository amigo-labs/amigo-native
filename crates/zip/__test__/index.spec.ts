import { describe, it, expect } from 'vitest'
import { ZipReader, ZipWriter } from '../index.js'

function makeZip(entries: Array<[string, string]>): Buffer {
  const w = new ZipWriter()
  for (const [name, content] of entries) {
    w.add(name, Buffer.from(content, 'utf-8'))
  }
  return w.finalize()
}

describe('zip', () => {
  it('round-trips a single file', () => {
    const zip = makeZip([['hello.txt', 'hello world']])
    const reader = ZipReader.fromBuffer(zip)
    const entries = reader.entries()
    expect(entries).toHaveLength(1)
    expect(entries[0].name).toBe('hello.txt')
    expect(reader.read('hello.txt').toString('utf-8')).toBe('hello world')
  })

  it('round-trips multiple files', () => {
    const zip = makeZip([
      ['a.txt', 'AAA'],
      ['nested/b.txt', 'BBB'],
      ['c.txt', 'CCC'.repeat(1000)],
    ])
    const reader = ZipReader.fromBuffer(zip)
    const entries = reader.entries()
    expect(entries.map((e) => e.name)).toEqual(['a.txt', 'nested/b.txt', 'c.txt'])
    expect(reader.read('a.txt').toString('utf-8')).toBe('AAA')
    expect(reader.read('nested/b.txt').toString('utf-8')).toBe('BBB')
    expect(reader.read('c.txt').toString('utf-8')).toBe('CCC'.repeat(1000))
  })

  it('supports stored compression', () => {
    const w = new ZipWriter()
    w.add('raw.bin', Buffer.from([1, 2, 3, 4, 5]), { compression: 'stored' })
    const zip = w.finalize()
    const r = ZipReader.fromBuffer(zip)
    const info = r.entries()[0]
    expect(info.compression.toLowerCase()).toContain('stored')
    expect(Array.from(r.read('raw.bin'))).toEqual([1, 2, 3, 4, 5])
  })

  it('throws for non-existent entry', () => {
    const zip = makeZip([['only.txt', 'x']])
    const r = ZipReader.fromBuffer(zip)
    expect(() => r.read('missing.txt')).toThrow()
  })

  it('extractAll returns every non-directory entry in one pass', () => {
    const zip = makeZip([
      ['a.txt', 'AAA'],
      ['nested/b.txt', 'BBB'],
      ['c.txt', 'CCC'],
    ])
    const out = ZipReader.fromBuffer(zip).extractAll()
    expect(out.map((e) => e.name)).toEqual(['a.txt', 'nested/b.txt', 'c.txt'])
    expect(out[0].data.toString('utf-8')).toBe('AAA')
    expect(out[1].data.toString('utf-8')).toBe('BBB')
    expect(out[2].data.toString('utf-8')).toBe('CCC')
  })

  it('throws after finalize', () => {
    const w = new ZipWriter()
    w.add('a', Buffer.from('x'))
    w.finalize()
    expect(() => w.add('b', Buffer.from('y'))).toThrow()
    expect(() => w.finalize()).toThrow()
  })
})
