import { describe, expect, it } from 'vitest'
import { turndown, turndownBatch } from '../index.js'

describe('turndown', () => {
  it('converts a heading', () => {
    expect(turndown('<h1>Hello</h1>')).toBe('# Hello')
  })

  it('supports h2–h6', () => {
    expect(turndown('<h3>sub</h3>')).toBe('### sub')
  })

  it('converts paragraphs', () => {
    expect(turndown('<p>a</p><p>b</p>')).toBe('a\n\nb')
  })

  it('bold + italic', () => {
    expect(turndown('<p><strong>x</strong> <em>y</em></p>')).toBe('**x** _y_')
  })

  it('link', () => {
    expect(turndown('<a href="/x">click</a>')).toBe('[click](/x)')
  })

  it('link with title', () => {
    const out = turndown('<a href="/x" title="Hi">click</a>')
    expect(out).toBe('[click](/x "Hi")')
  })

  it('image', () => {
    expect(turndown('<img src="/x.png" alt="X"/>')).toBe('![X](/x.png)')
  })

  it('unordered list', () => {
    expect(turndown('<ul><li>a</li><li>b</li></ul>')).toBe('* a\n* b')
  })

  it('ordered list', () => {
    expect(turndown('<ol><li>a</li><li>b</li></ol>')).toBe('1. a\n2. b')
  })

  it('inline code', () => {
    expect(turndown('<p>use <code>x</code></p>')).toBe('use `x`')
  })

  it('pre/code indented (default)', () => {
    const out = turndown('<pre><code>x\ny</code></pre>')
    expect(out).toContain('    x')
    expect(out).toContain('    y')
  })

  it('pre/code fenced with lang', () => {
    const out = turndown('<pre><code class="language-rust">fn main(){}</code></pre>', {
      codeBlockStyle: 'fenced',
    })
    expect(out.startsWith('```rust')).toBe(true)
    expect(out).toContain('fn main')
  })

  it('blockquote', () => {
    expect(turndown('<blockquote><p>q</p></blockquote>').startsWith('> ')).toBe(true)
  })

  it('hr', () => {
    expect(turndown('<hr/>')).toBe('* * *')
  })

  it('gfm strikethrough', () => {
    expect(turndown('<del>x</del>', { gfm: true })).toBe('~~x~~')
  })

  it('gfm table', () => {
    const out = turndown(
      '<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>',
      { gfm: true },
    )
    expect(out).toContain('| A | B |')
    expect(out).toContain('| --- | --- |')
    expect(out).toContain('| 1 | 2 |')
  })

  it('respects remove', () => {
    const out = turndown('<p>keep</p><aside>drop</aside>', { remove: ['aside'] })
    expect(out).not.toContain('drop')
    expect(out).toContain('keep')
  })

  it('respects bulletListMarker', () => {
    expect(turndown('<ul><li>a</li></ul>', { bulletListMarker: '-' })).toBe('- a')
  })

  it('setext heading', () => {
    const out = turndown('<h1>Hi</h1>', { headingStyle: 'setext' })
    expect(out).toContain('Hi')
    expect(out).toContain('===')
  })
})

describe('turndownBatch', () => {
  it('maps an array', () => {
    const out = turndownBatch(['<h1>A</h1>', '<p>B</p>'])
    expect(out).toEqual(['# A', 'B'])
  })
})
