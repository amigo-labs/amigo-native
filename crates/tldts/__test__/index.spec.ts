import { describe, it, expect } from 'vitest'
import { parse, getDomain, getPublicSuffix, getHostname, parseMany } from '../index.js'

describe('tldts — smoke', () => {
  it('parses a typical subdomain.domain.tld', () => {
    const r = parse('https://foo.bar.example.com/some/path?q=1')
    expect(r.hostname).toBe('foo.bar.example.com')
    expect(r.domain).toBe('example.com')
    expect(r.subdomain).toBe('foo.bar')
    expect(r.publicSuffix).toBe('com')
    expect(r.isIp).toBe(false)
  })

  it('IP addresses are flagged isIp', () => {
    const r = parse('http://192.168.1.1')
    expect(r.isIp).toBe(true)
    expect(r.domain).toBeNull()
  })

  it('getDomain / getPublicSuffix / getHostname helpers', () => {
    expect(getDomain('http://www.example.com')).toBe('example.com')
    expect(getPublicSuffix('http://www.example.co.uk')).toBe('co.uk')
    expect(getHostname('http://www.example.com:8080/path')).toBe('www.example.com')
  })

  it('parseMany batches', () => {
    const r = parseMany(['a.example.com', 'b.example.co.uk', '192.168.1.1'])
    expect(r.domains.length).toBe(3)
    expect(r.domains[0]).toBe('example.com')
    expect(r.domains[2]).toBeNull()
    expect(r.flags.length).toBe(3)
  })
})
