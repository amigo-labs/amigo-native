#!/usr/bin/env node

/**
 * Pre-renders perf-review markdown to HTML for shipped, public packages
 * only — i.e. crates surfaced in docs/packages.json `packages[]`. The
 * `candidates[]` perf-reviews are intentionally skipped: they describe
 * packages we considered but did not ship, so they have no slab on the
 * landing page to host them.
 *
 * Source of truth: docs/perf-review/<name>.md
 * Output:          docs/perf-review/<name>.html (one HTML fragment per shipped crate)
 *
 * Pass --check to exit non-zero when the checked-in HTML is stale
 * (used by CI; mirrors scripts/render-readmes.mjs).
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { render } from '../crates/commonmark/index.js'
import { loadCrates } from './sync-registry.mjs'

const root = process.cwd()
const perfReviewDir = join(root, 'docs', 'perf-review')

const RENDER_OPTIONS = {
  gfm: true,
  headingIds: true,
  unsafeHtml: false,
  smartPunctuation: true,
}

function renderDoc(markdown) {
  return `${render(markdown, RENDER_OPTIONS).trimEnd()}\n`
}

function main() {
  const check = process.argv.includes('--check')
  const crates = loadCrates()
  if (crates.length === 0) {
    console.error('render-perf-reviews: no publishable crates found under crates/.')
    process.exit(1)
  }

  if (!check) mkdirSync(perfReviewDir, { recursive: true })

  const stale = []
  let written = 0
  const expected = new Set()

  for (const { dir } of crates) {
    const mdPath = join(perfReviewDir, `${dir}.md`)
    if (!existsSync(mdPath)) continue
    const markdown = readFileSync(mdPath, 'utf-8')
    const html = renderDoc(markdown)
    const outPath = join(perfReviewDir, `${dir}.html`)
    expected.add(`${dir}.html`)
    const existing = existsSync(outPath) ? readFileSync(outPath, 'utf-8') : null
    if (existing === html) continue
    if (check) {
      stale.push(`docs/perf-review/${dir}.html`)
    } else {
      writeFileSync(outPath, html)
      written++
    }
  }

  // Detect orphan HTML files. The .md inventory is co-located with the
  // .html outputs in the same directory, and many of those .md files
  // belong to candidates (unshipped). An "orphan" here is therefore an
  // .html file whose basename is not a shipped crate.
  const orphans = []
  if (existsSync(perfReviewDir)) {
    for (const entry of readdirSync(perfReviewDir)) {
      if (!entry.endsWith('.html')) continue
      if (!expected.has(entry)) orphans.push(`docs/perf-review/${entry}`)
    }
  }

  if (check) {
    if (stale.length === 0 && orphans.length === 0) {
      console.log(`render-perf-reviews: up to date (${expected.size} crates).`)
      return
    }
    console.error('render-perf-reviews: outputs are stale. Run `node scripts/render-perf-reviews.mjs` and commit the result.')
    for (const p of stale) console.error(`  - ${p}`)
    for (const p of orphans) console.error(`  - ${p} (orphan, delete)`)
    process.exit(1)
  }

  for (const orphan of orphans) {
    console.log(`render-perf-reviews: orphan ${orphan} — delete manually.`)
  }
  const tail = written ? `wrote ${written} file${written === 1 ? '' : 's'}` : 'no changes'
  console.log(`render-perf-reviews: ${expected.size} crates — ${tail}.`)
}

const invokedDirectly = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
if (invokedDirectly) {
  main()
}
