import { describe, it, expect } from 'vitest'
import { render, renderMany, Renderer } from '../index.js'

describe('render', () => {
  it('renders a paragraph', () => {
    expect(render('hello **world**')).toBe('<p>hello <strong>world</strong></p>\n')
  })

  it('renders fenced code blocks with language class', () => {
    const out = render('```js\nconst x = 1\n```')
    expect(out).toContain('<pre><code class="language-js">')
    expect(out).toContain('const x = 1')
  })

  it('enables GFM tables by default', () => {
    const md = '| a | b |\n|---|---|\n| 1 | 2 |'
    const out = render(md)
    expect(out).toContain('<table>')
    expect(out).toContain('<th>a</th>')
    expect(out).toContain('<td>1</td>')
  })

  it('enables strikethrough by default', () => {
    expect(render('~~gone~~')).toContain('<del>gone</del>')
  })

  it('enables task lists by default', () => {
    const out = render('- [x] done\n- [ ] todo')
    expect(out).toContain('type="checkbox"')
    expect(out).toContain('checked=""')
  })

  it('auto-generates heading IDs by default', () => {
    const out = render('# Hello World')
    expect(out).toBe('<h1 id="hello-world">Hello World</h1>\n')
  })

  it('deduplicates repeated heading IDs', () => {
    const out = render('# Intro\n## Intro\n### Intro')
    expect(out).toContain('id="intro"')
    expect(out).toContain('id="intro-1"')
    expect(out).toContain('id="intro-2"')
  })

  it('respects headingIds: false', () => {
    const out = render('# Hello', { headingIds: false })
    expect(out).toBe('<h1>Hello</h1>\n')
  })

  it('filters raw HTML by default (unsafeHtml: false)', () => {
    const out = render('<script>alert(1)</script>\n\nsafe')
    expect(out).not.toContain('<script>')
    expect(out).toContain('<p>safe</p>')
  })

  it('allows raw HTML when unsafeHtml: true', () => {
    const out = render('<div>raw</div>', { unsafeHtml: true })
    expect(out).toContain('<div>raw</div>')
  })

  it('disables GFM when gfm: false', () => {
    const md = '| a | b |\n|---|---|\n| 1 | 2 |'
    const out = render(md, { gfm: false })
    expect(out).not.toContain('<table>')
  })
})

describe('renderMany', () => {
  it('renders a batch of documents', () => {
    const out = renderMany(['# a', '# b', '# c'])
    expect(out).toHaveLength(3)
    expect(out[0]).toContain('>a</h1>')
    expect(out[1]).toContain('>b</h1>')
    expect(out[2]).toContain('>c</h1>')
  })

  it('deduplicates heading IDs per document, not across', () => {
    const out = renderMany(['# Same', '# Same'])
    // each document starts fresh — both get id="same", no suffix
    expect(out[0]).toContain('id="same"')
    expect(out[1]).toContain('id="same"')
    expect(out[0]).not.toContain('id="same-1"')
  })

  it('handles empty array', () => {
    expect(renderMany([])).toEqual([])
  })
})

describe('Renderer', () => {
  it('reuses options across renders', () => {
    const r = new Renderer({ headingIds: false, gfm: false })
    expect(r.render('# Hello')).toBe('<h1>Hello</h1>\n')
    const md = '| a | b |\n|---|---|\n| 1 | 2 |'
    expect(r.render(md)).not.toContain('<table>')
  })

  it('defaults match the free function', () => {
    const r = new Renderer()
    expect(r.render('# Hi')).toBe(render('# Hi'))
  })

  it('deduplicates heading IDs per render call, not across calls', () => {
    const r = new Renderer()
    expect(r.render('# Same')).toContain('id="same"')
    expect(r.render('# Same')).toContain('id="same"')
  })
})
