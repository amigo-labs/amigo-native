#!/usr/bin/env node

/**
 * Regenerates the central crate registers from each crate's per-package manifest.
 *
 * Source of truth: `crates/<name>/package.json` → the `"amigo"` block.
 * Outputs:
 *   docs/packages.json          — packages[] (sorted by crate name) + marquee PACKAGES count
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
const releaseYamlPath = join(root, '.github', 'workflows', 'release.yml')

const RELEASE_START = '# PACKAGES:START'
const RELEASE_END = '# PACKAGES:END'

// Crates that intentionally stay Node.js-only. Source of truth for the
// "targets" field both in docs/packages.json and (mirrored) in CI/audit.
// See docs/specs/expansion-2026.md § Node.js server-only tier.
const NODE_ONLY_CRATES = new Set(['argon2', 'jose', 'jwt'])

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

function resolveTargets(dir, amigo) {
  // Honour the per-crate `amigo.targets` if set, otherwise derive from
  // the Node-only allow-list. This keeps the audit deterministic: the
  // 3-crate Node-only group is exactly what NODE_ONLY_CRATES says it is.
  if (Array.isArray(amigo.targets)) return amigo.targets
  return NODE_ONLY_CRATES.has(dir) ? ['node'] : ['node', 'browser']
}

function buildPackagesJson(crates, existing) {
  const existingByName = new Map((existing.packages ?? []).map((p) => [p.name, p]))
  const reviewSet = perfReviewSet()
  const postMortemSet = postMortemSet_()
  let nodeOnlyCount = 0
  let dualCount = 0
  const packages = crates.map(({ dir, amigo }) => {
    const prev = existingByName.get(dir)
    const speedup = prev?.speedup ?? amigo.speedup ?? 'TBD'
    // Categories drive the docs site's category-chip filter. Source of
    // truth is the crate's amigo.category — if it's missing we fall back
    // to whatever was in docs/packages.json so a partial roll-out doesn't
    // erase data, and finally to "util".
    const category = amigo.category ?? prev?.category ?? 'util'
    const targets = resolveTargets(dir, amigo)
    if (targets.includes('browser')) dualCount++
    else nodeOnlyCount++
    const entry = {
      name: dir,
      title: amigo.title,
      category,
      description: amigo.description,
      speedup,
      targets,
      npmUrl: `https://www.npmjs.com/package/@amigo-labs/${dir}`,
      sourceUrl: `https://github.com/amigo-labs/amigo-native/tree/main/crates/${dir}`,
      readmeUrl: `https://github.com/amigo-labs/amigo-native/blob/main/crates/${dir}/README.md`,
    }
    if (reviewSet.has(dir)) {
      entry.perfReviewUrl = `/perf-review/${dir}.md`
    }
    if (postMortemSet.has(dir)) {
      entry.postMortemUrl = `/post-mortems/${dir}.md`
    }
    // Per-target benchmark detail (label / hz / vsJs) is produced by the
    // benchmark report pipeline (generate-report.mjs) and is not derivable
    // from crate metadata. Preserve it across sync — like `speedup` above —
    // so a `bench:report` refresh (often committed with [skip ci]) isn't
    // erased on the next registry sync.
    if (prev?.speedupDetails) {
      entry.speedupDetails = prev.speedupDetails
    }
    return entry
  })
  // Refresh marquee counters in place. PACKAGES stays at total crate count;
  // TARGETS is added/refreshed to reflect the dual-target vs node-only split.
  let marquee = existing.marquee ?? []
  marquee = marquee.map((m) =>
    m.k === 'PACKAGES' ? { ...m, v: String(packages.length) } : m,
  )
  const targetsValue = `NODE + BROWSER (${dualCount}) / NODE-ONLY (${nodeOnlyCount})`
  const idx = marquee.findIndex((m) => m.k === 'TARGETS')
  if (idx >= 0) marquee[idx] = { ...marquee[idx], v: targetsValue }
  else {
    // Insert TARGETS right after PACKAGES if PACKAGES exists; otherwise append.
    const pkgIdx = marquee.findIndex((m) => m.k === 'PACKAGES')
    const entry = { k: 'TARGETS', v: targetsValue }
    if (pkgIdx >= 0) marquee.splice(pkgIdx + 1, 0, entry)
    else marquee.push(entry)
  }
  // Drop the legacy `candidates` block — the docs site no longer surfaces
  // unshipped reviews, and keeping it around invites stale data drift.
  const { candidates: _drop, ...rest } = existing
  return { ...rest, marquee, packages }
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
  const releaseYaml = readFileSync(releaseYamlPath, 'utf-8')
  const nextReleaseYaml = updateReleaseYaml(releaseYaml, crates)
  const pkgChanged = nextPkgStr !== existingPkgStr
  const releaseChanged = nextReleaseYaml !== releaseYaml

  const stubMismatches = checkNpmStubVersions(crates)

  if (check) {
    let stale = pkgChanged || releaseChanged
    if (stale) {
      console.error('sync-registry: outputs are stale. Run `node scripts/sync-registry.mjs` and commit the result.')
      if (pkgChanged) console.error('  - docs/packages.json')
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
  if (releaseChanged) writeFileSync(releaseYamlPath, nextReleaseYaml)
  const summary = []
  if (pkgChanged) summary.push('docs/packages.json')
  if (releaseChanged) summary.push('.github/workflows/release.yml')
  const tail = summary.length ? `wrote ${summary.join(', ')}` : 'no changes'
  console.log(`sync-registry: ${crates.length} crates — ${tail}.`)
}

const invokedDirectly = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
if (invokedDirectly) {
  main()
}
