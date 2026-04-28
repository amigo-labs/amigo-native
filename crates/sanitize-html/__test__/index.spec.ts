import { describe, it, expect } from 'vitest'
import { sanitize, isClean } from '../index.js'

describe('sanitize-html', () => {
  it('removes script tags', () => {
    expect(sanitize('<p>Hello</p><script>alert(1)</script>')).toBe('<p>Hello</p>')
  })

  it('strips event handlers', () => {
    expect(sanitize('<img onerror="alert(1)" src="x">')).not.toContain('onerror')
  })

  it('preserves safe tags by default', () => {
    expect(sanitize('<p><b>bold</b> <i>italic</i></p>')).toContain('<b>bold</b>')
  })

  it('custom allowed tags', () => {
    const result = sanitize('<b>bold</b> <i>italic</i> <u>underline</u>', {
      allowedTags: ['b'],
    })
    expect(result).toContain('<b>bold</b>')
    expect(result).not.toContain('<i>')
    expect(result).not.toContain('<u>')
  })

  it('strips dangerous attributes', () => {
    expect(sanitize('<a href="https://safe.com" onclick="evil()">link</a>')).not.toContain(
      'onclick',
    )
  })

  it('handles empty input', () => {
    expect(sanitize('')).toBe('')
  })

  it('handles large input', () => {
    const large = '<p>test</p>'.repeat(10000)
    const start = performance.now()
    sanitize(large)
    expect(performance.now() - start).toBeLessThan(500)
  })

  it('isClean detects dirty HTML', () => {
    expect(isClean('<script>bad</script>')).toBe(false)
  })

  it('isClean accepts safe HTML', () => {
    expect(isClean('hello world')).toBe(true)
  })

  it('caps deeply-nested input via maxDepth', () => {
    // 1000 levels of nesting; default maxDepth is 256 so the first 256
    // levels emit, the rest unwrap.
    const deep = '<div>'.repeat(1000) + 'x' + '</div>'.repeat(1000)
    const out = sanitize(deep)
    // Output remains finite and bounded; the unwrapped tail does not
    // cause any process-level OOM.
    expect(out.length).toBeGreaterThan(0)
    // Count opening <div> tags in the output: with cap=256 there should
    // be at most 256 of them.
    const opens = (out.match(/<div>/g) ?? []).length
    expect(opens).toBeLessThanOrEqual(256)
  })

  it('rejects oversize input via maxInputBytes', () => {
    const oversize = '<p>x</p>'.repeat(2_000_000) // ~16 MB > 5 MiB default
    expect(sanitize(oversize)).toBe('')
  })

  it('honours user-provided maxInputBytes override', () => {
    const small = '<p>hello world</p>'
    expect(sanitize(small, { maxInputBytes: 5 })).toBe('') // input larger than 5 bytes
    expect(sanitize(small, { maxInputBytes: 0 })).toBe('<p>hello world</p>') // disabled
  })
})
