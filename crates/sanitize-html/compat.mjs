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

// Tags whose content should be dropped entirely when the tag itself is not
// allowed (sanitize-html default). Callers can override via `nonTextTags`.
const DEFAULT_NON_TEXT_TAGS = ['script', 'style', 'textarea', 'option']

// HTML5 boolean attributes — these keep their bare (empty-value) form.
const HTML_BOOLEAN_ATTRIBUTES = new Set([
  'allowfullscreen', 'async', 'autofocus', 'autoplay', 'checked', 'controls',
  'default', 'defer', 'disabled', 'formnovalidate', 'hidden', 'inert', 'ismap',
  'itemscope', 'loop', 'multiple', 'muted', 'nomodule', 'novalidate', 'open',
  'playsinline', 'readonly', 'required', 'reversed', 'scoped', 'selected',
  'truespeed',
])

// sanitize-html's default `allowedEmptyAttributes`.
const DEFAULT_ALLOWED_EMPTY_ATTRIBUTES = ['alt']

const VULNERABLE_TAGS = ['style', 'script', 'noscript', 'textarea']

function warnVulnerableTags(allowedTags) {
  if (!Array.isArray(allowedTags)) return
  for (const tag of allowedTags) {
    if (VULNERABLE_TAGS.includes(tag)) {
      const message =
        '\n\n⚠️ Your `allowedTags` option includes, `' +
        tag +
        '`, which is inherently\n' +
        'vulnerable to XSS attacks. Please remove it from `allowedTags`.\n' +
        'Or, to disable this warning, add the `allowVulnerableTags` option\n' +
        'and ensure you are accounting for this risk.\n\n'
      console.warn(message)
    }
  }
}

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
    } else if (typeof v === 'string') {
      // sanitize-html accepts a single-tag string shortcut.
      opts.allowedTags = [v]
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

  // allowedClasses: keep strings AND RegExps AND the sentinel `false`
  // (= allow all classes for this tag). Patterns / regexes are resolved
  // downstream in the tokenizer — native sanitize only sees exact strings.
  if ('allowedClasses' in opts) {
    const v = opts.allowedClasses
    if (typeof v !== 'object' || v === null || Array.isArray(v)) {
      opts.allowedClasses = {}
    } else {
      const cleaned = {}
      for (const [tag, classes] of Object.entries(v)) {
        if (classes === false) {
          cleaned[tag] = false
        } else if (Array.isArray(classes)) {
          cleaned[tag] = classes.filter((c) => typeof c === 'string' || isRegExp(c))
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

// Sentinel marker used to preserve the `<a href>` bare-attribute form across
// native ammonia (which unconditionally rewrites bare attrs as `attr=""`).
// Only used when the caller explicitly opts out of the default
// empty-attribute cleanup via `nonBooleanAttributes`.
const BARE_ATTR_SENTINEL = 'AMIGO-BARE-ATTR-SENTINEL-X9K7'

function renderAttribs(attribs, bareSet, preserveBare) {
  let out = ''
  for (const [k, v] of Object.entries(attribs)) {
    if (v === '') {
      // Boolean HTML attrs always render bare; explicitly-bare attributes are
      // preserved verbatim when the caller asked for that via
      // `nonBooleanAttributes`.
      const isBoolAttr = HTML_BOOLEAN_ATTRIBUTES.has(k.toLowerCase())
      const markBare = isBoolAttr || (preserveBare && bareSet?.has(k))
      if (markBare) {
        out += ` ${k}="${BARE_ATTR_SENTINEL}"`
      } else {
        out += ` ${k}=""`
      }
    } else {
      out += ` ${k}="${escapeAttr(v)}"`
    }
  }
  return out
}

function stripBareAttrSentinels(html) {
  if (!html.includes(BARE_ATTR_SENTINEL)) return html
  return html.replace(new RegExp(`="${BARE_ATTR_SENTINEL}"`, 'g'), '')
}

function escapeText(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// Cross-realm-safe RegExp check — `instanceof RegExp` breaks for regexes
// created in a different `vm.Script` context (the upstream harness uses one).
function isRegExp(v) {
  return Object.prototype.toString.call(v) === '[object RegExp]'
}

// `allowedClasses` pattern matcher — supports exact strings, glob patterns
// containing `*`, the bare `'*'` wildcard (= match any class), and RegExp.
function classMatches(className, patterns) {
  for (const p of patterns) {
    if (isRegExp(p)) {
      if (p.test(className)) return true
    } else if (typeof p === 'string') {
      if (p === '*' || p === className) return true
      if (p.includes('*')) {
        const escaped = p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')
        if (new RegExp('^' + escaped + '$').test(className)) return true
      }
    }
  }
  return false
}

// Minimal CSS declaration parser — enough for `allowedStyles` property
// allowlists. We split on `;`, strip `!important`, and preserve the flag
// so it can be re-emitted with values that survive the regex match.
function parseStyleDeclarations(styleStr) {
  const out = []
  for (const raw of styleStr.split(';')) {
    const decl = raw.trim()
    if (!decl) continue
    const colon = decl.indexOf(':')
    if (colon < 0) continue
    const name = decl.slice(0, colon).trim().toLowerCase()
    if (!name) continue
    let value = decl.slice(colon + 1).trim()
    let important = false
    const imp = /\s*!important\s*$/i.exec(value)
    if (imp) {
      important = true
      value = value.slice(0, imp.index).trim()
    }
    out.push({ name, value, important })
  }
  return out
}

// Apply allowedStyles to a `style` attribute value. Returns the filtered
// string (possibly empty — caller decides whether to drop the attribute).
function filterStyleAttrib(styleStr, tagName, allowedStylesMap) {
  const tagRules = allowedStylesMap[tagName] ?? {}
  const starRules = allowedStylesMap['*'] ?? {}
  const decls = parseStyleDeclarations(styleStr)
  const kept = []
  for (const { name, value, important } of decls) {
    const patterns = [...(tagRules[name] ?? []), ...(starRules[name] ?? [])]
    if (patterns.length === 0) continue
    const ok = patterns.some((p) => isRegExp(p) && p.test(value))
    if (!ok) continue
    kept.push(`${name}:${value}${important ? ' !important' : ''}`)
  }
  return kept.join(';')
}

function isAttrNonBoolean(name, nonBoolOpt) {
  const lower = name.toLowerCase()
  if (nonBoolOpt === undefined) return !HTML_BOOLEAN_ATTRIBUTES.has(lower)
  if (!Array.isArray(nonBoolOpt)) return false
  if (nonBoolOpt.includes('*')) return true
  return nonBoolOpt.includes(lower)
}

// Drop attributes whose value is the empty string, honoring `nonBoolean
// Attributes` (what counts as drop-eligible) and `allowedEmptyAttributes`
// (exceptions that survive even while empty).
function filterEmptyAttribs(attribs, nonBoolOpt, allowedEmptyOpt) {
  const allowedEmpty = new Set(
    (Array.isArray(allowedEmptyOpt) ? allowedEmptyOpt : DEFAULT_ALLOWED_EMPTY_ATTRIBUTES).map(
      (a) => a.toLowerCase(),
    ),
  )
  const out = {}
  for (const [k, v] of Object.entries(attribs)) {
    if (v !== '') {
      out[k] = v
      continue
    }
    if (allowedEmpty.has(k.toLowerCase())) {
      out[k] = v
      continue
    }
    if (isAttrNonBoolean(k, nonBoolOpt)) continue // drop
    out[k] = v
  }
  return out
}

// Apply allowedClasses to an element's `class` attribute. Returns a new
// attribs object with `class` narrowed to matching classes (or removed
// entirely when nothing matches).
function filterClassAttrib(attribs, tagName, allowedClassesMap) {
  if (!allowedClassesMap || attribs.class === undefined) return attribs
  const tagRule = allowedClassesMap[tagName]
  const starRule = allowedClassesMap['*']
  // `false` sentinel = allow all classes for this tag or globally.
  if (tagRule === false || starRule === false) return attribs

  const tagPatterns = Array.isArray(tagRule) ? tagRule : []
  const starPatterns = Array.isArray(starRule) ? starRule : []
  const patterns = [...tagPatterns, ...starPatterns]

  if (patterns.length === 0) {
    const { class: _dropped, ...rest } = attribs
    return rest
  }

  const classes = (attribs.class ?? '').split(/\s+/).filter(Boolean)
  const kept = classes.filter((c) => classMatches(c, patterns))
  if (kept.length === 0) {
    const { class: _dropped, ...rest } = attribs
    return rest
  }
  return { ...attribs, class: kept.join(' ') }
}

// Render a tag token as escaped-text — used by disallowedTagsMode: 'escape'
// and 'recursiveEscape'. sanitize-html preserves attr quotes literally
// (doesn't HTML-encode attr values), so neither do we.
function renderEscapedTag(tagName, attribs, { closing = false, selfClose = false } = {}) {
  let out = '&lt;'
  if (closing) out += '/'
  out += tagName
  if (!closing) {
    for (const [k, v] of Object.entries(attribs)) {
      out += v === '' ? ` ${k}` : ` ${k}="${v}"`
    }
    if (selfClose) out += ' /'
  }
  return out + '&gt;'
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
function tokenizerTransform(
  html,
  {
    transformTags,
    exclusiveFilter,
    textFilter,
    allowedTags,
    disallowedTagsMode,
    nonTextTags,
    allowedClasses,
    allowedStyles,
    parseStyleAttributes,
    allowAllTags,
    nonBooleanAttributes,
    allowedEmptyAttributes,
    preserveBareAttribs,
    preserveEscapedAttributes,
    parserOptions,
    onOpenTag,
    onCloseTag,
    nestingLimit,
  },
) {
  const root = { children: [], rawText: '', mediaChildren: [] }
  const stack = [root]
  const allowedSet = new Set(
    (Array.isArray(allowedTags) ? allowedTags : DEFAULT_ALLOWED_TAGS).map((t) => t.toLowerCase()),
  )
  // `allowAllTags` (set by the caller when `allowedTags: false`): every tag
  // name passes the allowedSet gate regardless of the list above.
  const tagIsAllowed = (lower) => allowAllTags || allowedSet.has(lower)
  const nonTextSet = new Set(
    (Array.isArray(nonTextTags) ? nonTextTags : DEFAULT_NON_TEXT_TAGS).map((t) => t.toLowerCase()),
  )
  const escapeMode = disallowedTagsMode === 'escape' || disallowedTagsMode === 'recursiveEscape'
  const recursiveEscape = disallowedTagsMode === 'recursiveEscape'
  const completelyDiscard = disallowedTagsMode === 'completelyDiscard'

  function topFrame() {
    return stack[stack.length - 1]
  }

  // htmlparser2 fires `onattribute` before `onopentag`; we collect the
  // names of attributes that came through bare (`<a href target="x">`) so
  // the emitter can reproduce the exact source form instead of always
  // quoting with `=""`.
  let pendingBare = new Set()

  const parser = new Parser(
    {
      onattribute(attrName, _value, quote) {
        if (quote === undefined) pendingBare.add(attrName)
      },
      onopentag(name, attribs) {
        if (typeof onOpenTag === 'function') {
          try { onOpenTag(name, attribs) } catch { /* swallow */ }
        }
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

        // Apply allowedClasses patterns (regex / glob / `*`). Native sanitize
        // only understands exact matches, so we narrow the `class` attribute
        // here and let the filtered list pass through untouched.
        if (allowedClasses) {
          nextAttribs = filterClassAttrib(nextAttribs, tagName, allowedClasses)
        }

        // Apply allowedStyles property allowlist. Remove the attribute
        // entirely when the filter empties it. When parseStyleAttributes
        // is explicitly `false`, skip parsing and pass the attr through.
        if (parseStyleAttributes === false) {
          // Keep attribute verbatim — no-op.
        } else if (allowedStyles && nextAttribs.style !== undefined) {
          const filtered = filterStyleAttrib(nextAttribs.style, tagName, allowedStyles)
          if (filtered) {
            nextAttribs = { ...nextAttribs, style: filtered }
          } else {
            const { style: _s, ...rest } = nextAttribs
            nextAttribs = rest
          }
        } else if (nextAttribs.style === '') {
          const { style: _s, ...rest } = nextAttribs
          nextAttribs = rest
        }

        // Drop empty non-boolean attributes (href="", target="", etc.) while
        // preserving empty booleans (`<input checked>`) and any attr listed in
        // allowedEmptyAttributes.
        nextAttribs = filterEmptyAttribs(nextAttribs, nonBooleanAttributes, allowedEmptyAttributes)

        // Determine this frame's escape mode given allowedTags + ancestors.
        const lowerEmitted = tagName.toLowerCase()
        const parentFrame = topFrame()
        const insideRecursive =
          parentFrame.escapeMode === 'recursive' || parentFrame.escapeMode === 'recursiveInherited'
        const insideDropAll =
          parentFrame.escapeMode === 'dropAll' || parentFrame.escapeMode === 'dropAllInherited'
        let frameEscape = 'none'
        // nestingLimit: drop the wrapper when nested too deep but keep
        // children (including direct text), matching sanitize-html.
        if (typeof nestingLimit === 'number' && stack.length > nestingLimit) {
          frameEscape = 'liftChildren'
        }
        if (insideDropAll) {
          frameEscape = 'dropAllInherited'
        } else if (insideRecursive) {
          frameEscape = 'recursiveInherited'
        } else if (!tagIsAllowed(lowerEmitted) && nonTextSet.has(lowerEmitted)) {
          // nonTextTag + disallowed → drop wrapper and contents entirely.
          frameEscape = 'dropAll'
        } else if (!tagIsAllowed(lowerEmitted) && completelyDiscard) {
          // disallowedTagsMode: 'completelyDiscard' — drop wrapper + direct
          // text, but lift allowed nested tags up into the parent scope.
          frameEscape = 'discardDirect'
        } else if (!tagIsAllowed(lowerEmitted) && escapeMode) {
          frameEscape = recursiveEscape ? 'recursive' : 'wrapper'
        }

        const bareAttribs = pendingBare
        pendingBare = new Set()

        stack.push({
          originalName: name,
          emittedName: tagName,
          attribs: nextAttribs,
          bareAttribs,
          fixedText,
          children: [],
          rawText: '',
          mediaChildren: [],
          escapeMode: frameEscape,
        })
      },
      ontext(text) {
        const frame = topFrame()
        if (frame.escapeMode === 'dropAll' || frame.escapeMode === 'dropAllInherited') {
          return
        }
        if (frame.escapeMode === 'discardDirect') return
        // completelyDiscard: top-level text (not inside any allowed tag) is
        // also dropped.
        if (completelyDiscard && frame === root) return
        frame.rawText += text
        // Text inside raw-text elements (script/style/textarea) is already
        // delivered undecoded by htmlparser2 — escaping it here would
        // double-encode entities like `&amp;`.
        const isRawTextFrame =
          frame !== root &&
          (frame.emittedName === 'script' ||
            frame.emittedName === 'style' ||
            frame.emittedName === 'textarea' ||
            frame.emittedName === 'pre')
        const ctxTag = frame === root ? '' : frame.emittedName
        const filtered = textFilter ? (textFilter(text, ctxTag) ?? text) : text
        frame.children.push(isRawTextFrame ? filtered : escapeText(filtered))
      },
      oncomment(data) {
        topFrame().children.push(`<!--${data}-->`)
      },
      onclosetag(name, isImplied) {
        if (typeof onCloseTag === 'function') {
          try { onCloseTag(name, isImplied) } catch { /* swallow */ }
        }
        if (stack.length <= 1) return
        const frame = stack.pop()
        const parent = topFrame()

        const {
          emittedName,
          attribs,
          bareAttribs,
          fixedText,
          children,
          rawText,
          mediaChildren,
          escapeMode: frameEscape,
        } = frame
        const lowerName = emittedName.toLowerCase()
        const isVoid = VOID_ELEMENTS.has(lowerName)

        // dropAll: suppress the entire subtree (content of disallowed
        // nonTextTags like textarea/style/script/option).
        if (frameEscape === 'dropAll' || frameEscape === 'dropAllInherited') {
          return
        }

        // discardDirect (completelyDiscard mode): wrapper dropped, direct
        // text already suppressed in ontext; lift allowed children up.
        if (frameEscape === 'discardDirect') {
          parent.children.push(children.join(''))
          return
        }

        // liftChildren (nestingLimit overage): drop wrapper, keep everything
        // underneath.
        if (frameEscape === 'liftChildren') {
          parent.children.push(children.join(''))
          parent.rawText += rawText
          return
        }

        // Propagate media-child tracking up to the parent. Only tags that
        // would survive the allowedTags gate count, matching sanitize-html.
        if (MEDIA_TAGS.has(lowerName) && tagIsAllowed(lowerName)) {
          parent.mediaChildren.push({ tag: emittedName, attribs })
        }
        for (const m of mediaChildren) parent.mediaChildren.push(m)

        // Run exclusiveFilter first — it can veto even tags that would
        // otherwise have been escape-rendered.
        let verdict = null
        if (exclusiveFilter && (tagIsAllowed(lowerName) || frameEscape !== 'none')) {
          verdict = exclusiveFilter({
            tag: emittedName,
            attribs,
            text: rawText,
            mediaChildren,
          })
        }
        if (verdict && verdict !== 'excludeTag') return
        if (verdict === 'excludeTag') {
          parent.children.push(children.join(''))
          parent.rawText += rawText
          return
        }

        // `preserveEscapedAttributes: false` drops attrs from the escaped
        // wrapper (default behaviour keeps them).
        const escAttribs = preserveEscapedAttributes === false ? {} : attribs

        // disallowedTagsMode = 'escape' / 'recursiveEscape' handling.
        if (frameEscape === 'recursive' || frameEscape === 'recursiveInherited') {
          parent.children.push(renderEscapedTag(emittedName, escAttribs, { selfClose: isVoid }))
          parent.children.push(children.join(''))
          if (!isVoid && !isImplied) {
            parent.children.push(renderEscapedTag(emittedName, {}, { closing: true }))
          }
          parent.rawText += rawText
          return
        }
        if (frameEscape === 'wrapper') {
          parent.children.push(renderEscapedTag(emittedName, escAttribs, { selfClose: isVoid }))
          if (!isVoid) {
            parent.children.push(children.join(''))
            if (!isImplied) {
              parent.children.push(renderEscapedTag(emittedName, {}, { closing: true }))
            }
          }
          parent.rawText += rawText
          return
        }

        const attrStr = renderAttribs(attribs, bareAttribs, preserveBareAttribs)
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
    {
      decodeEntities: true,
      // sanitize-html defaults to lower-casing tag & attribute names; consumers
      // (e.g. SVG) opt out via `parser: { lowerCaseTags: false }`.
      lowerCaseTags: parserOptions?.lowerCaseTags !== false,
      lowerCaseAttributeNames: parserOptions?.lowerCaseAttributeNames !== false,
      recognizeSelfClosing: true,
    },
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

  // htmlparser2 silently drops partial tags at EOF (e.g. `<hello you` without
  // a closing `>`). In escape modes sanitize-html preserves them as escaped
  // text, so recover the trailing `<…` suffix here.
  if (escapeMode) {
    const trailing = /<[a-zA-Z][^>]*$/.exec(html)
    if (trailing) root.children.push(escapeText(trailing[0]))
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

  const rawOpts = options && typeof options === 'object' ? { ...options } : {}
  const allowAllTags = rawOpts.allowedTags === false
  const allowAllAttributes = rawOpts.allowedAttributes === false

  // sanitize-html reports this combination as a config error.
  if (rawOpts.allowedStyles && rawOpts.parseStyleAttributes === false) {
    throw new Error(
      'allowedStyles option cannot be used together with parseStyleAttributes: false.',
    )
  }

  // Warn about vulnerable tags in allowedTags (matches sanitize-html's
  // advisory console.warn). Opt-out via allowVulnerableTags: true.
  if (rawOpts.allowVulnerableTags !== true) {
    warnVulnerableTags(rawOpts.allowedTags)
  }

  // 1. Pre-pass: apply transformTags / exclusiveFilter / textFilter.
  let pre = input
  const escapeMode =
    rawOpts.disallowedTagsMode === 'escape' || rawOpts.disallowedTagsMode === 'recursiveEscape'

  // Normalise allowedClasses once so both the tokenizer pass and the native
  // sanitize see a canonical shape (and so we can tell whether patterns
  // are in play).
  let allowedClassesMap = null
  if (rawOpts.allowedClasses && typeof rawOpts.allowedClasses === 'object' && !Array.isArray(rawOpts.allowedClasses)) {
    allowedClassesMap = {}
    for (const [tag, classes] of Object.entries(rawOpts.allowedClasses)) {
      if (classes === false) {
        allowedClassesMap[tag] = false
      } else if (Array.isArray(classes)) {
        allowedClassesMap[tag] = classes.filter((c) => typeof c === 'string' || isRegExp(c))
      }
    }
  }

  const allowedStyles =
    rawOpts.allowedStyles && typeof rawOpts.allowedStyles === 'object'
      ? rawOpts.allowedStyles
      : null

  // Always run the tokenizer when the input could contain a disallowed
  // nonTextTag whose content must be dropped — otherwise rely on the
  // cheaper regex pre-pass (or skip outright).
  const needsTokenizer =
    (rawOpts.transformTags && !isAllStringRenames(rawOpts.transformTags)) ||
    typeof rawOpts.exclusiveFilter === 'function' ||
    typeof rawOpts.textFilter === 'function' ||
    escapeMode ||
    rawOpts.disallowedTagsMode === 'completelyDiscard' ||
    /<(script|style|textarea|option)\b/i.test(input) ||
    (Array.isArray(rawOpts.nonTextTags) && rawOpts.nonTextTags.length > 0) ||
    allowedClassesMap !== null ||
    allowedStyles !== null ||
    rawOpts.parseStyleAttributes === false ||
    Array.isArray(rawOpts.nonBooleanAttributes) ||
    Array.isArray(rawOpts.allowedEmptyAttributes) ||
    rawOpts.preserveEscapedAttributes === false ||
    typeof rawOpts.onOpenTag === 'function' ||
    typeof rawOpts.onCloseTag === 'function' ||
    (rawOpts.parser && typeof rawOpts.parser === 'object') ||
    typeof rawOpts.nestingLimit === 'number' ||
    // Empty-attribute filtering (the default in sanitize-html) needs the
    // tokenizer to detect `<a href target=...>`-style bare attributes that
    // htmlparser2 reports with value `""`. Run it whenever the input has
    // any tag markup.
    input.includes('<')

  const tokenizerForced = allowAllTags || allowAllAttributes
  if (needsTokenizer || tokenizerForced) {
    pre = tokenizerTransform(pre, {
      transformTags: rawOpts.transformTags,
      exclusiveFilter: rawOpts.exclusiveFilter,
      textFilter: rawOpts.textFilter,
      allowedTags: Array.isArray(rawOpts.allowedTags) ? rawOpts.allowedTags : undefined,
      disallowedTagsMode: rawOpts.disallowedTagsMode,
      nonTextTags: rawOpts.nonTextTags,
      allowedClasses: allowedClassesMap,
      allowedStyles,
      parseStyleAttributes: rawOpts.parseStyleAttributes,
      allowAllTags,
      nonBooleanAttributes: rawOpts.nonBooleanAttributes,
      allowedEmptyAttributes: rawOpts.allowedEmptyAttributes,
      // Only preserve the bare-attribute form when the caller explicitly
      // controls the empty-attr behaviour via `nonBooleanAttributes`.
      preserveBareAttribs: Array.isArray(rawOpts.nonBooleanAttributes),
      preserveEscapedAttributes: rawOpts.preserveEscapedAttributes,
      parserOptions: rawOpts.parser,
      onOpenTag: rawOpts.onOpenTag,
      onCloseTag: rawOpts.onCloseTag,
      nestingLimit: rawOpts.nestingLimit,
    })
  } else if (rawOpts.transformTags) {
    pre = regexTransform(pre, rawOpts.transformTags)
  }

  // When the caller opted out of tag/attribute sanitization entirely, the
  // tokenizer output is already the final answer — skipping native sanitize
  // preserves non-standard tags / attributes that ammonia would otherwise
  // strip.
  if (allowAllTags && allowAllAttributes) {
    return stripBareAttrSentinels(pre)
  }

  // 2. Strip JS-only keys so the native sanitize doesn't reject them.
  const forNative = normaliseOptions(rawOpts)
  if (forNative) {
    for (const k of JS_ONLY_OPTIONS) delete forNative[k]
    // allowedClasses was already resolved by the tokenizer (including any
    // regex / glob patterns). Pass `class` through as a plain attribute for
    // each tag with a rule so native sanitize keeps the filtered value.
    // Native ammonia has no `'*'` tag-wildcard, so we materialise the `'*'`
    // rule onto every allowed tag explicitly.
    if (allowedClassesMap) {
      delete forNative.allowedClasses
      const aa = (forNative.allowedAttributes = forNative.allowedAttributes ?? {})
      const addClass = (tag) => {
        const existing = Array.isArray(aa[tag]) ? aa[tag] : []
        if (!existing.includes('class')) aa[tag] = [...existing, 'class']
      }
      for (const tag of Object.keys(allowedClassesMap)) {
        if (tag === '*') continue
        addClass(tag)
      }
      if ('*' in allowedClassesMap) {
        const tagsForClass = Array.isArray(rawOpts.allowedTags)
          ? rawOpts.allowedTags
          : DEFAULT_ALLOWED_TAGS
        for (const tag of tagsForClass) addClass(tag)
      }
    }
  }

  // 3. Native clean.
  const cleaned = stripBareAttrSentinels(amigoSanitize(pre, forNative))

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
