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

bash "$ROOT/scripts/typecheck-host.sh"
rm -rf "$PACKAGE/lib/index.js" "$PACKAGE/lib/index.js.map" \
  "$PACKAGE/lib/typert.host.js" "$PACKAGE/lib/typert.host.d.ts" \
  "$PACKAGE/lib/typert.remote-client.js" "$PACKAGE/lib/typert.remote-client.d.ts" \
  "$PACKAGE/lib/typert.remote-client.d.ts.map"
(cd "$PACKAGE" && pnpm exec tsdown --config tsdown.host.config.ts)
node "$ROOT/scripts/generate-typert-host.mjs"

for artifact in index.js typert.host.js typert.host.d.ts typert.remote-client.js typert.remote-client.d.ts; do
  test -f "$PACKAGE/lib/$artifact" || { echo "build: missing lib/$artifact" >&2; exit 1; }
done
