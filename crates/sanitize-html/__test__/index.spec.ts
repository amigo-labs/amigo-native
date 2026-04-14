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
})
