// @ts-check
/**
 * sanitize-html-compatible wrapper around the native @amigo-labs/sanitize-html
 * binding. Exists so callers who want a drop-in replacement for sanitize-html
 * get the same loose option shapes and feature surface (transformTags,
 * exclusiveFilter, textFilter, allowedIframeHostnames, …) while the core
 * cleaning still runs in Rust via ammonia.
 *
 * Architecture (see `__bench__/transforms.bench.ts` for the numbers that
 * informed this split):
 *   - string-only `transformTags` → regex rename pre-pass (~1.6x faster
 *     than sanitize-html JS on a 40KB/1000-tag doc).
 *   - callback `transformTags` / `exclusiveFilter` / `textFilter` →
 *     htmlparser2 tokenizer pre-pass, then native sanitize.
 *
 * This file intentionally duplicates no logic from the Rust crate; it is a
 * pure JS compatibility shim.
 */

import { Parser } from 'htmlparser2'
import { sanitize as amigoSanitize } from './index.js'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VOID_ELEMENTS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'keygen', 'link', 'meta', 'param', 'source', 'track', 'wbr',
])

const DEFAULT_ALLOWED_TAGS = [
  'address', 'article', 'aside', 'footer', 'header', 'h1', 'h2', 'h3', 'h4',
  'h5', 'h6', 'hgroup', 'main', 'nav', 'section',
  'blockquote', 'dd', 'div', 'dl', 'dt', 'figcaption', 'figure', 'hr', 'li',
  'main', 'ol', 'p', 'pre', 'ul',
  'a', 'abbr', 'b', 'bdi', 'bdo', 'br', 'cite', 'code', 'data', 'dfn', 'em',
  'i', 'kbd', 'mark', 'q', 'rb', 'rp', 'rt', 'rtc', 'ruby', 's', 'samp',
  'small', 'span', 'strong', 'sub', 'sup', 'time', 'u', 'var', 'wbr', 'caption',
  'col', 'colgroup', 'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'tr',
]

const DEFAULT_ALLOWED_ATTRIBUTES = {
  a: ['href', 'name', 'target'],
  img: ['src'],
}

const MEDIA_TAGS = new Set(['audio', 'video', 'img', 'picture', 'source', 'track', 'iframe', 'embed', 'object'])

const HARNESS_POSTPROCESS_OPTIONS = [
  'allowedIframeHostnames',
  'allowedIframeDomains',
  'allowIframeRelativeUrls',
  'allowProtocolRelative',
]

// Options we apply in JS and must strip before passing to the native sanitize
// because the typed Rust struct doesn't know about them.
const JS_ONLY_OPTIONS = new Set([
  'transformTags',
  'exclusiveFilter',
  'textFilter',
  ...HARNESS_POSTPROCESS_OPTIONS,
  // Accepted-but-ignored options so the shim doesn't reject
  // sanitize-html-style configs.
  'allowedSchemes',
  'allowedSchemesAppliedToAttributes',
  'allowedSchemesByTag',
  'allowIframeRelativeUrls',
  'allowedStyles',
  'parseStyleAttributes',
  'disallowedTagsMode',
  'nestingLimit',
  'nonTextTags',
  'nonBooleanAttributes',
  'allowedEmptyAttributes',
  'allowedScriptDomains',
  'allowedScriptHostnames',
  'allowedClasses',
  'allowVulnerableTags',
  'enforceHtmlBoundary',
])

// ---------------------------------------------------------------------------
// Option normalisation — mirrors sanitize-html's loose-option semantics
// ---------------------------------------------------------------------------

function normaliseOptions(options) {
  if (!options || typeof options !== 'object') return undefined
  const opts = { ...options }

  if ('allowedTags' in opts) {
    const v = opts.allowedTags
    if (v === false) {
      opts.allowedTags = DEFAULT_ALLOWED_TAGS
    } else if (!Array.isArray(v)) {
      opts.allowedTags = []
    }
  }

  // Ammonia's default <a> attribute list doesn't include `target`, which
  // sanitize-html's default does. When no allowedAttributes was provided,
  // inject sanitize-html's defaults so tests that rely on the baseline work.
  if (!('allowedAttributes' in opts)) {
    opts.allowedAttributes = { ...DEFAULT_ALLOWED_ATTRIBUTES }
  } else {
    const v = opts.allowedAttributes
    if (v === false) {
      delete opts.allowedAttributes
    } else if (typeof v !== 'object' || v === null || Array.isArray(v)) {
      opts.allowedAttributes = {}
    } else {
      const cleaned = {}
      const wildcardAttrs = Array.isArray(v['*'])
        ? v['*'].filter((a) => typeof a === 'string')
        : null
      for (const [tag, attrs] of Object.entries(v)) {
        if (tag === '*') continue // handled below
        if (Array.isArray(attrs)) {
          cleaned[tag] = attrs.filter((a) => typeof a === 'string')
        }
      }
      // Expand `'*'` wildcard across a broad set of tags so the attribute
      // actually survives (ammonia has no per-tag wildcard).
      if (wildcardAttrs && wildcardAttrs.length) {
        const tags = Array.isArray(opts.allowedTags) ? opts.allowedTags : DEFAULT_ALLOWED_TAGS
        for (const tag of tags) {
          cleaned[tag] = [...new Set([...(cleaned[tag] ?? []), ...wildcardAttrs])]
        }
      }
      opts.allowedAttributes = cleaned
    }
  }

  if ('allowedClasses' in opts) {
    const v = opts.allowedClasses
    if (typeof v !== 'object' || v === null || Array.isArray(v)) {
      opts.allowedClasses = {}
    } else {
      const cleaned = {}
      for (const [tag, classes] of Object.entries(v)) {
        if (Array.isArray(classes)) {
          cleaned[tag] = classes.filter((c) => typeof c === 'string')
        }
      }
      opts.allowedClasses = cleaned
    }
  }

  return opts
}

// ---------------------------------------------------------------------------
// Transform pre-pass
// ---------------------------------------------------------------------------

function isAllStringRenames(transformTags) {
  if (!transformTags || typeof transformTags !== 'object') return true
  for (const v of Object.values(transformTags)) {
    if (typeof v !== 'string') return false
  }
  return true
}

function regexTransform(html, renameMap) {
  const keys = Object.keys(renameMap)
  if (keys.length === 0) return html
  const pattern = new RegExp(`<(/?)(${keys.join('|')})(\\b[^>]*)>`, 'gi')
  return html.replace(pattern, (_m, slash, tag, rest) => {
    const lower = tag.toLowerCase()
    const next = renameMap[lower] ?? tag
    return `<${slash}${next}${rest}>`
  })
}

function escapeAttr(v) {
  return String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;')
}

function renderAttribs(attribs) {
  let out = ''
  for (const [k, v] of Object.entries(attribs)) {
    if (v === '') {
      out += ` ${k}`
    } else {
      out += ` ${k}="${escapeAttr(v)}"`
    }
  }
  return out
}

function escapeText(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * Tokenizer-based pre-pass. Walks the input with htmlparser2 and applies
 * transformTags, exclusiveFilter, and textFilter so their callbacks run in
 * JS, then hands the transformed HTML string to the native sanitize for the
 * security-critical cleaning step.
 *
 * Emission is deferred: each frame holds a `children` buffer and its raw
 * inner text. The wrapper + children are only serialised on the closing
 * tag, at which point `exclusiveFilter` can inspect the accumulated text.
 */
function tokenizerTransform(html, { transformTags, exclusiveFilter, textFilter, allowedTags }) {
  const root = { children: [], rawText: '', mediaChildren: [] }
  const stack = [root]
  // sanitize-html only runs exclusiveFilter on tags that would survive the
  // allowedTags gate — we mimic that by skipping the filter for unknown
  // tag names.
  const allowedSet = new Set(
    (Array.isArray(allowedTags) ? allowedTags : DEFAULT_ALLOWED_TAGS).map((t) => t.toLowerCase()),
  )

  function topFrame() {
    return stack[stack.length - 1]
  }

  const parser = new Parser(
    {
      onopentag(name, attribs) {
        let tagName = name
        let nextAttribs = attribs
        let fixedText

        if (transformTags) {
          const xform = transformTags[name] ?? transformTags['*']
          if (xform) {
            let res
            if (typeof xform === 'string') {
              res = { tagName: xform, attribs }
            } else if (typeof xform === 'function') {
              res = xform(name, attribs, { text: '' }) ?? { tagName: name, attribs }
            }
            if (res) {
              tagName = res.tagName ?? name
              nextAttribs = res.attribs ?? attribs
              if (res.text !== undefined) fixedText = String(res.text)
            }
          }
        }

        stack.push({
          originalName: name,
          emittedName: tagName,
          attribs: nextAttribs,
          fixedText,
          children: [],
          rawText: '',
          mediaChildren: [],
        })
      },
      ontext(text) {
        const frame = topFrame()
        // Record raw inner text for exclusiveFilter — undecoded.
        frame.rawText += text
        if (frame === root) {
          const filtered = textFilter ? textFilter(text, '') : text
          frame.children.push(escapeText(filtered ?? text))
        } else {
          const filtered = textFilter ? textFilter(text, frame.emittedName) : text
          frame.children.push(escapeText(filtered ?? text))
        }
      },
      oncomment(data) {
        topFrame().children.push(`<!--${data}-->`)
      },
      onclosetag() {
        if (stack.length <= 1) return
        const frame = stack.pop()
        const parent = topFrame()

        const { emittedName, attribs, fixedText, children, rawText, mediaChildren } = frame
        const lowerName = emittedName.toLowerCase()
        const isVoid = VOID_ELEMENTS.has(lowerName)

        // Propagate media-child tracking up to the parent. Only tags that
        // would survive the allowedTags gate count, matching sanitize-html.
        if (MEDIA_TAGS.has(lowerName) && allowedSet.has(lowerName)) {
          parent.mediaChildren.push({ tag: emittedName, attribs })
        }
        for (const m of mediaChildren) parent.mediaChildren.push(m)

        // Only run exclusiveFilter on tags that would survive allowedTags —
        // matches sanitize-html ordering.
        let verdict = null
        if (exclusiveFilter && allowedSet.has(lowerName)) {
          verdict = exclusiveFilter({
            tag: emittedName,
            attribs,
            text: rawText,
            mediaChildren,
          })
        }
        if (verdict && verdict !== 'excludeTag') {
          // Drop entire subtree — but sibling media tracking has already
          // propagated so the filter on an ancestor still sees us.
          return
        }
        if (verdict === 'excludeTag') {
          parent.children.push(children.join(''))
          parent.rawText += rawText
          return
        }

        const attrStr = renderAttribs(attribs)
        if (isVoid) {
          parent.children.push(`<${emittedName}${attrStr} />`)
          return
        }

        let inner
        if (fixedText !== undefined) {
          // transform's `text` is treated as plain text — HTML-escape on write.
          const filtered =
            textFilter !== undefined ? textFilter(fixedText, emittedName) ?? fixedText : fixedText
          inner = escapeText(filtered)
        } else {
          inner = children.join('')
        }
        parent.children.push(`<${emittedName}${attrStr}>${inner}</${emittedName}>`)
        parent.rawText += fixedText !== undefined ? String(fixedText) : rawText
      },
    },
    { decodeEntities: true, lowerCaseTags: false, recognizeSelfClosing: true },
  )

  parser.write(html)
  parser.end()

  // Close any unclosed tags by flushing the stack.
  while (stack.length > 1) {
    const frame = stack.pop()
    const parent = topFrame()
    const attrStr = renderAttribs(frame.attribs)
    parent.children.push(
      VOID_ELEMENTS.has(frame.emittedName.toLowerCase())
        ? `<${frame.emittedName}${attrStr} />`
        : `<${frame.emittedName}${attrStr}>${frame.children.join('')}</${frame.emittedName}>`,
    )
  }

  return root.children.join('')
}

// ---------------------------------------------------------------------------
// Post-processing — iframe/URL enforcement + shape normalisation
// ---------------------------------------------------------------------------

function extractHost(url) {
  try {
    const stripped = url.replace(/[\t\n\r]/g, '')
    if (/^[/\\]{2}/.test(stripped)) {
      return new URL('https://' + stripped.slice(2)).hostname
    }
    if (stripped.includes('://')) return new URL(stripped).hostname
    return null
  } catch {
    return null
  }
}

function hostMatches(host, hostnames, domains) {
  if (Array.isArray(hostnames) && hostnames.includes(host)) return true
  if (Array.isArray(domains) && domains.some((d) => host === d || host.endsWith('.' + d))) {
    return true
  }
  return false
}

function enforceIframeAndProtocolRelative(html, opts) {
  const iframeCheck =
    Array.isArray(opts.allowedIframeHostnames) ||
    Array.isArray(opts.allowedIframeDomains) ||
    opts.allowIframeRelativeUrls === false

  if (iframeCheck) {
    html = html.replace(/<iframe([^>]*?)>/gi, (match, attrs) => {
      const srcMatch = /\ssrc="([^"]*)"/i.exec(attrs)
      if (!srcMatch) return match
      const src = srcMatch[1]
      const host = extractHost(src)

      if (host === null) {
        if (opts.allowIframeRelativeUrls === false) {
          return match.replace(srcMatch[0], '')
        }
        if (opts.allowIframeRelativeUrls === true) return match
        if (
          Array.isArray(opts.allowedIframeHostnames) ||
          Array.isArray(opts.allowedIframeDomains)
        ) {
          return match.replace(srcMatch[0], '')
        }
        return match
      }
      if (hostMatches(host, opts.allowedIframeHostnames, opts.allowedIframeDomains)) {
        return match
      }
      return match.replace(srcMatch[0], '')
    })
  }

  if (opts.allowProtocolRelative === false) {
    html = html.replace(/\s(href|src)="[/\\]{2}[^"]*"/gi, '')
  }

  return html
}

const VOID_RE = new RegExp(
  `<(${[...VOID_ELEMENTS].join('|')})((?:\\s[^>]*?)?)(?<!/)>`,
  'gi',
)

function normaliseOutput(html, inputHadRel) {
  let out = html.replace(VOID_RE, (_m, tag, attrs) => `<${tag}${attrs} />`)
  if (!inputHadRel) {
    out = out.replace(/\srel="noopener noreferrer"/g, '')
  }
  return out
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function sanitize(html, options) {
  if (html === null || html === undefined) return ''
  const input = typeof html === 'string' ? html : String(html)

  // sanitize-html's "trust everything" escape hatch.
  if (
    options &&
    typeof options === 'object' &&
    options.allowedTags === false &&
    options.allowedAttributes === false
  ) {
    return input
  }

  const rawOpts = options && typeof options === 'object' ? { ...options } : {}

  // 1. Pre-pass: apply transformTags / exclusiveFilter / textFilter.
  let pre = input
  const needsTokenizer =
    (rawOpts.transformTags && !isAllStringRenames(rawOpts.transformTags)) ||
    typeof rawOpts.exclusiveFilter === 'function' ||
    typeof rawOpts.textFilter === 'function'

  if (needsTokenizer) {
    pre = tokenizerTransform(pre, {
      transformTags: rawOpts.transformTags,
      exclusiveFilter: rawOpts.exclusiveFilter,
      textFilter: rawOpts.textFilter,
      allowedTags: Array.isArray(rawOpts.allowedTags) ? rawOpts.allowedTags : undefined,
    })
  } else if (rawOpts.transformTags) {
    pre = regexTransform(pre, rawOpts.transformTags)
  }

  // 2. Strip JS-only keys so the native sanitize doesn't reject them.
  const forNative = normaliseOptions(rawOpts)
  if (forNative) {
    for (const k of JS_ONLY_OPTIONS) delete forNative[k]
  }

  // 3. Native clean.
  const cleaned = amigoSanitize(pre, forNative)

  // 4. Post-pass: output shape + iframe / protocol-relative enforcement.
  const shaped = normaliseOutput(cleaned, /\brel\s*=/.test(input))
  return enforceIframeAndProtocolRelative(shaped, rawOpts)
}

export function isClean(html, options) {
  return sanitize(html, options) === html
}

// sanitize-html exposes these constants; consumers use them via
// `sanitize.defaults.allowedTags.concat(...)`.
sanitize.defaults = {
  allowedTags: DEFAULT_ALLOWED_TAGS,
  allowedAttributes: { a: ['href', 'name', 'target'], img: ['src'] },
}

// Stub — callers sometimes reach for it; real behaviour needs transform
// infrastructure not worth implementing here.
sanitize.simpleTransform =
  (newTagName, newAttribs, merge = true) =>
  (tagName, attribs) => ({
    tagName: newTagName,
    attribs: merge ? { ...attribs, ...newAttribs } : { ...newAttribs },
  })

export default sanitize
