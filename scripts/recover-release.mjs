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
 * Tag pushes must use a token that can trigger downstream workflows — the default
 * GITHUB_TOKEN cannot. Run locally with a PAT configured for the remote, or set
 * `GIT_PUSH_REMOTE` to a remote URL that embeds the token.
 *
 * Usage:
 *   node scripts/recover-release.mjs [<commit-sha>] [--dry-run] [--remote <name>]
 *
 * Examples:
 *   node scripts/recover-release.mjs 14cf4ea --dry-run
 *   node scripts/recover-release.mjs 14cf4ea
 */

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const remoteIdx = args.indexOf('--remote')
const remote = remoteIdx >= 0 ? args[remoteIdx + 1] : 'origin'
const positional = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--remote')
const commit = positional[0] ?? 'HEAD'

const config = JSON.parse(readFileSync(join(root, 'release-please-config.json'), 'utf8'))
const manifest = JSON.parse(readFileSync(join(root, '.release-please-manifest.json'), 'utf8'))

const separator = config['tag-separator'] ?? '-'
const includeComponent = config['include-component-in-tag'] !== false
const includeV = config['include-v-in-tag'] !== false

function git(...gitArgs) {
  return execFileSync('git', gitArgs, { encoding: 'utf8' }).trim()
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

console.log()
for (const p of todo) {
  git('tag', p.tag, commitSha)
  console.log(`tagged ${p.tag} -> ${commitSha.slice(0, 7)}`)
}

const refspecs = todo.map((p) => `refs/tags/${p.tag}`)
git('push', remote, ...refspecs)
console.log(`\npushed ${todo.length} tags to ${remote}`)
