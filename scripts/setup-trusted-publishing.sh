#!/usr/bin/env bash
set -euo pipefail

# Configure npm trusted publishing (OIDC) for @amigo-labs packages.
# Links packages to the GitHub Actions release workflow so they can be
# published without a stored NPM_TOKEN secret.
#
# Prerequisites:
#   - npm >= 11.10.0 (run: npm install -g npm@latest)
#   - npm login (run: npm login)
#
# Usage:
#   ./scripts/setup-trusted-publishing.sh              # all packages
#   ./scripts/setup-trusted-publishing.sh --dry-run     # preview only
#   ./scripts/setup-trusted-publishing.sh --package csv  # single crate

REPO="amigo-labs/amigo-native"
WORKFLOW="release.yml"
DRY_RUN=""
SINGLE_CRATE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)  DRY_RUN="--dry-run"; shift ;;
    --package)  SINGLE_CRATE="$2"; shift 2 ;;
    -h|--help)
      echo "Usage: $0 [--dry-run] [--package <crate-name>]"
      echo
      echo "Options:"
      echo "  --dry-run            Preview without making changes"
      echo "  --package <name>     Configure a single crate (e.g. csv, slugify)"
      exit 0
      ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

if [[ -n "$DRY_RUN" ]]; then
  echo "Dry run mode — no changes will be made"
  echo
fi

# Check npm version
NPM_VERSION=$(npm --version)
NPM_MAJOR=$(echo "$NPM_VERSION" | cut -d. -f1)
NPM_MINOR=$(echo "$NPM_VERSION" | cut -d. -f2)
if [[ "$NPM_MAJOR" -lt 11 ]] || { [[ "$NPM_MAJOR" -eq 11 ]] && [[ "$NPM_MINOR" -lt 10 ]]; }; then
  echo "Error: npm >= 11.10.0 required (current: $NPM_VERSION)"
  echo "Run: npm install -g npm@latest"
  exit 1
fi

# Check login
if ! npm whoami &>/dev/null; then
  echo "Error: not logged in to npm"
  echo "Run: npm login"
  exit 1
fi

PLATFORMS=(darwin-arm64 darwin-x64 linux-arm64-gnu linux-x64-gnu linux-x64-musl win32-x64-msvc)

if [[ -n "$SINGLE_CRATE" ]]; then
  CRATES=("$SINGLE_CRATE")
else
  CRATES=(argon2 csv sanitize-html slugify xxhash)
fi

CONFIGURED=0
SKIPPED=0
FAILED=()
SKIPPED_PKGS=()

pkg_exists() {
  npm view "$1" version &>/dev/null 2>&1
}

configure_pkg() {
  local pkg="$1"

  if ! pkg_exists "$pkg"; then
    SKIPPED=$((SKIPPED + 1))
    SKIPPED_PKGS+=("$pkg")
    echo "  SKIP (not published yet)"
    return
  fi

  if npm trust github "$pkg" --file "$WORKFLOW" --repo "$REPO" --yes $DRY_RUN 2>&1; then
    CONFIGURED=$((CONFIGURED + 1))
  else
    FAILED+=("$pkg")
  fi
  sleep 1
}

TOTAL=$(( ${#CRATES[@]} * (1 + ${#PLATFORMS[@]}) ))
COUNT=0

echo "Configuring trusted publishing for ${#CRATES[@]} crate(s) ($TOTAL packages)..."
echo "Repository: $REPO"
echo "Workflow:   $WORKFLOW"
echo
echo "Tip: on the first 2FA prompt, check 'skip 2FA for 5 minutes'"
echo

for crate in "${CRATES[@]}"; do
  COUNT=$((COUNT + 1))
  PKG="@amigo-labs/$crate"
  echo "[$COUNT/$TOTAL] $PKG"
  configure_pkg "$PKG"

  for platform in "${PLATFORMS[@]}"; do
    COUNT=$((COUNT + 1))
    PKG="@amigo-labs/$crate-$platform"
    echo "[$COUNT/$TOTAL] $PKG"
    configure_pkg "$PKG"
  done
done

echo
echo "Results: $CONFIGURED configured, $SKIPPED skipped, ${#FAILED[@]} failed"

if [[ ${#SKIPPED_PKGS[@]} -gt 0 ]]; then
  echo
  echo "Skipped (not yet published — run this script again after first publish):"
  for pkg in "${SKIPPED_PKGS[@]}"; do
    echo "  - $pkg"
  done
fi

if [[ ${#FAILED[@]} -gt 0 ]]; then
  echo
  echo "Failed:"
  for pkg in "${FAILED[@]}"; do
    echo "  - $pkg"
  done
  exit 1
fi
