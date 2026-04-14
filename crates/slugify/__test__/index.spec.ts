import { describe, it, expect } from 'vitest'
import { slugify, slugifyWithSeparator } from '../index.js'

describe('slugify', () => {
  it('basic ascii', () => {
    expect(slugify('Hello World')).toBe('hello-world')
  })

  it('german umlauts', () => {
    expect(slugify('Ärger über Übel')).toBe('arger-uber-ubel')
  })

  it('special chars', () => {
    expect(slugify('foo@bar#baz!')).toBe('foo-bar-baz')
  })

  it('multiple spaces', () => {
    expect(slugify('a   b   c')).toBe('a-b-c')
  })

  it('leading/trailing', () => {
    expect(slugify('  hello  ')).toBe('hello')
  })

  it('empty string', () => {
    expect(slugify('')).toBe('')
  })

  it('numbers', () => {
    expect(slugify('ES2024 rocks')).toBe('es2024-rocks')
  })

  it('custom separator', () => {
    expect(slugifyWithSeparator('Hello World', '_')).toBe('hello_world')
  })
})
