# Releasing

Releases are automated end-to-end via [release-please](https://github.com/googleapis/release-please)
plus the existing `release.yml` publish workflow.

## How it works

```
   feat(argon2): … pushed to main
            │
            ▼
   release-please.yml  ──── on: push: branches: [main]
            │  Updates a single grouped Release PR proposing per-crate
            │  bumps + CHANGELOG entries.
            ▼
   maintainer reviews + merges Release PR
            │
            ▼
   release-please tags each released crate as <crate>@<version>
            │  using RELEASE_PLEASE_TOKEN (NOT the default GITHUB_TOKEN)
            ▼
   release.yml  ──── on: push: tags: '*@*'   (unchanged)
            │  Cross-compiles 6 NAPI targets and publishes to npm with provenance.
            ▼
   @amigo-labs/argon2@0.1.1 published
```

The two workflows are decoupled: release-please owns version bumps, changelogs,
and tags; `release.yml` owns the actual build-and-publish. They communicate
solely via the tag push.

## What gets bumped

For every released crate, release-please updates:

- `crates/<crate>/package.json` `"version"` (the source of truth)
- `crates/<crate>/Cargo.toml` `[package].version` (kept in lockstep via the
  `extra-files` TOML updater in `release-please-config.json`)
- `crates/<crate>/CHANGELOG.md` (created on first release; appended thereafter)
- `.release-please-manifest.json` (records the new version)

What release-please does **not** touch:

- `Cargo.lock` — gitignored, regenerated locally on every `cargo build`.
- `crates/<crate>/npm/<target>/package.json` — the platform stubs are bumped at
  publish time by `release.yml`'s `npm version` step. Don't edit these by hand.
- `docs/packages.json`, the root README package table, and the
  `workflow_dispatch` package list in `release.yml` — those are owned by
  `scripts/sync-registry.mjs` and are independent of versioning.

## The `RELEASE_PLEASE_TOKEN` secret

When a workflow uses the default `GITHUB_TOKEN` to push a tag, GitHub
deliberately suppresses any downstream `on: push: tags:` trigger. Without a
substitute token, release-please would create the tag and `release.yml` would
never fire — the npm publish would silently never happen.

`RELEASE_PLEASE_TOKEN` is a fine-grained PAT (or a GitHub-App-minted token)
scoped to this repository with:

- `Contents: Read and write`
- `Pull requests: Read and write`
- `Workflows: Read and write`

To rotate it, generate a new token with the same scopes and replace the
repository secret. A GitHub App is the long-term hygiene choice over a PAT
attached to a personal account; the workflow doesn't care which is used as
long as the secret name and scopes match.

## Manual overrides

### Force a release without a code change

Push an empty commit on `main` with a crate scope and the `Release-As:` footer.
The scope is mandatory — it tells release-please which package the override
applies to:

```bash
git commit --allow-empty \
  -m "chore(argon2): release" \
  -m "Release-As: 0.2.0"
git push origin main
```

The next release-please run picks up the footer and proposes the requested
version in the Release PR.

### Force a major bump pre-1.0

release-please treats both `feat:` and `feat!:` (breaking) as minor bumps until
a crate crosses 1.0.0. To graduate or to force a major bump on a pre-1.0 crate,
use the `Release-As:` footer with the explicit version (e.g. `Release-As: 1.0.0`).

### Skip a commit from the changelog

Use a commit type that's hidden in `release-please-config.json`'s
`changelog-sections` (e.g. `chore:`, `refactor:`, `test:`). Hidden types still
participate in semver classification — `chore:` does not bump anything;
`refactor:` does not bump anything either — but they don't appear in the
generated CHANGELOG.

## Conventional-commit scope rule

The scope of every commit that should release a crate **must** match a crate
directory name under `crates/`. Examples:

- `fix(argon2): handle salt overflow` → bumps `argon2` patch, appears in
  `crates/argon2/CHANGELOG.md`.
- `feat(text-splitters): add markdown splitter` → bumps `text-splitters` minor.
- `chore: bump dev deps` (no scope) → ignored by release-please, no release.
- `docs(perf-review): note new baseline` → no crate scope, no release.

## Troubleshooting

**Tag was created but nothing published.** The `RELEASE_PLEASE_TOKEN` secret
is missing or the workflow is using `secrets.GITHUB_TOKEN` by accident. Push
the tag manually with a PAT to recover the publish (`git push origin
<crate>@<version>`), then fix the secret.

**A commit is missing from the Release PR.** Check the scope. Commits without
a scope, or with a scope that doesn't match any directory under `crates/`, are
not associated with any package and contribute nothing to a release.

**release-please proposes the wrong version.** Use a `Release-As:` override
on a follow-up empty commit (see "Manual overrides" above) and re-run.

**First-time bootstrap mistakes.** If the initial `bootstrap-sha` or manifest
versions are wrong, edit `release-please-config.json` (`bootstrap-sha`) and
`.release-please-manifest.json` directly and push to main. release-please
resyncs from the manifest on the next run.

**The `toml` extra-file updater isn't bumping `Cargo.toml`.** This indicates
a release-please version that doesn't support the `jsonpath` form. Replace
each crate's `extra-files` entry with a `generic` updater and add a
`# x-release-please-version` marker comment beside the `version =` line in
each `Cargo.toml`.
