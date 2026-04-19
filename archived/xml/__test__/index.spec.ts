import { describe, it, expect } from 'vitest'
import { parser, parseXml } from '../wrapper.js'

describe('xml', () => {
  it('parseXml returns ordered events', () => {
    const events = parseXml('<a><b>hi</b></a>')
    expect(events.map((e) => e.kind)).toEqual([
      'opentag',
      'opentag',
      'text',
      'closetag',
      'closetag',
    ])
  })

  it('parser dispatches sax-style callbacks', () => {
    const calls: string[] = []
    const p = parser(true)
    p.onopentag = (tag) => calls.push(`open:${tag.name}`)
    p.onclosetag = (name) => calls.push(`close:${name}`)
    p.ontext = (text) => calls.push(`text:${text}`)
    p.write('<a><b>hi</b></a>').close()
    expect(calls).toEqual(['open:a', 'open:b', 'text:hi', 'close:b', 'close:a'])
  })

  it('handles attributes', () => {
    const seen: Record<string, string>[] = []
    const p = parser()
    p.onopentag = (tag) => seen.push(tag.attributes)
    p.write('<a x="1" y="two"/>').close()
    expect(seen).toEqual([{ x: '1', y: 'two' }])
  })

  it('self-closing emits open + close', () => {
    const log: string[] = []
    const p = parser()
    p.onopentag = (tag) => log.push(`open:${tag.name}:${tag.isSelfClosing}`)
    p.onclosetag = (n) => log.push(`close:${n}`)
    p.write('<a/>').close()
    expect(log).toEqual(['open:a:true', 'close:a'])
  })

  it('handles CDATA', () => {
    const log: string[] = []
    const p = parser()
    p.oncdata = (t) => log.push(`cdata:${t}`)
    p.write('<a><![CDATA[raw <stuff> here]]></a>').close()
    expect(log).toEqual(['cdata:raw <stuff> here'])
  })

  it('decodes entities in text', () => {
    let t = ''
    const p = parser()
    p.ontext = (text) => {
      t = text
    }
    p.write('<a>A &amp; B &lt; C</a>').close()
    expect(t).toBe('A & B < C')
  })

  it('calls onerror for malformed XML in strict mode', () => {
    let err: Error | null = null
    const p = parser(true)
    p.onerror = (e) => {
      err = e
    }
    p.write('<a></b>').close()
    expect(err).toBeTruthy()
  })

  it('calls onend after all events', () => {
    let ended = false
    const p = parser()
    p.onend = () => {
      ended = true
    }
    p.write('<a/>').close()
    expect(ended).toBe(true)
  })
})
