#!/usr/bin/env node

/**
 * Measures install footprint of amigo-native packages vs competitors.
 * Outputs size-results.json at the repo root.
 *
 * Amigo sizes = built binary + JS shim (what ships in the npm tarball).
 * Competitor sizes = full node_modules after `npm install`.
 */

import { execSync } from 'node:child_process'
import { mkdtempSync, rmSync, statSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const PACKAGES = {
  slugify: {
    amigo: { crate: 'slugify' },
    competitors: ['slugify@1.6.6'],
  },
  argon2: {
    amigo: { crate: 'argon2' },
    competitors: ['argon2@0.41.1', 'hash-wasm@4.12.0'],
  },
  xxhash: {
    amigo: { crate: 'xxhash' },
    competitors: ['xxhash-wasm@1.1.0', 'xxhashjs@0.2.2'],
  },
  'sanitize-html': {
    amigo: { crate: 'sanitize-html' },
    competitors: ['sanitize-html@2.17.0', 'isomorphic-dompurify@2.16.0'],
  },
  csv: {
    amigo: { crate: 'csv' },
    competitors: ['csv-parse@5.6.0', 'papaparse@5.4.1'],
  },
}

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

for (const [name, config] of Object.entries(PACKAGES)) {
  console.log(`--- ${name} ---`)
  results[name] = {}

  // Amigo package (binary + JS shim)
  const amigoSize = measureAmigoSize(config.amigo.crate)
  results[name][`@amigo-labs/${name}`] = { installSize: amigoSize, type: 'binary+shim' }
  console.log(`  @amigo-labs/${name}: ${formatBytes(amigoSize)}`)

  // Competitors (full node_modules)
  for (const pkg of config.competitors) {
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
