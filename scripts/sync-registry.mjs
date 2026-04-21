#!/usr/bin/env node

/**
 * Regenerates the central crate registers from each crate's per-package manifest.
 *
 * Source of truth: `crates/<name>/package.json` → the `"amigo"` block.
 * Outputs:
 *   docs/packages.json          — packages[] (sorted by crate name) + marquee PACKAGES count
 *   README.md                   — the Packages table between <!-- PACKAGES_TABLE:START/END -->
 *   .github/workflows/release.yml — the workflow_dispatch options between # PACKAGES:START/END
 *
 * The `speedup` field in docs/packages.json is preserved per entry, because it is
 * refreshed by scripts/generate-report.mjs from actual bench measurements. New
 * entries fall back to the crate's amigo.speedup value, or "TBD".
 *
 * Pass --check to exit non-zero when outputs are stale (used by CI).
 */

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = process.cwd()
const cratesDir = join(root, 'crates')
const packagesJsonPath = join(root, 'docs', 'packages.json')
const readmePath = join(root, 'README.md')
const releaseYamlPath = join(root, '.github', 'workflows', 'release.yml')

const README_START = '<!-- PACKAGES_TABLE:START -->'
const README_END = '<!-- PACKAGES_TABLE:END -->'
const RELEASE_START = '# PACKAGES:START'
const RELEASE_END = '# PACKAGES:END'

function loadJson(path) {
  return JSON.parse(readFileSync(path, 'utf-8'))
}

export function loadCrates(baseDir = cratesDir) {
  const out = []
  for (const entry of readdirSync(baseDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const pkgPath = join(baseDir, entry.name, 'package.json')
    if (!existsSync(pkgPath)) continue
    const pkg = loadJson(pkgPath)
    if (pkg.private) continue
    if (!pkg.amigo) continue
    if (pkg.amigo.hidden) continue
    out.push({ dir: entry.name, pkg, amigo: pkg.amigo })
  }
  out.sort((a, b) => a.dir.localeCompare(b.dir))
  return out
}

function buildPackagesJson(crates, existing) {
  const existingByName = new Map((existing.packages ?? []).map((p) => [p.name, p]))
  const packages = crates.map(({ dir, amigo }) => {
    const prev = existingByName.get(dir)
    const speedup = prev?.speedup ?? amigo.speedup ?? 'TBD'
    return {
      name: dir,
      title: amigo.title,
      description: amigo.description,
      speedup,
      npmUrl: `https://www.npmjs.com/package/@amigo-labs/${dir}`,
      sourceUrl: `https://github.com/amigo-labs/amigo-native/tree/main/crates/${dir}`,
      readmeUrl: `https://github.com/amigo-labs/amigo-native/blob/main/crates/${dir}/README.md`,
    }
  })
  const marquee = (existing.marquee ?? []).map((m) =>
    m.k === 'PACKAGES' ? { ...m, v: String(packages.length) } : m,
  )
  return { ...existing, marquee, packages }
}

function columnWidths(rows) {
  const widths = Array.from({ length: rows[0].length }, () => 0)
  for (const row of rows) {
    row.forEach((cell, i) => {
      if (cell.length > widths[i]) widths[i] = cell.length
    })
  }
  return widths
}

function renderReadmeTable(crates) {
  const headers = ['Package', 'Description', 'Replaces', 'vs JS', 'Parity', 'Status']
  const rows = crates.map(({ dir, amigo }) => {
    const link = `[\`@amigo-labs/${dir}\`](./crates/${dir})`
    const replaces = amigo.replaces ? `\`${amigo.replaces}\`` : '—'
    const vsJs = amigo.vsJs ?? 'TBD'
    const vsJsFmt = vsJs === 'TBD' ? 'TBD' : `**${vsJs}**`
    return [
      link,
      amigo.tableDescription ?? amigo.description,
      replaces,
      vsJsFmt,
      amigo.parity ?? 'TBD',
      amigo.status ?? 'Drop-in',
    ]
  })
  const widths = columnWidths([headers, ...rows])
  const pad = (cell, w) => cell + ' '.repeat(w - cell.length)
  const headerLine = `| ${headers.map((h, i) => pad(h, widths[i])).join(' | ')} |`
  const sepLine = `| ${widths.map((w) => `:${'-'.repeat(w - 1)}`).join(' | ')} |`
  const bodyLines = rows.map((r) => `| ${r.map((c, i) => pad(c, widths[i])).join(' | ')} |`)
  return [headerLine, sepLine, ...bodyLines].join('\n')
}

function updateReleaseYaml(yaml, crates) {
  const startIdx = yaml.indexOf(RELEASE_START)
  const endIdx = yaml.indexOf(RELEASE_END)
  if (startIdx === -1 || endIdx === -1) {
    throw new Error(
      `release.yml markers missing. Add ${RELEASE_START} and ${RELEASE_END} around the workflow_dispatch options list.`,
    )
  }
  const lineStart = yaml.lastIndexOf('\n', startIdx) + 1
  const indent = yaml.slice(lineStart, startIdx)
  const items = crates.map(({ dir }) => `${indent}- ${dir}`).join('\n')
  const before = yaml.slice(0, startIdx + RELEASE_START.length)
  const after = yaml.slice(endIdx)
  return `${before}\n${items}\n${indent}${after}`
}

function updateReadme(readme, tableBlock) {
  const startIdx = readme.indexOf(README_START)
  const endIdx = readme.indexOf(README_END)
  if (startIdx === -1 || endIdx === -1) {
    throw new Error(
      `README markers missing. Add ${README_START} and ${README_END} around the packages table.`,
    )
  }
  const before = readme.slice(0, startIdx + README_START.length)
  const after = readme.slice(endIdx)
  return `${before}\n${tableBlock}\n${after}`
}

function main() {
  const check = process.argv.includes('--check')
  const crates = loadCrates()
  if (crates.length === 0) {
    console.error('sync-registry: no crates with an "amigo" block found under crates/.')
    process.exit(1)
  }
  const existingPkg = loadJson(packagesJsonPath)
  const nextPkg = buildPackagesJson(crates, existingPkg)
  const nextPkgStr = `${JSON.stringify(nextPkg, null, 2)}\n`
  const existingPkgStr = readFileSync(packagesJsonPath, 'utf-8')
  const readme = readFileSync(readmePath, 'utf-8')
  const table = renderReadmeTable(crates)
  const nextReadme = updateReadme(readme, table)
  const releaseYaml = readFileSync(releaseYamlPath, 'utf-8')
  const nextReleaseYaml = updateReleaseYaml(releaseYaml, crates)
  const pkgChanged = nextPkgStr !== existingPkgStr
  const readmeChanged = nextReadme !== readme
  const releaseChanged = nextReleaseYaml !== releaseYaml

  if (check) {
    if (pkgChanged || readmeChanged || releaseChanged) {
      console.error('sync-registry: outputs are stale. Run `node scripts/sync-registry.mjs` and commit the result.')
      if (pkgChanged) console.error('  - docs/packages.json')
      if (readmeChanged) console.error('  - README.md')
      if (releaseChanged) console.error('  - .github/workflows/release.yml')
      process.exit(1)
    }
    console.log(`sync-registry: up to date (${crates.length} crates).`)
    return
  }

  if (pkgChanged) writeFileSync(packagesJsonPath, nextPkgStr)
  if (readmeChanged) writeFileSync(readmePath, nextReadme)
  if (releaseChanged) writeFileSync(releaseYamlPath, nextReleaseYaml)
  const summary = []
  if (pkgChanged) summary.push('docs/packages.json')
  if (readmeChanged) summary.push('README.md')
  if (releaseChanged) summary.push('.github/workflows/release.yml')
  const tail = summary.length ? `wrote ${summary.join(', ')}` : 'no changes'
  console.log(`sync-registry: ${crates.length} crates — ${tail}.`)
}

const invokedDirectly = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
if (invokedDirectly) {
  main()
}
