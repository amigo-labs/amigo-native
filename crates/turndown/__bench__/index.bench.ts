import { bench, describe } from 'vitest'
import { turndown as ours } from '../index.js'
import TurndownService from 'turndown'

const svc = new TurndownService()

const SMALL = '<h1>Title</h1><p>A <strong>bold</strong> paragraph with <a href="/x">a link</a>.</p>'
const MEDIUM = (() => {
  const parts: string[] = ['<h1>Title</h1>']
  for (let i = 0; i < 30; i++) {
    parts.push(
      `<p>Paragraph ${i} with <em>italics</em>, <strong>bold</strong>, and a <a href="/p/${i}">link</a>.</p>`,
    )
  }
  return parts.join('')
})()

describe('small (~100 bytes)', () => {
  bench('@amigo-labs/turndown', () => {
    ours(SMALL)
  })
  bench('turndown', () => {
    svc.turndown(SMALL)
  })
})

describe('medium (~5 KB)', () => {
  bench('@amigo-labs/turndown', () => {
    ours(MEDIUM)
  })
  bench('turndown', () => {
    svc.turndown(MEDIUM)
  })
})
