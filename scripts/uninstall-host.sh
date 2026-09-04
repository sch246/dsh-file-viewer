#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CHECKOUT="${DSH_CHECKOUT:?uninstall: set DSH_CHECKOUT to an explicit Harness checkout}"
PROFILE="${DSH_PROFILE:?uninstall: set DSH_PROFILE to an explicit profile name}"
MODE="${1:---check}"

if [ ! -f "$CHECKOUT/package.json" ]; then
  echo "uninstall: invalid DSH_CHECKOUT: $CHECKOUT" >&2
  exit 1
fi

case "$MODE" in
  --check)
    pnpm --dir "$CHECKOUT" dsh plugin --profile "$PROFILE" why '@dsh-external/dsh-file-viewer'
    echo "uninstall: inspection only; no profile or service was changed"
    ;;
  --remove)
    pnpm --dir "$CHECKOUT" dsh plugin --profile "$PROFILE" remove '@dsh-external/dsh-file-viewer'
    echo "uninstall: removed from profile $PROFILE; Harness source and services were not changed"
    ;;
  *)
    echo "usage: pnpm uninstall [--check|--remove]" >&2
    exit 2
    ;;
esac
