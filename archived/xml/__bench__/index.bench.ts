import { bench, describe } from 'vitest'
import { parser as amigoParser, parseXml as amigoParseXml } from '../wrapper.js'
import sax from 'sax'

const smallSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M0 0 L10 10"/></svg>'

function makeRss(items: number): string {
  const parts = ['<?xml version="1.0"?><rss version="2.0"><channel><title>bench</title>']
  for (let i = 0; i < items; i++) {
    parts.push(
      `<item><title>item ${i}</title><link>https://example.com/${i}</link><description>desc ${i}</description></item>`,
    )
  }
  parts.push('</channel></rss>')
  return parts.join('')
}

function makeSoap(bytes: number): string {
  const base = '<env:Envelope xmlns:env="http://schemas.xmlsoap.org/soap/envelope/"><env:Body>'
  const end = '</env:Body></env:Envelope>'
  let body = ''
  const repeat = '<Record><Field name="a">value</Field><Field name="b">another</Field></Record>'
  while (body.length < bytes) body += repeat
  return `${base}${body}${end}`
}

const mediumRss = makeRss(600) // ~100KB
const largeSoap = makeSoap(10 * 1024 * 1024)

describe('xml — small SVG (1KB)', () => {
  bench('@amigo-labs/xml (parseXml)', () => {
    amigoParseXml(smallSvg)
  })
  bench('@amigo-labs/xml (sax API)', () => {
    const p = amigoParser()
    p.onopentag = () => {}
    p.onclosetag = () => {}
    p.write(smallSvg).close()
  })
  bench('sax', () => {
    const p = sax.parser(true, {})
    p.onopentag = () => {}
    p.onclosetag = () => {}
    p.write(smallSvg).close()
  })
})

describe('xml — RSS feed (100KB)', () => {
  bench('@amigo-labs/xml', () => {
    amigoParseXml(mediumRss)
  })
  bench('sax', () => {
    const p = sax.parser(true, {})
    p.onopentag = () => {}
    p.onclosetag = () => {}
    p.ontext = () => {}
    p.write(mediumRss).close()
  })
})

describe('xml — SOAP response (10MB)', () => {
  bench('@amigo-labs/xml', () => {
    amigoParseXml(largeSoap)
  })
  bench('sax', () => {
    const p = sax.parser(true, {})
    p.onopentag = () => {}
    p.onclosetag = () => {}
    p.ontext = () => {}
    p.write(largeSoap).close()
  })
})
