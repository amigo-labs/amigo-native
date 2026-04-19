#!/usr/bin/env bash
set -euo pipefail

NAME=${1:?"Usage: ./scripts/new-package.sh <package-name>"}

if [ -d "crates/$NAME" ]; then
  echo "Error: crates/$NAME already exists"
  exit 1
fi

cp -r crates/_template "crates/$NAME"

# Rename template files (recursively across all sub-dirs)
while IFS= read -r -d '' f; do
  mv "$f" "${f%.tmpl}"
done < <(find "crates/$NAME" -type f -name "*.tmpl" -print0)

# Replace template variables in every non-binary file
while IFS= read -r -d '' f; do
  sed -i "s/{{NAME}}/$NAME/g" "$f"
done < <(find "crates/$NAME" -type f \( -name "*.toml" -o -name "*.json" -o -name "*.rs" -o -name "*.ts" -o -name "*.md" \) -print0)

echo "Created crates/$NAME"
echo "  -> Edit crates/$NAME/src/lib.rs"
echo "  -> Edit crates/$NAME/Cargo.toml (add dependencies)"
echo "  -> Edit crates/$NAME/__conformance__/parity.spec.ts (handcrafted invariants)"
echo "  -> Edit crates/$NAME/__conformance__/upstream.spec.ts (clone upstream tests)"
echo "  -> Edit crates/$NAME/__conformance__/fuzz.spec.ts (fast-check properties)"
echo "  -> Edit crates/$NAME/__bench__/index.bench.ts (add benchmarks)"
echo "  -> Delete crates/$NAME/MIGRATION.md if fully drop-in"
echo "  -> Run: pnpm install && cd crates/$NAME && pnpm run build"
