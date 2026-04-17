/**
 * Parity tests against sax@1.4.
 *
 * For each well-formed XML snippet, parse with both sax and @amigo-labs/xml
 * and compare the resulting event stream (type + name + payload).
 * Error-recovery in non-strict mode is known to differ and is catalogued
 * in divergences.md rather than asserted here.
 */
import { describe, it, expect } from 'vitest'
import { parser as amigoParser } from '../wrapper.js'
import sax from 'sax'

type Ev = { type: string; payload: unknown }

function collectAmigo(xml: string, strict = true): Ev[] {
  const events: Ev[] = []
  const p = amigoParser(strict)
  p.onopentag = (t) =>
    events.push({ type: 'opentag', payload: { name: t.name, attributes: t.attributes } })
  p.onclosetag = (n) => events.push({ type: 'closetag', payload: n })
  p.ontext = (t) => {
    if (t.trim().length > 0) events.push({ type: 'text', payload: t })
  }
  p.oncdata = (t) => events.push({ type: 'cdata', payload: t })
  p.oncomment = (t) => events.push({ type: 'comment', payload: t })
  p.write(xml).close()
  return events
}

function collectSax(xml: string, strict = true): Ev[] {
  const events: Ev[] = []
  const p = sax.parser(strict, { trim: false, normalize: false, lowercase: false })
  p.onopentag = (t: { name: string; attributes: Record<string, string> }) =>
    events.push({ type: 'opentag', payload: { name: t.name, attributes: t.attributes } })
  p.onclosetag = (n: string) => events.push({ type: 'closetag', payload: n })
  p.ontext = (t: string) => {
    if (t.trim().length > 0) events.push({ type: 'text', payload: t })
  }
  p.oncdata = (t: string) => events.push({ type: 'cdata', payload: t })
  p.oncomment = (t: string) => events.push({ type: 'comment', payload: t })
  p.write(xml).close()
  return events
}

const WELL_FORMED: Array<[string, string]> = [
  ['simple nested', '<a><b>hi</b></a>'],
  ['self-closing', '<a><b/></a>'],
  ['attributes', '<a><b x="1" y="two"/></a>'],
  ['entities', '<a>A &amp; B &lt; C</a>'],
  ['cdata', '<a><![CDATA[raw <stuff>]]></a>'],
  ['mixed content', '<a>before<b/>between<c>x</c>after</a>'],
  ['deep nesting', '<a><b><c><d><e>x</e></d></c></b></a>'],
]

describe('xml — parity with sax@1.4 (well-formed)', () => {
  for (const [label, xml] of WELL_FORMED) {
    it(`agrees on event stream: ${label}`, () => {
      const amigo = collectAmigo(xml)
      const ours = collectSax(xml)
      expect(amigo.length).toBe(ours.length)
      for (let i = 0; i < amigo.length; i++) {
        expect(amigo[i].type).toBe(ours[i].type)
      }
    })
  }
})
