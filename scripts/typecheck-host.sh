#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CHECKOUT="${DSH_CHECKOUT:?typecheck: set DSH_CHECKOUT to an explicit DeepSeek Harness alpha.2 checkout}"

if [ ! -f "$CHECKOUT/package.json" ]; then
  echo "typecheck: invalid DSH_CHECKOUT: $CHECKOUT" >&2
  exit 1
fi
if [ "$(node -p "require('$CHECKOUT/package.json').version")" != "0.1.2-alpha.2" ]; then
  echo "typecheck: DSH_CHECKOUT must be DeepSeek Harness 0.1.2-alpha.2" >&2
  exit 1
fi
if [ -e "$ROOT/harness" ] && [ ! -L "$ROOT/harness" ]; then
  echo "typecheck: refusing to replace non-symlink $ROOT/harness" >&2
  exit 1
fi
rm -f "$ROOT/harness"
ln -s "$CHECKOUT" "$ROOT/harness"

cd "$ROOT"
pnpm exec tsc -p packages/dsh-file-viewer/tsconfig.host.json --pretty false --noEmit
node "$ROOT/scripts/generate-typert-host.mjs"
pnpm exec tsc -p packages/dsh-file-viewer/tsconfig.client.json --pretty false --noEmit
pnpm exec tsc -p packages/dsh-file-viewer-editor/tsconfig.json --pretty false --noEmit
