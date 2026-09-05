#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PACKAGE="$ROOT/packages/dsh-file-viewer"
CHECKOUT="${DSH_CHECKOUT:?build: set DSH_CHECKOUT to an explicit DeepSeek Harness alpha.2 checkout}"

if [ ! -f "$CHECKOUT/package.json" ]; then
  echo "build: invalid DSH_CHECKOUT: $CHECKOUT" >&2
  exit 1
fi
if [ -e "$ROOT/harness" ] && [ ! -L "$ROOT/harness" ]; then
  echo "build: refusing to replace non-symlink $ROOT/harness" >&2
  exit 1
fi
rm -f "$ROOT/harness"
ln -s "$CHECKOUT" "$ROOT/harness"

rm -rf "$PACKAGE/lib" "$ROOT/packages/dsh-file-viewer-editor/lib"
(cd "$PACKAGE" && pnpm exec tsc -p tsconfig.client.json --pretty false)
(cd "$ROOT/packages/dsh-file-viewer-editor" && pnpm exec tsc -p tsconfig.json --pretty false)
(cd "$PACKAGE" && pnpm exec tsdown --config tsdown.client.config.ts)
(cd "$ROOT/packages/dsh-file-viewer-editor" && pnpm exec tsdown --config tsdown.config.ts)

for artifact in index.js client.js; do
  test -f "$PACKAGE/lib/$artifact" || { echo "build: missing lib/$artifact" >&2; exit 1; }
done
for artifact in "$ROOT/packages/dsh-file-viewer-editor/lib/index.js" "$ROOT/packages/dsh-file-viewer-editor/lib/client.js"; do
  test -f "$artifact" || { echo "build: missing $artifact" >&2; exit 1; }
done
