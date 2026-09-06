#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CHECKOUT="${DSH_CHECKOUT:?typecheck: set DSH_CHECKOUT to an explicit DeepSeek Harness checkout}"

if [ ! -f "$CHECKOUT/package.json" ]; then
  echo "typecheck: invalid DSH_CHECKOUT: $CHECKOUT" >&2
  exit 1
fi
if [ -e "$ROOT/harness" ] && [ ! -L "$ROOT/harness" ]; then
  echo "typecheck: refusing to replace non-symlink $ROOT/harness" >&2
  exit 1
fi
rm -f "$ROOT/harness"
ln -s "$CHECKOUT" "$ROOT/harness"

cd "$ROOT"
"$ROOT/node_modules/.bin/tsc" -p packages/dsh-file-viewer/tsconfig.host.json --pretty false --noEmit
"$ROOT/node_modules/.bin/tsc" -p packages/dsh-file-viewer/tsconfig.client.json --pretty false --noEmit
"$ROOT/node_modules/.bin/tsc" -p packages/dsh-file-viewer-editor/tsconfig.json --pretty false --noEmit
