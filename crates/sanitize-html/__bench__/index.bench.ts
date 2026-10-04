import { test } from 'vitest'
import { sanitize as amigoSanitize } from '../index.js'
// WASM is built as build output, not committed. On a fresh checkout
// run `pnpm build:wasm` before `pnpm bench` to include the WASM
// comparator; otherwise the bench skips those entries with a warning.
let wasmAmigoSanitize: typeof amigoSanitize | null = null
try {
  // @ts-expect-error — generated artifact path; not in source tree
  const mod = await import('../wasm/pkg/amigo_sanitize_html_wasm.js')
  wasmAmigoSanitize = mod.sanitize
} catch {
  console.warn('[bench] WASM artifact missing — run `pnpm build:wasm` to include WASM comparator')
}
import sanitizeHtml from 'sanitize-html'

let DOMPurify: { sanitize: (html: string) => string } | null = null

try {
  const mod = await import('isomorphic-dompurify')
  DOMPurify = mod.default
} catch {
  console.warn('isomorphic-dompurify not available, skipping')
}

// --- Fixtures ---

const smallSafe = '<p>Hello <b>world</b></p> <p>This is <i>safe</i> HTML.</p>'.repeat(3)

const mediumXss = `
<div class="content">
  <h1>Welcome</h1>
  <p>This is a <b>normal</b> paragraph with <a href="https://example.com">a link</a>.</p>
  <script>alert('xss')</script>
  <img src="x" onerror="alert(1)">
  <p onclick="steal()">Click me</p>
  <div style="background:url(javascript:alert(1))">styled</div>
  <svg onload="alert('svg')"><circle r="10"/></svg>
  <iframe src="https://evil.com"></iframe>
  <p>More <em>safe</em> content here with <strong>formatting</strong>.</p>
  <a href="javascript:alert(1)">dangerous link</a>
  <math><mtext><table><mglyph><style><!--</style><img src=x onerror=alert(1)//--></mglyph></table></mtext></math>
</div>
`.repeat(5)

const largeParagraphs = Array.from(
  { length: 1000 },
  (_, i) =>
    `<p>Paragraph ${i}: This is <b>bold</b>, <i>italic</i>, and <a href="https://example.com/${i}">a link</a>.</p>`,
).join('\n')

test('sanitize - small safe HTML (~200 chars)', async ({ bench }) => {
  await bench('@amigo-labs/sanitize-html (napi)', () => {
    amigoSanitize(smallSafe)
  }).run()
  if (wasmAmigoSanitize) await bench('@amigo-labs/sanitize-html (wasm)', () => { wasmAmigoSanitize!(smallSafe) }).run()
  await bench('sanitize-html (npm)', () => {
    sanitizeHtml(smallSafe)
  }).run()
  if (DOMPurify) {
    const dp = DOMPurify
    await bench('isomorphic-dompurify', () => {
      dp.sanitize(smallSafe)
    }).run()
  }
})

test('sanitize - medium with XSS (~2 KB)', async ({ bench }) => {
  await bench('@amigo-labs/sanitize-html (napi)', () => {
    amigoSanitize(mediumXss)
  }).run()
  if (wasmAmigoSanitize) await bench('@amigo-labs/sanitize-html (wasm)', () => { wasmAmigoSanitize!(mediumXss) }).run()
  await bench('sanitize-html (npm)', () => {
    sanitizeHtml(mediumXss)
  }).run()
  if (DOMPurify) {
    const dp = DOMPurify
    await bench('isomorphic-dompurify', () => {
      dp.sanitize(mediumXss)
    }).run()
  }
})

test('sanitize - large document (~100 KB)', async ({ bench }) => {
  await bench('@amigo-labs/sanitize-html (napi)', () => {
    amigoSanitize(largeParagraphs)
  }).run()
  if (wasmAmigoSanitize) await bench('@amigo-labs/sanitize-html (wasm)', () => { wasmAmigoSanitize!(largeParagraphs) }).run()
  await bench('sanitize-html (npm)', () => {
    sanitizeHtml(largeParagraphs)
  }).run()
  if (DOMPurify) {
    const dp = DOMPurify
    await bench('isomorphic-dompurify', () => {
      dp.sanitize(largeParagraphs)
    }).run()
  }
})
