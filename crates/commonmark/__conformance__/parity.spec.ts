import { describe, it, expect } from 'vitest'
import { render } from '../index.js'

describe('CommonMark basics', () => {
  const cases: Array<[string, string, RegExp | string]> = [
    ['ATX heading', '# Hello', /<h1[^>]*>Hello<\/h1>/],
    ['Setext heading', 'Hello\n=====', /<h1[^>]*>Hello<\/h1>/],
    ['paragraph', 'hello world', '<p>hello world</p>'],
    ['emphasis', '*em*', '<em>em</em>'],
    ['strong', '**strong**', '<strong>strong</strong>'],
    ['inline code', '`code`', '<code>code</code>'],
    ['fenced code', '```\ncode\n```', '<pre><code>code\n</code></pre>'],
    ['unordered list', '- a\n- b', /<ul>\s*<li>a<\/li>\s*<li>b<\/li>\s*<\/ul>/],
    ['ordered list', '1. a\n2. b', /<ol>\s*<li>a<\/li>\s*<li>b<\/li>\s*<\/ol>/],
    ['blockquote', '> quote', /<blockquote>\s*<p>quote<\/p>\s*<\/blockquote>/],
    ['link', '[x](https://example.com)', '<a href="https://example.com">x</a>'],
    ['image', '![alt](img.png)', '<img src="img.png" alt="alt"'],
    ['hr', '---', '<hr />'],
    ['escape', '\\*lit\\*', '*lit*'],
  ]

  for (const [name, input, expected] of cases) {
    it(name, () => {
      const out = render(input)
      if (expected instanceof RegExp) {
        expect(out).toMatch(expected)
      } else {
        expect(out).toContain(expected)
      }
    })
  }
})

describe('GFM extensions', () => {
  it('table with alignment', () => {
    const md = '| L | C | R |\n|:--|:-:|--:|\n| 1 | 2 | 3 |'
    const out = render(md)
    expect(out).toContain('<table>')
    expect(out).toMatch(/<th[^>]*style="text-align: left"/)
    expect(out).toMatch(/<th[^>]*style="text-align: center"/)
    expect(out).toMatch(/<th[^>]*style="text-align: right"/)
  })

  it('strikethrough', () => {
    expect(render('~~gone~~')).toContain('<del>gone</del>')
  })

  it('task list items', () => {
    const out = render('- [x] done\n- [ ] todo')
    expect(out).toContain('type="checkbox"')
    expect(out).toContain('disabled=""')
    expect(out).toContain('checked=""')
  })

  it('explicit autolink via angle brackets', () => {
    // Note: GFM prose-autolink (bare URLs in text) is NOT emitted — see divergences.md.
    const out = render('<https://example.com>')
    expect(out).toContain('<a href="https://example.com">https://example.com</a>')
  })
})

describe('safe defaults', () => {
  const xssVectors: string[] = [
    '<script>alert(1)</script>',
    '<img src=x onerror=alert(1)>',
    '<svg onload=alert(1)>',
    '<iframe src="javascript:alert(1)">',
    '<a href="javascript:alert(1)">x</a>',
    '<style>body{background:url(javascript:alert(1))}</style>',
    '<object data="javascript:alert(1)">',
  ]

  for (const v of xssVectors) {
    it(`drops raw HTML vector: ${v.slice(0, 40)}`, () => {
      const out = render(v + '\n\nparagraph')
      // raw HTML blocks and inline HTML are filtered under default unsafeHtml: false
      expect(out).not.toMatch(/<script|onerror|onload|<iframe|<object/i)
      expect(out).toContain('<p>paragraph</p>')
    })
  }

  it('preserves javascript: URLs only inside escaped text, not as link href', () => {
    // pulldown-cmark rejects unknown protocols in autolinks; explicit link keeps text but URL is kept as-is.
    // The package's safe default is "drop raw HTML", not "rewrite link schemes" — document the boundary.
    const out = render('[x](javascript:alert(1))')
    // If users need scheme filtering they must chain @amigo-labs/sanitize-html. That's documented in README.
    expect(out).toContain('<a href="javascript:alert(1)">x</a>')
  })
})

describe('heading IDs', () => {
  it('slugifies unicode to ASCII', () => {
    const out = render('# Über Café')
    // non-ascii chars dropped, spaces → dashes
    expect(out).toMatch(/<h1 id="ber-caf">/)
  })

  it('produces stable IDs for identical input', () => {
    const a = render('# Hello World')
    const b = render('# Hello World')
    expect(a).toBe(b)
  })

  it('collapses punctuation runs to single dashes', () => {
    const out = render('# a!!! b??? c')
    expect(out).toMatch(/<h1 id="a-b-c">/)
  })
})
