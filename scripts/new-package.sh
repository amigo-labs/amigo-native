#!/usr/bin/env bash
set -euo pipefail

NAME=${1:?"Usage: ./scripts/new-package.sh <package-name>"}

if [ -d "crates/$NAME" ]; then
  echo "Error: crates/$NAME already exists"
  exit 1
fi

cp -r crates/_template "crates/$NAME"

# Rename template files
for f in crates/$NAME/*.tmpl; do
  mv "$f" "${f%.tmpl}"
done

for f in crates/$NAME/__test__/*.tmpl; do
  mv "$f" "${f%.tmpl}"
done

# Replace template variables
sed -i "s/{{NAME}}/$NAME/g" "crates/$NAME/Cargo.toml"
sed -i "s/{{NAME}}/$NAME/g" "crates/$NAME/package.json"
sed -i "s/{{NAME}}/$NAME/g" "crates/$NAME/src/lib.rs"
sed -i "s/{{NAME}}/$NAME/g" "crates/$NAME/__test__/index.spec.ts"

echo "Created crates/$NAME"
echo "  -> Edit crates/$NAME/src/lib.rs"
echo "  -> Edit crates/$NAME/Cargo.toml (add dependencies)"
echo "  -> Run: cd crates/$NAME && pnpm run build"
