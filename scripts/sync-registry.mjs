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
  const reviewSet = perfReviewSet()
  const postMortemSet = postMortemSet_()
  const shippedNames = new Set(crates.map((c) => c.dir))
  const packages = crates.map(({ dir, amigo }) => {
    const prev = existingByName.get(dir)
    const speedup = prev?.speedup ?? amigo.speedup ?? 'TBD'
    // Categories drive the docs site's category-chip filter. Source of
    // truth is the crate's amigo.category — if it's missing we fall back
    // to whatever was in docs/packages.json so a partial roll-out doesn't
    // erase data, and finally to "util".
    const category = amigo.category ?? prev?.category ?? 'util'
    const entry = {
      name: dir,
      title: amigo.title,
      category,
      description: amigo.description,
      speedup,
      npmUrl: `https://www.npmjs.com/package/@amigo-labs/${dir}`,
      sourceUrl: `https://github.com/amigo-labs/amigo-native/tree/main/crates/${dir}`,
      readmeUrl: `https://github.com/amigo-labs/amigo-native/blob/main/crates/${dir}/README.md`,
    }
    if (reviewSet.has(dir)) {
      entry.perfReviewUrl = `perf-review/${dir}.md`
    }
    if (postMortemSet.has(dir)) {
      entry.postMortemUrl = `post-mortems/${dir}.md`
    }
    return entry
  })
  // "Candidates" — packages we evaluated but didn't ship. Surfaced in the
  // docs as a "considered" panel so visitors can see the work behind the
  // selection. Driven by docs/perf-review/<name>.md whose <name> isn't a
  // shipped crate.
  const candidates = []
  for (const name of [...reviewSet].sort()) {
    if (shippedNames.has(name)) continue
    const c = { name, perfReviewUrl: `perf-review/${name}.md` }
    if (postMortemSet.has(name)) c.postMortemUrl = `post-mortems/${name}.md`
    candidates.push(c)
  }
  const marquee = (existing.marquee ?? []).map((m) =>
    m.k === 'PACKAGES' ? { ...m, v: String(packages.length) } : m,
  )
  return { ...existing, marquee, packages, candidates }
}

function perfReviewSet() {
  const dir = join(root, 'docs', 'perf-review')
  if (!existsSync(dir)) return new Set()
  const out = new Set()
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.md')) continue
    out.add(f.slice(0, -3))
  }
  return out
}

function postMortemSet_() {
  const dir = join(root, 'docs', 'post-mortems')
  if (!existsSync(dir)) return new Set()
  const out = new Set()
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.md')) continue
    out.add(f.slice(0, -3))
  }
  return out
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

/**
 * Verify each crate's `npm/<target>/package.json` carries the same
 * version string as its parent. After `napi pre-publish` injects
 * `optionalDependencies: { "@amigo-labs/<name>-<target>": "<parent>" }`,
 * any stub at a stale version no longer exists on the registry and
 * `npm install` falls into the postinstall error path. Returns an array
 * of mismatch descriptors; an empty array means all stubs are aligned.
 */
function checkNpmStubVersions(crates) {
  const mismatches = []
  for (const { dir, pkg } of crates) {
    const npmDir = join(cratesDir, dir, 'npm')
    if (!existsSync(npmDir)) continue
    for (const target of readdirSync(npmDir, { withFileTypes: true })) {
      if (!target.isDirectory()) continue
      const stubPath = join(npmDir, target.name, 'package.json')
      if (!existsSync(stubPath)) continue
      const stub = loadJson(stubPath)
      if (stub.version !== pkg.version) {
        mismatches.push({
          crate: dir,
          target: target.name,
          parent: pkg.version,
          stub: stub.version,
        })
      }
    }
  }
  return mismatches
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

  const stubMismatches = checkNpmStubVersions(crates)

  if (check) {
    let stale = pkgChanged || readmeChanged || releaseChanged
    if (stale) {
      console.error('sync-registry: outputs are stale. Run `node scripts/sync-registry.mjs` and commit the result.')
      if (pkgChanged) console.error('  - docs/packages.json')
      if (readmeChanged) console.error('  - README.md')
      if (releaseChanged) console.error('  - .github/workflows/release.yml')
    }
    if (stubMismatches.length) {
      stale = true
      console.error(
        `sync-registry: ${stubMismatches.length} npm platform stub version(s) drifted from their parent crate.`,
      )
      console.error('  After `napi pre-publish`, stubs must match the parent so optionalDependencies resolve.')
      for (const m of stubMismatches) {
        console.error(`  - crates/${m.crate}/npm/${m.target}/package.json: ${m.stub} (parent ${m.parent})`)
      }
    }
    if (stale) process.exit(1)
    console.log(`sync-registry: up to date (${crates.length} crates, all stubs aligned).`)
    return
  }

  if (stubMismatches.length) {
    console.warn(
      `sync-registry: ${stubMismatches.length} npm platform stub version(s) do not match their parent crate; run --check in CI to fail on drift.`,
    )
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
