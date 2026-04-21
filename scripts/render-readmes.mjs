#!/usr/bin/env node

/**
 * Pre-renders every publishable crate's README.md to HTML using the
 * @amigo-labs/commonmark crate (dogfooding) and writes the fragments to
 * docs/readmes/<crate>.html. The landing page lazy-loads these fragments
 * when the user expands the README section of a package slab.
 *
 * Source of truth: crates/<name>/README.md
 * Output:          docs/readmes/<name>.html (one HTML fragment per crate)
 *
 * Pass --check to exit non-zero when the checked-in HTML is stale
 * (used by CI; mirrors scripts/sync-registry.mjs).
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { render } from '../crates/commonmark/index.js'
import { loadCrates } from './sync-registry.mjs'

const root = process.cwd()
const readmesDir = join(root, 'docs', 'readmes')

const RENDER_OPTIONS = {
  gfm: true,
  headingIds: true,
  unsafeHtml: false,
  smartPunctuation: true,
}

function renderReadme(markdown) {
  return `${render(markdown, RENDER_OPTIONS).trimEnd()}\n`
}

function main() {
  const check = process.argv.includes('--check')
  const crates = loadCrates()
  if (crates.length === 0) {
    console.error('render-readmes: no publishable crates found under crates/.')
    process.exit(1)
  }

  if (!check) mkdirSync(readmesDir, { recursive: true })

  const stale = []
  let written = 0
  const expected = new Set()

  for (const { dir } of crates) {
    const readmePath = join(root, 'crates', dir, 'README.md')
    if (!existsSync(readmePath)) {
      console.error(`render-readmes: ${dir} has no README.md, skipping.`)
      continue
    }
    const markdown = readFileSync(readmePath, 'utf-8')
    const html = renderReadme(markdown)
    const outPath = join(readmesDir, `${dir}.html`)
    expected.add(`${dir}.html`)
    const existing = existsSync(outPath) ? readFileSync(outPath, 'utf-8') : null
    if (existing === html) continue
    if (check) {
      stale.push(`docs/readmes/${dir}.html`)
    } else {
      writeFileSync(outPath, html)
      written++
    }
  }

  // Detect orphan HTML files (a crate was removed or renamed).
  const orphans = []
  if (existsSync(readmesDir)) {
    for (const entry of readdirSync(readmesDir)) {
      if (!entry.endsWith('.html')) continue
      if (!expected.has(entry)) orphans.push(`docs/readmes/${entry}`)
    }
  }

  if (check) {
    if (stale.length === 0 && orphans.length === 0) {
      console.log(`render-readmes: up to date (${crates.length} crates).`)
      return
    }
    console.error('render-readmes: outputs are stale. Run `node scripts/render-readmes.mjs` and commit the result.')
    for (const p of stale) console.error(`  - ${p}`)
    for (const p of orphans) console.error(`  - ${p} (orphan, delete)`)
    process.exit(1)
  }

  for (const orphan of orphans) {
    console.log(`render-readmes: orphan ${orphan} — delete manually.`)
  }
  const tail = written ? `wrote ${written} file${written === 1 ? '' : 's'}` : 'no changes'
  console.log(`render-readmes: ${crates.length} crates — ${tail}.`)
}

const invokedDirectly = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
if (invokedDirectly) {
  main()
}
