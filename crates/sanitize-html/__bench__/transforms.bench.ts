import { bench, describe } from 'vitest'
import { sanitize as amigoSanitize } from '../index.js'
import sanitizeHtml from 'sanitize-html'

// ---------------------------------------------------------------------------
// Phase 3 architecture bench: which of the three candidate implementations
// of sanitize-html's `transformTags` is fastest for our native crate?
//
//   A) sanitize-html (npm)        — baseline JS implementation
//   B) regex-wrapper + amigo       — lightweight JS rename pass over the
//                                    input, then native sanitize for cleaning
//   C) htmlparser2-wrapper + amigo — proper tokenizer pass in JS with
//                                    per-tag transform callbacks, then
//                                    native sanitize
//
// A ThreadsafeFunction-in-Rust approach (D) is not benched directly — we
// estimate its upper bound from B/C: the FFI boundary dominates TSFN cost
// and each Rust→JS callback trip is ~500 ns–2 µs, so 1000 transform tags
// add 0.5–2 ms on top of a native parse. Numbers below confirm whether
// that's competitive with B/C.
// ---------------------------------------------------------------------------

// The default sanitize-html allowlist with 'ul' and 'iframe' added so the
// transform target + test iframes survive.
const ALLOWED_TAGS = [
  'address', 'article', 'aside', 'footer', 'header', 'h1', 'h2', 'h3', 'h4',
  'h5', 'h6', 'hgroup', 'main', 'nav', 'section',
  'blockquote', 'dd', 'div', 'dl', 'dt', 'figcaption', 'figure', 'hr', 'li',
  'ol', 'p', 'pre', 'ul', 'iframe', 'img',
  'a', 'abbr', 'b', 'bdi', 'bdo', 'br', 'cite', 'code', 'data', 'dfn', 'em',
  'i', 'kbd', 'mark', 'q', 'ruby', 's', 'samp', 'small', 'span', 'strong',
  'sub', 'sup', 'time', 'u', 'var', 'wbr', 'caption', 'col', 'colgroup',
  'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'tr',
]

// --- Regex-wrapper transform (Candidate B) ---

function regexTransform(
  html: string,
  renameMap: Record<string, string>,
): string {
  const pattern = new RegExp(
    `<(/?)(${Object.keys(renameMap).join('|')})(\\b[^>]*)>`,
    'gi',
  )
  return html.replace(pattern, (_m, slash, tag, rest) => {
    const lower = tag.toLowerCase()
    const next = renameMap[lower] ?? tag
    return `<${slash}${next}${rest}>`
  })
}

function regexWrapperSanitize(
  html: string,
  transformTags: Record<string, string>,
  opts: { allowedTags: string[] },
): string {
  const pre = regexTransform(html, transformTags)
  return amigoSanitize(pre, opts as never)
}

// --- htmlparser2-wrapper transform (Candidate C) ---
// Minimal hand-rolled tokenizer. Enough to drive a per-tag callback without
// pulling htmlparser2 as a new dep. Not a full HTML5 parser — only good for
// benches of well-formed input.

type TagTransform = (
  tagName: string,
  attribs: Record<string, string>,
) => { tagName: string; attribs: Record<string, string> } | null

function parseAttribs(rest: string): Record<string, string> {
  const attribs: Record<string, string> = {}
  const re = /([a-zA-Z_:][\w:.-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g
  let m: RegExpExecArray | null
  while ((m = re.exec(rest)) !== null) {
    attribs[m[1]] = m[2] ?? m[3] ?? m[4] ?? ''
  }
  return attribs
}

function formatAttribs(attribs: Record<string, string>): string {
  const parts: string[] = []
  for (const [k, v] of Object.entries(attribs)) {
    parts.push(v === '' ? ` ${k}` : ` ${k}="${v.replace(/"/g, '&quot;')}"`)
  }
  return parts.join('')
}

function tokenizerTransform(html: string, transforms: Record<string, TagTransform>): string {
  let out = ''
  let i = 0
  while (i < html.length) {
    const lt = html.indexOf('<', i)
    if (lt < 0) {
      out += html.slice(i)
      break
    }
    out += html.slice(i, lt)
    const gt = html.indexOf('>', lt)
    if (gt < 0) {
      out += html.slice(lt)
      break
    }
    const raw = html.slice(lt, gt + 1)
    // Skip comments, doctypes, CDATA — no transform applied
    if (raw.startsWith('<!') || raw.startsWith('<?')) {
      out += raw
      i = gt + 1
      continue
    }
    const m = /^<(\/?)([a-zA-Z][\w-]*)(.*?)(\/?)>$/s.exec(raw)
    if (!m) {
      out += raw
      i = gt + 1
      continue
    }
    const [, slash, tag, rest, selfClose] = m
    const xform = transforms[tag.toLowerCase()]
    if (slash || !xform) {
      out += raw
      i = gt + 1
      continue
    }
    const attribs = parseAttribs(rest)
    const res = xform(tag, attribs)
    if (!res) {
      i = gt + 1
      continue
    }
    out += `<${res.tagName}${formatAttribs(res.attribs)}${selfClose}>`
    i = gt + 1
  }
  return out
}

function tokenizerWrapperSanitize(
  html: string,
  transforms: Record<string, TagTransform>,
  opts: { allowedTags: string[] },
): string {
  const pre = tokenizerTransform(html, transforms)
  return amigoSanitize(pre, opts as never)
}

// --- Fixtures ---

const smallDoc = '<ol><li>a</li><li>b</li><li>c</li></ol><p>hi <b>bold</b></p>'
const mediumDoc = Array.from(
  { length: 100 },
  (_, i) => `<ol><li>item ${i}</li></ol><p>After list ${i}.</p>`,
).join('\n')
const heavyDoc = Array.from(
  { length: 1000 },
  (_, i) => `<ol class="c${i}"><li>x</li></ol>`,
).join('')

// --- Benchmarks ---

describe('transform ol→ul (simple rename) - small (~80B)', () => {
  bench('sanitize-html (npm)', () => {
    sanitizeHtml(smallDoc, {
      allowedTags: ALLOWED_TAGS,
      transformTags: { ol: 'ul' },
    })
  })
  bench('regex-wrapper + amigo', () => {
    regexWrapperSanitize(smallDoc, { ol: 'ul' }, { allowedTags: ALLOWED_TAGS })
  })
  bench('tokenizer-wrapper + amigo', () => {
    tokenizerWrapperSanitize(
      smallDoc,
      { ol: (_, attribs) => ({ tagName: 'ul', attribs }) },
      { allowedTags: ALLOWED_TAGS },
    )
  })
  bench('amigo (baseline, no transform)', () => {
    amigoSanitize(smallDoc, { allowedTags: ALLOWED_TAGS } as never)
  })
})

describe('transform ol→ul - medium (~6KB, 100 lists)', () => {
  bench('sanitize-html (npm)', () => {
    sanitizeHtml(mediumDoc, {
      allowedTags: ALLOWED_TAGS,
      transformTags: { ol: 'ul' },
    })
  })
  bench('regex-wrapper + amigo', () => {
    regexWrapperSanitize(mediumDoc, { ol: 'ul' }, { allowedTags: ALLOWED_TAGS })
  })
  bench('tokenizer-wrapper + amigo', () => {
    tokenizerWrapperSanitize(
      mediumDoc,
      { ol: (_, attribs) => ({ tagName: 'ul', attribs }) },
      { allowedTags: ALLOWED_TAGS },
    )
  })
  bench('amigo (baseline, no transform)', () => {
    amigoSanitize(mediumDoc, { allowedTags: ALLOWED_TAGS } as never)
  })
})

describe('transform ol→ul - heavy (~40KB, 1000 transforms)', () => {
  bench('sanitize-html (npm)', () => {
    sanitizeHtml(heavyDoc, {
      allowedTags: ALLOWED_TAGS,
      transformTags: { ol: 'ul' },
    })
  })
  bench('regex-wrapper + amigo', () => {
    regexWrapperSanitize(heavyDoc, { ol: 'ul' }, { allowedTags: ALLOWED_TAGS })
  })
  bench('tokenizer-wrapper + amigo', () => {
    tokenizerWrapperSanitize(
      heavyDoc,
      { ol: (_, attribs) => ({ tagName: 'ul', attribs }) },
      { allowedTags: ALLOWED_TAGS },
    )
  })
  bench('amigo (baseline, no transform)', () => {
    amigoSanitize(heavyDoc, { allowedTags: ALLOWED_TAGS } as never)
  })
})

// Attribute-mutation transform — can't be done with regex alone
describe('transform rewrite ol→ul + add class (attribute mutation) - 1000 tags', () => {
  const xform = (_: string, attribs: Record<string, string>) => ({
    tagName: 'ul',
    attribs: { ...attribs, class: `${attribs.class ?? ''} transformed`.trim() },
  })
  bench('sanitize-html (npm)', () => {
    sanitizeHtml(heavyDoc, {
      allowedTags: [...ALLOWED_TAGS],
      allowedAttributes: { ul: ['class'], ol: ['class'] },
      transformTags: {
        ol: (tag, attribs) => ({
          tagName: 'ul',
          attribs: { ...attribs, class: `${attribs.class ?? ''} transformed`.trim() },
        }),
      },
    })
  })
  bench('tokenizer-wrapper + amigo', () => {
    tokenizerWrapperSanitize(
      heavyDoc,
      { ol: xform },
      { allowedTags: [...ALLOWED_TAGS] },
    )
  })
})
