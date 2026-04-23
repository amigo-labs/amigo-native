// Fixture-style tests modeled on turndown's upstream behaviour.

import { describe, expect, it } from 'vitest'
import { turndown } from '../index.js'

describe('turndown README examples', () => {
  it('converts a blog post', () => {
    const html = `<h1>Post title</h1><p>An intro.</p><p>A <strong>bold</strong> statement.</p>`
    const md = turndown(html)
    expect(md).toContain('# Post title')
    expect(md).toContain('**bold**')
  })

  it('strips script/style', () => {
    const html =
      '<p>keep</p><script>alert(1)</script><style>.x{}</style><p>keep2</p>'
    const md = turndown(html)
    expect(md).not.toContain('alert')
    expect(md).not.toContain('.x')
  })

  it('handles nested lists', () => {
    const html = '<ul><li>a<ul><li>a1</li></ul></li><li>b</li></ul>'
    const md = turndown(html)
    expect(md).toContain('a')
    expect(md).toContain('a1')
    expect(md).toContain('b')
  })

  it('handles an image inside a link', () => {
    const html = '<a href="/p"><img src="/img.png" alt="pic"/></a>'
    const md = turndown(html)
    expect(md).toContain('![pic](/img.png)')
  })
})
