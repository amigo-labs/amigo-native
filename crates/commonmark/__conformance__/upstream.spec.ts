import { describe, it, expect } from 'vitest'
import { render } from '../index.js'

/**
 * Representative cases from the CommonMark 0.30 and GFM spec test suites.
 * Upstream example numbers are from https://spec.commonmark.org/0.30/
 * and https://github.github.com/gfm/ where applicable.
 *
 * We do NOT run the full upstream test suite byte-identical — `pulldown-cmark`
 * is spec-conformant but differs from the reference renderer in tokenization
 * edge-cases (whitespace handling inside tight lists, entity resolution in
 * attributes, etc.). Divergences are tracked in `divergences.md`.
 */

describe('CommonMark spec — inlines', () => {
  it('ex 336: emphasis with underscore', () => {
    expect(render('_foo_')).toContain('<em>foo</em>')
  })

  it('ex 350: nested emphasis', () => {
    expect(render('**foo _bar_**')).toContain('<strong>foo <em>bar</em></strong>')
  })

  it('ex 473: link destination with angles', () => {
    expect(render('[link](<foo bar>)')).toContain('<a href="foo%20bar">link</a>')
  })

  it('ex 493: image with title', () => {
    const out = render('![foo](/url "title")')
    expect(out).toContain('<img src="/url" alt="foo" title="title"')
  })

  it('ex 622: hard line break with trailing spaces', () => {
    expect(render('foo  \nbar')).toMatch(/foo<br \/>\s*\n?bar/)
  })

  it('ex 624: soft line break', () => {
    expect(render('foo\nbar')).toMatch(/foo\s*\n?bar/)
  })
})

describe('CommonMark spec — blocks', () => {
  it('ex 44: ATX heading levels', () => {
    expect(render('### foo')).toContain('<h3 id="foo">foo</h3>')
    expect(render('###### foo')).toContain('<h6 id="foo">foo</h6>')
  })

  it('ex 77: setext heading', () => {
    expect(render('Foo\n---')).toContain('<h2 id="foo">Foo</h2>')
  })

  it('ex 119: indented code block', () => {
    // Note: pulldown-cmark omits the trailing newline inside <code>; see divergences.md.
    const out = render('    code')
    expect(out).toContain('<pre><code>code</code></pre>')
  })

  it('ex 200: blockquote with lazy continuation', () => {
    const out = render('> foo\nbar')
    expect(out).toContain('<blockquote>')
    expect(out).toContain('foo')
    expect(out).toContain('bar')
  })

  it('ex 253: loose list', () => {
    const out = render('- a\n\n- b')
    expect(out).toMatch(/<li>\s*<p>a<\/p>\s*<\/li>/)
  })

  it('ex 232: tight list', () => {
    const out = render('- a\n- b')
    expect(out).toMatch(/<li>a<\/li>/)
    expect(out).not.toMatch(/<li>\s*<p>a<\/p>/)
  })
})

describe('GFM spec — extensions', () => {
  it('ex 198: tables basic', () => {
    const md = '| foo | bar |\n| --- | --- |\n| baz | bim |'
    const out = render(md)
    expect(out).toContain('<table>')
    expect(out).toContain('<th>foo</th>')
    expect(out).toContain('<td>baz</td>')
  })

  it('ex 491: strikethrough — pulldown-cmark accepts single tilde (GFM spec: double only)', () => {
    expect(render('~~Hi~~')).toContain('<del>Hi</del>')
    // Divergence from GFM spec: pulldown-cmark treats ~X~ as strikethrough too.
    // See divergences.md — documented, stable, not treated as a bug.
    expect(render('~Hi~')).toContain('<del>Hi</del>')
  })

  it('ex 279: task list', () => {
    const out = render('- [x] done')
    expect(out).toContain('type="checkbox"')
    expect(out).toContain('checked=""')
  })

  it('autolink — angle-bracket URL', () => {
    // pulldown-cmark only autolinks explicit <url> form, not bare URLs in prose.
    // See divergences.md.
    const out = render('<https://example.com>')
    expect(out).toContain('<a href="https://example.com">https://example.com</a>')
  })

  it('autolink — angle-bracket email', () => {
    const out = render('<me@example.com>')
    expect(out).toContain('<a href="mailto:me@example.com">me@example.com</a>')
  })
})
