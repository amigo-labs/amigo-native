#!/usr/bin/env bash
set -euo pipefail

NAME=${1:?"Usage: ./scripts/new-package.sh <package-name>"}

# Validate the package name up front. We feed `$NAME` into `sed` and many
# build-tool inputs that don't escape arbitrary characters; restrict to
# lowercase alphanumerics, dash and underscore to match npm/cargo
# conventions (and the existing `_template`, `_search-core` crate names)
# and to avoid the historical CVE shape (`/`, `&`, `\` in a `sed`
# replacement).
if [[ ! "$NAME" =~ ^[a-z0-9][a-z0-9_-]*$ ]]; then
  echo "Error: package name must match [a-z0-9][a-z0-9_-]* (got: $NAME)" >&2
  exit 1
fi

# wasm-pack emits underscored filenames (amigo-pdf-parse-wasm →
# amigo_pdf_parse_wasm.js) and Rust paths underscore dashes too
# (amigo_<name>_core::). Same character set as $NAME, so safe in sed.
NAME_UNDERSCORE=${NAME//-/_}
CORE_DIR="crates/_${NAME}-core"

if [ -d "crates/$NAME" ]; then
  echo "Error: crates/$NAME already exists"
  exit 1
fi
if [ -d "$CORE_DIR" ]; then
  echo "Error: $CORE_DIR already exists"
  exit 1
fi

cp -r crates/_template "crates/$NAME"
# The pure-Rust core scaffold lives nested at _template/core/ (where the
# workspace globs can't see it) but ships as a sibling crate.
mv "crates/$NAME/core" "$CORE_DIR"

# Rename template files (recursively across all sub-dirs)
while IFS= read -r -d '' f; do
  mv "$f" "${f%.tmpl}"
done < <(find "crates/$NAME" "$CORE_DIR" -type f -name "*.tmpl" -print0)

# Replace template variables in every non-binary file. The validation
# above ensures `$NAME` contains no sed metacharacters (`/`, `&`, `\`).
while IFS= read -r -d '' f; do
  sed -i -e "s/{{NAME}}/$NAME/g" -e "s/{{NAME_UNDERSCORE}}/$NAME_UNDERSCORE/g" "$f"
done < <(find "crates/$NAME" "$CORE_DIR" -type f \( -name "*.toml" -o -name "*.json" -o -name "*.rs" -o -name "*.ts" -o -name "*.md" \) -print0)

echo "Created crates/$NAME, $CORE_DIR and crates/$NAME/wasm"
echo "  -> Implement the algorithm in $CORE_DIR/src/lib.rs (single source of truth)"
echo "  -> Wrap it in crates/$NAME/src/lib.rs (#[napi]) and crates/$NAME/wasm/src/lib.rs (#[wasm_bindgen])"
echo "  -> Extend crates/$NAME/wasm/tests/web.rs (wasm-bindgen-test parity tests)"
echo "  -> Edit crates/$NAME/package.json \"amigo\" block (title, category, description, replaces, competitors)"
echo "  -> Edit crates/$NAME/README.md"
echo "  -> Edit crates/$NAME/__conformance__/parity.spec.ts (handcrafted invariants)"
echo "  -> Edit crates/$NAME/__conformance__/upstream.spec.ts (clone upstream tests)"
echo "  -> Edit crates/$NAME/__conformance__/fuzz.spec.ts (fast-check properties)"
echo "  -> Edit crates/$NAME/__bench__/index.bench.ts (add benchmarks)"
echo "  -> Delete crates/$NAME/MIGRATION.md if fully drop-in"
echo "  -> Add crates/$NAME/npm/ platform-stub dirs (6 targets — copy from an existing crate; audit-crates checks them)"
echo "  -> Run: pnpm install && cd crates/$NAME && pnpm run build:all"
echo "  -> Run: cd crates/$NAME && pnpm run test && pnpm run test:wasm"
echo "  -> Run: node scripts/sync-registry.mjs  # regenerate docs/packages.json + README table"
