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

import { readdirSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const CRATES_DIR = join(ROOT, 'crates')
const DATA_JSON = join(ROOT, 'docs', 'data.json')
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

function normalize(raw) {
  // Strip only the internal @amigo-labs/ scope so existing crates resolve by
  // their folder name. Keep every other npm scope intact — collapsing
  // @scope/foo → foo would collide with unrelated packages and point
  // reportPath/BACKLOG lookups at the wrong entity.
  const trimmed = raw.trim()
  const internalScope = '@amigo-labs/'
  if (trimmed.startsWith(internalScope)) return trimmed.slice(internalScope.length)
  return trimmed
}

function assertSafeName(name) {
  // Allow npm-valid characters only; this is the identity string AND the
  // substring used to derive reportPath, so anything path-ish is rejected.
  // Scoped names like `@scope/pkg` are valid and get a safe filename below.
  if (!name) die('empty package name after normalization')
  if (name.includes('..') || name.includes('\\') || name.includes('\0')) {
    die(`refusing unsafe package name: ${JSON.stringify(name)}`)
  }
  if (name.startsWith('.') || name.startsWith('/') || name.endsWith('/')) {
    die(`refusing unsafe package name: ${JSON.stringify(name)}`)
  }
  // npm allows exactly one `/` (scope separator). More than one is invalid
  // and would collapse into directory segments in reportPath.
  const slashes = (name.match(/\//g) ?? []).length
  if (slashes > 1) die(`refusing unsafe package name: ${JSON.stringify(name)}`)
  if (slashes === 1 && !name.startsWith('@')) {
    die(`refusing unsafe package name: ${JSON.stringify(name)}`)
  }
}

function safeFilename(name) {
  // Flatten a scoped npm name (@scope/pkg) to a single filename segment so
  // reportPath is always a direct child of docs/perf-review/.
  return name.replace(/^@/, '').replace(/\//g, '__')
}

function listCrates() {
  return readdirSync(CRATES_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith('_'))
    .map((e) => e.name)
    .sort()
}

function extractBenchmarkSuites(data, crateName) {
  // docs/data.json shape: { benchmarks: { suites: [{ name, file, entries }] } }
  // Each suite's `file` is e.g. `crates/<crate>/__bench__/index.bench.ts` —
  // filter by that prefix so we return only the target crate's suites.
  const suites = data?.benchmarks?.suites
  if (!Array.isArray(suites)) return null
  const prefix = `crates/${crateName}/`
  const matched = suites.filter((s) => typeof s.file === 'string' && s.file.startsWith(prefix))
  return matched.length ? matched : null
}

function findBacklogMention(md, name) {
  if (!md) return null
  // Match a markdown bullet line whose bolded label is the package name.
  // Multiline (`m`) anchors ^/$ per line; case-insensitive (`i`) so
  // "Deep-Equal" still matches "deep-equal".
  const pattern = new RegExp(`^-\\s+\\*\\*${escapeRegex(name)}\\*\\*.*$`, 'mi')
  const match = md.match(pattern)
  return match ? match[0] : null
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const name = normalize(rawArg)
assertSafeName(name)
const crates = listCrates()
const cratePath = crates.includes(name) ? join('crates', name) : null
const mode = cratePath ? 'existing' : 'candidate'

const reportFilename = `${safeFilename(name)}.md`

const packagesJson = readJson(PACKAGES_JSON)
const packagesJsonEntry = packagesJson?.packages?.find?.((p) => p.name === name) ?? null

const benchmarkSuites = extractBenchmarkSuites(readJson(DATA_JSON), name)
const backlogEntry = findBacklogMention(readText(BACKLOG_MD), name)
const existingReview = existsSync(join(PERF_REVIEW_DIR, reportFilename))
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
      (d) =>
        !d.startsWith('@amigo-labs/') &&
        !d.startsWith('@napi-rs/') &&
        !d.startsWith('@types/') &&
        d !== 'vitest' &&
        d !== 'fast-check' &&
        d !== 'typescript' &&
        d !== 'tsx',
    ),
  }
}

const result = {
  mode,
  name,
  inputRaw: rawArg,
  packagesJsonEntry,
  benchmarkSuites,
  backlogEntry,
  baselineExists,
  existingReview,
  reportPath: `docs/perf-review/${reportFilename}`,
  ...evidence,
}

process.stdout.write(JSON.stringify(result, null, 2) + '\n')
