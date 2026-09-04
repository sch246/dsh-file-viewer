#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PACKAGE="$ROOT/packages/dsh-file-viewer"
CHECKOUT="${DSH_CHECKOUT:?setup: set DSH_CHECKOUT to an explicit Harness checkout}"
PROFILE="${DSH_PROFILE:?setup: set DSH_PROFILE to an explicit profile name}"
PATCH="$ROOT/patches/deepseek-harness.patch"
MODE="${1:---check}"

if [ ! -f "$CHECKOUT/package.json" ] || ! git -C "$CHECKOUT" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "setup: invalid DSH_CHECKOUT: $CHECKOUT" >&2
  exit 1
fi
if [ ! -f "$PATCH" ]; then
  echo "setup: required Harness compatibility patch is missing: $PATCH" >&2
  exit 1
fi

case "$MODE" in
  --check)
    if git -C "$CHECKOUT" apply --check --reverse "$PATCH" 2>/dev/null; then
      echo "setup: compatibility patch is present; no profile or service was changed"
      exit 0
    fi
    if git -C "$CHECKOUT" apply --check "$PATCH" 2>/dev/null; then
      echo "setup: compatibility patch is not applied; rerun with --apply explicitly" >&2
    else
      echo "setup: compatibility patch does not match this Harness checkout" >&2
    fi
    exit 1
    ;;
  --apply)
    git -C "$CHECKOUT" apply --check "$PATCH"
    git -C "$CHECKOUT" apply "$PATCH"
    echo "setup: compatibility patch applied; no profile or service was changed"
    ;;
  --install)
    if ! git -C "$CHECKOUT" apply --check --reverse "$PATCH" 2>/dev/null; then
      echo "setup: exact compatibility patch must already be applied" >&2
      exit 1
    fi
    (cd "$CHECKOUT" && pnpm run build:lib:host)
    DSH_CHECKOUT="$CHECKOUT" bash "$ROOT/scripts/build-host.sh"
    (cd "$PACKAGE" && pnpm --dir "$CHECKOUT" dsh plugin --profile "$PROFILE" add .)
    echo "setup: installed into profile $PROFILE; no service restart was performed"
    ;;
  *)
    echo "usage: pnpm setup [--check|--apply|--install]" >&2
    exit 2
    ;;
esac
