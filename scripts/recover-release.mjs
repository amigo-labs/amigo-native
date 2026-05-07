#!/usr/bin/env node

/**
 * Recovers a release-please tag-push that was lost (e.g. because the post-merge
 * release workflow aborted before tagging).
 *
 * Source of truth: `.release-please-manifest.json` and `release-please-config.json`.
 * For each entry the script derives the tag name (using `tag-separator`,
 * `include-component-in-tag`, `include-v-in-tag` and per-package `component`),
 * skips tags that already exist on origin, and creates the missing tags on the
 * commit passed as the first positional argument (default: HEAD).
 *
 * Tag pushes must use a token that can trigger downstream workflows — the
 * default GITHUB_TOKEN cannot. Run locally against a remote whose URL embeds a
 * PAT (e.g. `git remote set-url <name> https://<token>@github.com/<owner>/<repo>`)
 * or that uses an SSH key authorised to push tags.
 *
 * The script is safely re-runnable: tags already present on the remote are
 * skipped, and local tags pointing at the target commit are reused. A local
 * tag pointing at a different commit is treated as a hard error.
 *
 * Usage:
 *   node scripts/recover-release.mjs [<commit-ish>] [--dry-run] [--remote <name>]
 *
 * Examples:
 *   node scripts/recover-release.mjs 14cf4ea --dry-run
 *   node scripts/recover-release.mjs 14cf4ea
 */

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const USAGE =
  'usage: recover-release.mjs [<commit-ish>] [--dry-run] [--remote <name>]'

function die(msg) {
  console.error(`error: ${msg}`)
  console.error(USAGE)
  process.exit(2)
}

function parseArgs(argv) {
  let dryRun = false
  let remote = 'origin'
  const positional = []
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--dry-run') {
      dryRun = true
    } else if (a === '--remote') {
      const value = argv[i + 1]
      if (!value || value.startsWith('--')) {
        die(`--remote requires a value`)
      }
      remote = value
      i++
    } else if (a === '--help' || a === '-h') {
      console.log(USAGE)
      process.exit(0)
    } else if (a.startsWith('--')) {
      die(`unknown option: ${a}`)
    } else {
      positional.push(a)
    }
  }
  if (positional.length > 1) {
    die(`expected at most one commit-ish, got ${positional.length}: ${positional.join(' ')}`)
  }
  return { dryRun, remote, commit: positional[0] ?? 'HEAD' }
}

const { dryRun, remote, commit } = parseArgs(process.argv.slice(2))

const root = process.cwd()
const config = JSON.parse(readFileSync(join(root, 'release-please-config.json'), 'utf8'))
const manifest = JSON.parse(readFileSync(join(root, '.release-please-manifest.json'), 'utf8'))

const separator = config['tag-separator'] ?? '-'
const includeComponent = config['include-component-in-tag'] !== false
const includeV = config['include-v-in-tag'] !== false

function git(...gitArgs) {
  return execFileSync('git', gitArgs, { encoding: 'utf8' }).trim()
}

function localTagSha(tag) {
  try {
    return execFileSync('git', ['rev-parse', '--verify', '--quiet', `refs/tags/${tag}`], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return null
  }
}

const commitSha = git('rev-parse', commit)

const remoteTagsRaw = git('ls-remote', '--tags', remote)
const remoteTags = new Set(
  remoteTagsRaw
    .split('\n')
    .filter(Boolean)
    .map((line) => line.split('\t')[1].replace(/^refs\/tags\//, '').replace(/\^\{\}$/, '')),
)

const plan = []
for (const [path, version] of Object.entries(manifest)) {
  const pkg = config.packages?.[path]
  if (!pkg) {
    console.warn(`skip ${path}: not in release-please-config.json packages`)
    continue
  }
  const component = pkg.component ?? path.split('/').pop()
  const versionPart = includeV ? `v${version}` : version
  const tag = includeComponent ? `${component}${separator}${versionPart}` : versionPart
  plan.push({ path, component, version, tag, exists: remoteTags.has(tag) })
}

const todo = plan.filter((p) => !p.exists)
const skipped = plan.filter((p) => p.exists)

console.log(`commit: ${commitSha}`)
console.log(`remote: ${remote}`)
console.log(`tags to create: ${todo.length}`)
console.log(`tags already on remote (skipped): ${skipped.length}`)
console.log()
for (const p of todo) console.log(`  + ${p.tag}`)
for (const p of skipped) console.log(`  = ${p.tag} (exists)`)

if (dryRun) {
  console.log('\n--dry-run: not pushing')
  process.exit(0)
}

if (todo.length === 0) {
  console.log('\nnothing to do')
  process.exit(0)
}

const conflicts = []
for (const p of todo) {
  const existing = localTagSha(p.tag)
  if (existing && existing !== commitSha) {
    conflicts.push({ tag: p.tag, existing })
  }
}
if (conflicts.length > 0) {
  console.error('\nlocal tags already exist at a different commit:')
  for (const c of conflicts) {
    console.error(`  ${c.tag} -> ${c.existing.slice(0, 7)} (expected ${commitSha.slice(0, 7)})`)
  }
  console.error('\nresolve manually (e.g. `git tag -d <tag>`) and rerun.')
  process.exit(1)
}

console.log()
for (const p of todo) {
  if (localTagSha(p.tag) === commitSha) {
    console.log(`reusing local tag ${p.tag} -> ${commitSha.slice(0, 7)}`)
  } else {
    git('tag', p.tag, commitSha)
    console.log(`tagged ${p.tag} -> ${commitSha.slice(0, 7)}`)
  }
}

const refspecs = todo.map((p) => `refs/tags/${p.tag}`)
git('push', remote, ...refspecs)
console.log(`\npushed ${todo.length} tags to ${remote}`)
