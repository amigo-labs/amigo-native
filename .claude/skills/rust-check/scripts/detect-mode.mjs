#!/usr/bin/env node
/**
 * rust-check — resolve one package name to an evaluation mode plus the
 * evidence Claude needs to fill out docs/perf-review/<pkg>.md.
 *
 * Usage (from monorepo root):
 *   node .claude/skills/rust-check/scripts/detect-mode.mjs <name>
 *
 * Output: single JSON object on stdout. Non-zero exit only on missing arg
 * or when cwd is not the monorepo root.
 *
 * Read-only. No network, no subprocess.
 */

import { readdirSync, existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const CRATES_DIR = join(ROOT, 'crates')
const BENCHMARKS_MD = join(ROOT, 'BENCHMARKS.md')
const BACKLOG_MD = join(ROOT, 'BACKLOG.md')
const PACKAGES_JSON = join(ROOT, 'docs', 'packages.json')
const BASELINE_MD = join(ROOT, 'docs', 'BASELINE.md')
const PERF_REVIEW_DIR = join(ROOT, 'docs', 'perf-review')

function die(msg) {
  console.error(`[rust-check] ${msg}`)
  process.exit(2)
}

const rawArg = process.argv[2]
if (!rawArg) {
  die('missing package name. Usage: detect-mode.mjs <name>')
}

if (!existsSync(CRATES_DIR)) {
  die(`crates/ not found in ${ROOT}. Run from the monorepo root.`)
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf-8'))
  } catch {
    return null
  }
}

function readText(path) {
  try {
    return readFileSync(path, 'utf-8')
  } catch {
    return null
  }
}

function isDir(p) {
  try { return statSync(p).isDirectory() } catch { return false }
}

function normalize(raw) {
  // strip scope (@amigo-labs/foo → foo, @scope/foo → foo) and whitespace
  let name = raw.trim()
  if (name.startsWith('@')) {
    const slash = name.indexOf('/')
    if (slash !== -1) name = name.slice(slash + 1)
  }
  return name
}

function listCrates() {
  return readdirSync(CRATES_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith('_'))
    .map((e) => e.name)
    .sort()
}

function extractBenchmarksSection(md, crateName) {
  if (!md) return null
  // Sections are `### <crateName>` until the next `### ` or end of file.
  const marker = `### ${crateName}`
  const start = md.indexOf(marker)
  if (start === -1) return null
  const rest = md.slice(start)
  const nextHeading = rest.search(/\n### /)
  return nextHeading === -1 ? rest.trim() : rest.slice(0, nextHeading).trim()
}

function findBacklogMention(md, name) {
  if (!md) return null
  // Look for a bullet line mentioning the bare name (word-boundary, case-sensitive).
  const pattern = new RegExp(`^-\\s+\\*\\*${escapeRegex(name)}\\*\\*.*$`, 'mi')
  const match = md.match(pattern)
  return match ? match[0] : null
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const name = normalize(rawArg)
const crates = listCrates()
const cratePath = crates.includes(name) ? join('crates', name) : null
const mode = cratePath ? 'existing' : 'candidate'

const packagesJson = readJson(PACKAGES_JSON)
const packagesJsonEntry = packagesJson?.packages?.find?.((p) => p.name === name) ?? null

const benchmarksMdSection = extractBenchmarksSection(readText(BENCHMARKS_MD), name)
const backlogEntry = findBacklogMention(readText(BACKLOG_MD), name)
const existingReview = existsSync(join(PERF_REVIEW_DIR, `${name}.md`))
const baselineExists = existsSync(BASELINE_MD)

let evidence = {}
if (mode === 'existing') {
  const cratePkg = readJson(join(ROOT, cratePath, 'package.json'))
  evidence = {
    cratePath,
    libRs: join(cratePath, 'src', 'lib.rs'),
    cargoToml: join(cratePath, 'Cargo.toml'),
    readme: join(cratePath, 'README.md'),
    benchFile: join(cratePath, '__bench__', 'index.bench.ts'),
    conformanceDir: join(cratePath, '__conformance__'),
    npmPackage: cratePkg?.name ?? `@amigo-labs/${name}`,
    version: cratePkg?.version ?? null,
    jsCompetitors: Object.keys(cratePkg?.devDependencies ?? {}).filter(
      (d) => !d.startsWith('@amigo-labs/') && !d.startsWith('@napi-rs/') && d !== 'vitest' && d !== 'fast-check' && d !== 'typescript' && d !== 'tsx' && d !== '@types/node',
    ),
  }
}

const result = {
  mode,
  name,
  inputRaw: rawArg,
  packagesJsonEntry,
  benchmarksMdSection,
  backlogEntry,
  baselineExists,
  existingReview,
  reportPath: `docs/perf-review/${name}.md`,
  ...evidence,
}

process.stdout.write(JSON.stringify(result, null, 2) + '\n')
