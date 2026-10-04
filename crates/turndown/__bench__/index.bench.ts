import { test } from 'vitest'
import { turndown as ours } from '../index.js'
// WASM is built as build output, not committed. On a fresh checkout
// run `pnpm build:wasm` before `pnpm bench` to include the WASM
// comparator; otherwise the bench skips those entries with a warning.
let wasmOurs: typeof ours | null = null
try {
  // @ts-expect-error — generated artifact path; not in source tree
  const mod = await import('../wasm/pkg/amigo_turndown_wasm.js')
  wasmOurs = mod.turndown
} catch {
  console.warn('[bench] WASM artifact missing — run `pnpm build:wasm` to include WASM comparator')
}
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

test('small (~100 bytes)', async ({ bench }) => {
  await bench('@amigo-labs/turndown (napi)', () => {
    ours(SMALL)
  }).run()
  if (wasmOurs) await bench('@amigo-labs/turndown (wasm)', () => { wasmOurs!(SMALL) }).run()
  await bench('turndown', () => {
    svc.turndown(SMALL)
  }).run()
})

test('medium (~5 KB)', async ({ bench }) => {
  await bench('@amigo-labs/turndown (napi)', () => {
    ours(MEDIUM)
  }).run()
  if (wasmOurs) await bench('@amigo-labs/turndown (wasm)', () => { wasmOurs!(MEDIUM) }).run()
  await bench('turndown', () => {
    svc.turndown(MEDIUM)
  }).run()
})
