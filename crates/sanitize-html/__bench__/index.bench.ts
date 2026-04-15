import { bench, describe, beforeAll } from 'vitest'
import { sanitize as amigoSanitize } from '../index.js'
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

describe('sanitize - small safe HTML (~200 chars)', () => {
  bench('@amigo-labs/sanitize-html', () => {
    amigoSanitize(smallSafe)
  })
  bench('sanitize-html (npm)', () => {
    sanitizeHtml(smallSafe)
  })
  if (DOMPurify) {
    const dp = DOMPurify
    bench('isomorphic-dompurify', () => {
      dp.sanitize(smallSafe)
    })
  }
})

describe('sanitize - medium with XSS (~2 KB)', () => {
  bench('@amigo-labs/sanitize-html', () => {
    amigoSanitize(mediumXss)
  })
  bench('sanitize-html (npm)', () => {
    sanitizeHtml(mediumXss)
  })
  if (DOMPurify) {
    const dp = DOMPurify
    bench('isomorphic-dompurify', () => {
      dp.sanitize(mediumXss)
    })
  }
})

describe('sanitize - large document (~100 KB)', () => {
  bench('@amigo-labs/sanitize-html', () => {
    amigoSanitize(largeParagraphs)
  })
  bench('sanitize-html (npm)', () => {
    sanitizeHtml(largeParagraphs)
  })
  if (DOMPurify) {
    const dp = DOMPurify
    bench('isomorphic-dompurify', () => {
      dp.sanitize(largeParagraphs)
    })
  }
})
