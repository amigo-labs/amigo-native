#!/usr/bin/env node

/**
 * WCAG contrast checker for the design tokens in
 * web/src/styles/tokens.css. Pass `--check` to exit non-zero when any
 * critical fg/bg pair drops below its required ratio (AA: 4.5:1 for
 * normal text, 3:1 for large/UI). Without `--check` the script just
 * prints the report.
 *
 * Source of truth: a single CSS file parsed by regex. Adding a new
 * token requires no script change; adding a new pair to assert means
 * appending to PAIRS below.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const tokensPath = join(__dirname, '..', 'web', 'src', 'styles', 'tokens.css')

const PAIRS = [
  // [fgToken, bgToken, kind] — "normal" → AA 4.5:1, "ui" → AA 3:1
  ['fg', 'bg', 'normal'],
  ['fg', 'bg-elevated', 'normal'],
  ['fg', 'bg-sunken', 'normal'],
  ['fg-muted', 'bg', 'normal'],
  ['fg-muted', 'bg-elevated', 'normal'],
  ['fg-subtle', 'bg', 'ui'], // labels, footnotes — UI text
  ['fg-subtle', 'bg-elevated', 'ui'],
  ['accent', 'bg', 'ui'], // accent text on body bg
  ['accent', 'bg-elevated', 'ui'],
  ['accent-on', 'accent', 'normal'], // text on the accent button
  ['ok', 'bg', 'ui'],
  ['warn', 'bg', 'ui'],
  ['bad', 'bg', 'ui'],
]

const THEMES = ['dark', 'light']

function parseTokens(source) {
  // Match each :root[data-theme="<name>"] (or the bare :root) block and
  // pull --token: value pairs out of it.
  const out = { dark: {}, light: {} }
  const blockRe = /:root(?:\[data-theme="(dark|light)"\])?\s*\{([\s\S]*?)\}/g
  let m
  while ((m = blockRe.exec(source))) {
    const theme = m[1] ?? 'dark' // bare :root and :root[data-theme="dark"] both feed dark
    const body = m[2]
    const propRe = /--([\w-]+):\s*([^;]+?);/g
    let p
    while ((p = propRe.exec(body))) {
      const name = p[1].trim()
      const value = p[2].trim()
      out[theme][name] = value
    }
  }
  return out
}

function hexToRgb(hex) {
  const h = hex.replace('#', '').trim()
  const full =
    h.length === 3
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ]
}

function resolveColor(theme, key) {
  // Resolves a token name to a flat [r,g,b] tuple by recursively chasing
  // var() references. Stops at #hex / rgb(a). Throws on unknown tokens
  // so a typo in PAIRS fails loudly.
  let value = theme[key]
  if (!value) throw new Error(`Unknown token: ${key}`)
  while (value.startsWith('var(')) {
    const inner = value.slice(4, value.indexOf(')')).trim().replace(/^--/, '')
    value = theme[inner]
    if (!value) throw new Error(`Unknown var() target: ${inner}`)
  }
  if (value.startsWith('#')) return [...hexToRgb(value), 1]
  const rgba = /rgba?\(([^)]+)\)/.exec(value)
  if (rgba) {
    const parts = rgba[1].split(',').map((s) => s.trim())
    const [r, g, b] = parts.slice(0, 3).map((s) => parseInt(s, 10))
    const a = parts[3] != null ? parseFloat(parts[3]) : 1
    return [r, g, b, a]
  }
  throw new Error(`Unrecognised color value: ${value}`)
}

function srgbToLin(c) {
  const cs = c / 255
  return cs <= 0.03928 ? cs / 12.92 : ((cs + 0.055) / 1.055) ** 2.4
}

function relLuminance([r, g, b]) {
  return 0.2126 * srgbToLin(r) + 0.7152 * srgbToLin(g) + 0.0722 * srgbToLin(b)
}

function composite(fg, bg) {
  // alpha-composite fg over opaque bg
  const [fr, fg_, fb, fa] = fg
  const [br, bg_, bb] = bg
  if (fa >= 1) return [fr, fg_, fb]
  return [
    Math.round(fr * fa + br * (1 - fa)),
    Math.round(fg_ * fa + bg_ * (1 - fa)),
    Math.round(fb * fa + bb * (1 - fa)),
  ]
}

function contrastRatio(fgRgb, bgRgb) {
  const lf = relLuminance(fgRgb)
  const lb = relLuminance(bgRgb)
  const [hi, lo] = lf > lb ? [lf, lb] : [lb, lf]
  return (hi + 0.05) / (lo + 0.05)
}

function evaluate() {
  const tokens = parseTokens(readFileSync(tokensPath, 'utf-8'))
  const failures = []
  const rows = []

  for (const theme of THEMES) {
    for (const [fgKey, bgKey, kind] of PAIRS) {
      const fg = resolveColor(tokens[theme], fgKey)
      const bg = resolveColor(tokens[theme], bgKey)
      const composedFg = composite(fg, bg)
      const ratio = contrastRatio(composedFg, bg)
      const required = kind === 'normal' ? 4.5 : 3.0
      const pass = ratio >= required
      rows.push({ theme, fgKey, bgKey, kind, ratio, required, pass })
      if (!pass) failures.push({ theme, fgKey, bgKey, kind, ratio, required })
    }
  }

  return { rows, failures }
}

function fmt(n) {
  return n.toFixed(2)
}

function main() {
  const check = process.argv.includes('--check')
  const { rows, failures } = evaluate()

  for (const theme of THEMES) {
    console.log(`\n${theme.toUpperCase()} theme`)
    console.log('  ' + '─'.repeat(60))
    for (const r of rows.filter((x) => x.theme === theme)) {
      const mark = r.pass ? '✓' : '✗'
      const pair = `${r.fgKey.padEnd(10)} on ${r.bgKey.padEnd(12)}`
      console.log(
        `  ${mark} ${pair}  ${fmt(r.ratio).padStart(5)}:1  (≥${fmt(r.required)}:1, ${r.kind})`,
      )
    }
  }

  if (failures.length === 0) {
    console.log('\nAll pairs pass WCAG AA.\n')
    process.exit(0)
  }
  console.log(`\n${failures.length} contrast failure(s).`)
  if (check) {
    console.error('check-contrast: contrast regression detected.')
    process.exit(1)
  }
}

main()
