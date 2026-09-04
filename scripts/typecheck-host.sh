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

cd "$ROOT"
pnpm exec tsc -b tsconfig.host.json --pretty false
