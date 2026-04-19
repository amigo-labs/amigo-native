#!/usr/bin/env node

/**
 * Measures install footprint of amigo-native packages vs competitors.
 * Outputs size-results.json at the repo root.
 *
 * Amigo sizes = built binary + JS shim (what ships in the npm tarball).
 * Competitor sizes = full node_modules after `npm install`.
 *
 * Competitors are discovered from each crate's package.json `"amigo"` block —
 * no hardcoded list, so adding a crate never touches this file.
 */

import { execSync } from 'node:child_process'
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { loadCrates } from './sync-registry.mjs'

function getDirSize(dir) {
  let total = 0
  try {
    const entries = readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      const entryPath = join(dir, entry.name)
      if (entry.isDirectory()) {
        total += getDirSize(entryPath)
      } else if (entry.isFile()) {
        try {
          total += statSync(entryPath).size
        } catch {
          // skip inaccessible files
        }
      }
    }
  } catch {
    // directory doesn't exist
  }
  return total
}

function measureAmigoSize(crateName) {
  const crateDir = join(process.cwd(), 'crates', crateName)
  if (!existsSync(crateDir)) return null
  let total = 0

  // Measure .node binary + index.js + index.d.ts (what ships in the npm tarball)
  for (const file of readdirSync(crateDir)) {
    if (file.endsWith('.node') || file === 'index.js' || file === 'index.d.ts') {
      total += statSync(join(crateDir, file)).size
    }
  }

  return total
}

function measureNpmInstallSize(packageName) {
  const tmp = mkdtempSync(join(tmpdir(), 'amigo-size-'))
  try {
    execSync(`npm install --prefix "${tmp}" ${packageName} --ignore-scripts --no-audit --no-fund`, {
      stdio: 'pipe',
      timeout: 60000,
    })
    const nmDir = join(tmp, 'node_modules')
    return getDirSize(nmDir)
  } catch (err) {
    console.warn(`  Failed to install ${packageName}: ${err.message}`)
    return null
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}

function formatBytes(bytes) {
  if (bytes === null) return 'N/A'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

console.log('Measuring package sizes...\n')

const results = {}
const crates = loadCrates().filter(({ amigo }) => (amigo.competitors ?? []).length > 0)

for (const { dir: name, amigo } of crates) {
  console.log(`--- ${name} ---`)

  const amigoSize = measureAmigoSize(name)
  if (amigoSize === null || amigoSize === 0) {
    console.log(`  @amigo-labs/${name}: crate not built, skipping`)
    console.log()
    continue
  }
  results[name] = {}
  results[name][`@amigo-labs/${name}`] = { installSize: amigoSize, type: 'binary+shim' }
  console.log(`  @amigo-labs/${name}: ${formatBytes(amigoSize)}`)

  for (const pkg of amigo.competitors) {
    const displayName = pkg.replace(/@[\d.]+$/, '')
    console.log(`  ${pkg}: measuring...`)
    const size = measureNpmInstallSize(pkg)
    results[name][displayName] = { installSize: size, type: 'node_modules' }
    console.log(`  ${pkg}: ${formatBytes(size)}`)
  }

  console.log()
}

const outPath = join(process.cwd(), 'size-results.json')
writeFileSync(outPath, JSON.stringify(results, null, 2))
console.log(`Results written to ${outPath}`)
