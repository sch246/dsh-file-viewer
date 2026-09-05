#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VIEWER_PACKAGE="$ROOT/packages/dsh-file-viewer"
EDITOR_PACKAGE="$ROOT/packages/dsh-file-viewer-editor"
VIEWER_NAME='@dsh-external/dsh-file-viewer'
EDITOR_NAME='@dsh-external/dsh-file-viewer-editor'
CHECKOUT="${DSH_CHECKOUT:?setup: set DSH_CHECKOUT to an explicit Harness checkout}"
PROFILE="${DSH_PROFILE:?setup: set DSH_PROFILE to an explicit profile name}"
PROFILE_HOME="${DSH_HOME:-${HOME:?setup: HOME is required when DSH_HOME is unset}}"
if [ -z "${DSH_HOME:-}" ]; then PROFILE_HOME="$PROFILE_HOME/.dsh"; fi
PROFILE_DIR="$PROFILE_HOME/profiles/$PROFILE"
MODE="${1:---check}"

if [ ! -f "$CHECKOUT/package.json" ] || ! git -C "$CHECKOUT" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "setup: invalid DSH_CHECKOUT: $CHECKOUT" >&2
  exit 1
fi

run_plugin() {
  pnpm --dir "$CHECKOUT" dsh plugin --profile "$PROFILE" "$@"
}

verify_profile_install() {
  run_plugin why "$VIEWER_NAME"
  run_plugin why "$EDITOR_NAME"
  node - "$PROFILE_DIR/package.json" <<'NODE'
const manifest = require(process.argv[2])
const viewer = '@dsh-external/dsh-file-viewer'
const editor = '@dsh-external/dsh-file-viewer-editor'
if (typeof manifest.dependencies?.[viewer] !== 'string') throw new Error(`profile dependency missing: ${viewer}`)
if (typeof manifest.dependencies?.[editor] !== 'string') throw new Error(`profile dependency missing: ${editor}`)
const bundles = manifest.dsh?.profile?.bundles ?? []
if (bundles.filter(value => value === viewer).length !== 1) throw new Error(`profile bundle must contain ${viewer} exactly once`)
if (bundles.includes(editor)) throw new Error(`${editor} is a plain dependency, not a profile bundle`)
NODE
  grep -Fq "$VIEWER_NAME" "$PROFILE_DIR/pnpm-lock.yaml"
  grep -Fq "$EDITOR_NAME" "$PROFILE_DIR/pnpm-lock.yaml"
  test "$(realpath "$PROFILE_DIR/node_modules/$VIEWER_NAME")" = "$(realpath "$VIEWER_PACKAGE")"
  test "$(realpath "$PROFILE_DIR/node_modules/$EDITOR_NAME")" = "$(realpath "$EDITOR_PACKAGE")"
  local dump
  dump="$(pnpm --dir "$CHECKOUT" dsh --profile "$PROFILE" --dump-config)"
  grep -Fq "$VIEWER_NAME" <<<"$dump"
  grep -Fq "$EDITOR_NAME" <<<"$dump"
}

case "$MODE" in
  --check)
    test -f "$VIEWER_PACKAGE/package.json"
    test -f "$EDITOR_PACKAGE/package.json"
    echo 'setup: viewer and editor package sources are present'
    echo 'setup: inspection only; no profile, build artifact, Harness source, or service was changed'
    ;;
  --install)
    DSH_CHECKOUT="$CHECKOUT" bash "$ROOT/scripts/build-host.sh"
    run_plugin add "$VIEWER_PACKAGE" "$EDITOR_PACKAGE"
    verify_profile_install
    echo "setup: installed viewer bundle and editor dependency into profile $PROFILE"
    echo 'setup: no Harness source or service was changed; Bundle membership activates at the next externally managed start'
    ;;
  *)
    echo 'usage: pnpm run setup [--check|--install]' >&2
    exit 2
    ;;
esac
