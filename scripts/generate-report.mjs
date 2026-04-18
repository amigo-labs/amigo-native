#!/usr/bin/env node

/**
 * Reads bench-results.json + size-results.json + parity-results.json and
 * produces two outputs that live in git:
 *
 *   docs/data.json       — feeds the GitHub Pages dashboard (docs/app.js
 *                          consumes this directly).
 *   docs/packages.json   — human-curated metadata; only the `speedup`
 *                          string on each entry is regenerated from the
 *                          latest bench numbers.
 *
 * The JSON output is the single source of truth for benchmark numbers.
 * Consumers that want a tabular view render from docs/data.json — the
 * dashboard (docs/index.html), per-crate READMEs via shields.io endpoints,
 * etc. We intentionally do NOT emit a BENCHMARKS.md any more: regenerating
 * a markdown table on every CI run produced merge conflicts and noisy
 * diffs for what was essentially the same data as data.json.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const benchPath = join(root, 'bench-results.json')
const sizePath = join(root, 'size-results.json')
const parityPath = join(root, 'parity-results.json')

// --- Load data -----------------------------------------------------------

function loadJson(path) {
  if (!existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, 'utf-8'))
  } catch (err) {
    console.warn(`Failed to parse ${path}: ${err.message}`)
    return null
  }
}

const benchData = loadJson(benchPath)
const sizeData = loadJson(sizePath)
const parityData = loadJson(parityPath)

if (!benchData && !sizeData) {
  console.error(
    'No data found. Run `node scripts/run-benchmarks.mjs` and `node scripts/measure-size.mjs` first.',
  )
  process.exit(1)
}

// --- Write docs/data.json ------------------------------------------------

const docsDir = join(root, 'docs')
const docsPath = join(docsDir, 'data.json')
const docsData = {
  generatedAt: new Date().toISOString().split('T')[0],
  nodeVersion: process.version,
  platform: `${process.platform} ${process.arch}`,
  benchmarks: benchData ?? null,
  sizes: sizeData ?? null,
  parity: parityData ?? null,
}
writeFileSync(docsPath, JSON.stringify(docsData, null, 2) + '\n')
console.log(`Written to ${docsPath}`)

// --- Refresh docs/packages.json speedup strings --------------------------

function formatRatio(x) {
  if (x < 2) return x.toFixed(2).replace(/\.?0+$/, '')
  if (x < 10) return x.toFixed(1).replace(/\.0$/, '')
  return Math.round(x).toString()
}

function entryVariant(name) {
  const i = name.indexOf(' ')
  return i === -1 ? '' : name.slice(i + 1)
}

function computeSpeedupString(suites) {
  const ratios = []
  for (const suite of suites) {
    const amigoEntries = suite.entries.filter((e) => e.name.includes('@amigo') && e.hz > 0)
    const competitors = suite.entries.filter((e) => !e.name.includes('@amigo') && e.hz > 0)
    if (!amigoEntries.length || !competitors.length) continue
    // Variant-match only when a suite has multiple amigo variants (e.g. encoding
    // small/100KB/10MB): otherwise the variant suffix encodes library qualifiers
    // (`slugify (npm)`, `file-type (upstream async)`) and strict matching would
    // discard the legitimate 1-vs-1 comparison.
    const variantMatch = new Set(amigoEntries.map((e) => entryVariant(e.name))).size > 1
    for (const amigo of amigoEntries) {
      const pool = variantMatch
        ? competitors.filter((e) => entryVariant(e.name) === entryVariant(amigo.name))
        : competitors
      if (!pool.length) continue
      // fastest competitor in pool → most conservative claim
      const bestHz = Math.max(...pool.map((e) => e.hz))
      ratios.push(amigo.hz / bestHz)
    }
  }
  if (!ratios.length) return 'TBD'
  const min = Math.min(...ratios)
  const max = Math.max(...ratios)
  if (min >= 1.05) {
    const lo = formatRatio(min)
    const hi = formatRatio(max)
    return lo === hi ? `${lo}× faster` : `${lo}–${hi}× faster`
  }
  if (max <= 0.95) {
    const lo = formatRatio(1 / max)
    const hi = formatRatio(1 / min)
    return lo === hi ? `${lo}× slower` : `${lo}–${hi}× slower`
  }
  // Mixed: show best win and worst regression
  const winners = ratios.filter((r) => r >= 1.05)
  const losers = ratios.filter((r) => r <= 0.95)
  const parts = []
  if (winners.length) parts.push(`up to ${formatRatio(Math.max(...winners))}× faster`)
  if (losers.length) parts.push(`${formatRatio(1 / Math.min(...losers))}× slower`)
  return parts.length ? parts.join(' / ') : '~equal'
}

const packagesPath = join(docsDir, 'packages.json')
if (benchData?.suites?.length && existsSync(packagesPath)) {
  const packagesData = JSON.parse(readFileSync(packagesPath, 'utf-8'))
  const suitesByCrate = new Map()
  for (const suite of benchData.suites) {
    const m = suite.file?.match(/^crates\/([^/]+)\//)
    if (!m) continue
    if (!suitesByCrate.has(m[1])) suitesByCrate.set(m[1], [])
    suitesByCrate.get(m[1]).push(suite)
  }
  for (const pkg of packagesData.packages ?? []) {
    const suites = suitesByCrate.get(pkg.name)
    if (suites?.length) pkg.speedup = computeSpeedupString(suites)
  }
  writeFileSync(packagesPath, JSON.stringify(packagesData, null, 2) + '\n')
  console.log(`Updated speedup strings in ${packagesPath}`)
}
