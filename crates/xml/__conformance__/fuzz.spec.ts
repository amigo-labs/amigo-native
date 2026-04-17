import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { parseXml } from '../wrapper.js'

describe('xml fuzzing', () => {
  it('tolerant mode never throws on arbitrary input', () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        const events = parseXml(s, false)
        expect(Array.isArray(events)).toBe(true)
      }),
      { numRuns: 300, seed: 42 },
    )
  })

  it('well-formed tag: open/close pair is observed', () => {
    fc.assert(
      fc.property(fc.stringMatching(/^[a-z][a-z0-9]{0,8}$/), fc.string(), (tag, text) => {
        const clean = text.replace(/[<&>]/g, '')
        const input = `<${tag}>${clean}</${tag}>`
        const events = parseXml(input, false)
        const opens = events.filter((e) => e.kind === 'opentag' && e.name === tag)
        const closes = events.filter((e) => e.kind === 'closetag' && e.name === tag)
        expect(opens.length).toBe(1)
        expect(closes.length).toBe(1)
      }),
      { numRuns: 200, seed: 42 },
    )
  })

  it('attributes survive the roundtrip', () => {
    fc.assert(
      fc.property(
        fc.stringMatching(/^[a-z][a-z0-9]{0,6}$/),
        fc.stringMatching(/^[a-z][a-z0-9]{0,6}$/),
        fc.stringMatching(/^[a-zA-Z0-9 ]{0,20}$/),
        (tag, attrName, attrValue) => {
          fc.pre(tag !== attrName)
          const input = `<${tag} ${attrName}="${attrValue}"/>`
          const events = parseXml(input, false)
          const open = events.find((e) => e.kind === 'opentag' && e.name === tag)
          expect(open).toBeDefined()
          expect(open?.attrs?.find((a) => a.name === attrName)?.value).toBe(attrValue)
        },
      ),
      { numRuns: 100, seed: 42 },
    )
  })
})
