#!/usr/bin/env bash
set -euo pipefail

VIEWER_NAME='@dsh-external/dsh-file-viewer'
EDITOR_NAME='@dsh-external/dsh-file-viewer-editor'
CHECKOUT="${DSH_CHECKOUT:?uninstall: set DSH_CHECKOUT to an explicit Harness checkout}"
PROFILE="${DSH_PROFILE:?uninstall: set DSH_PROFILE to an explicit profile name}"
PROFILE_HOME="${DSH_HOME:?set DSH_HOME to the selected Harness home}"
PROFILE_DIR="$PROFILE_HOME/profiles/$PROFILE"
MODE="${1:---check}"

if [ ! -f "$CHECKOUT/package.json" ] || ! git -C "$CHECKOUT" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "uninstall: invalid DSH_CHECKOUT: $CHECKOUT" >&2
  exit 1
fi

profile_state() {
  if [ ! -f "$PROFILE_DIR/package.json" ]; then
    echo "uninstall: profile $PROFILE does not exist"
    return
  fi
  node - "$PROFILE_DIR/package.json" <<'NODE'
const manifest = require(process.argv[2])
for (const name of ['@dsh-external/dsh-file-viewer', '@dsh-external/dsh-file-viewer-editor']) {
  console.log(`uninstall: ${name} dependency=${manifest.dependencies?.[name] ?? 'absent'}`)
}
console.log(`uninstall: viewer bundle=${(manifest.dsh?.profile?.bundles ?? []).includes('@dsh-external/dsh-file-viewer') ? 'present' : 'absent'}`)
NODE
}

run_dsh() {
  (cd "$CHECKOUT" && DSH_HOME="$PROFILE_HOME" node --import tsx/esm apps/cli/src/bin.ts "$@")
}

run_plugin() {
  run_dsh plugin --profile "$PROFILE" "$@"
}

verify_profile_removed() {
  node - "$PROFILE_DIR/package.json" <<'NODE'
const manifest = require(process.argv[2])
for (const name of ['@dsh-external/dsh-file-viewer', '@dsh-external/dsh-file-viewer-editor']) {
  if (manifest.dependencies?.[name] !== undefined) throw new Error(`profile dependency remains: ${name}`)
}
if ((manifest.dsh?.profile?.bundles ?? []).includes('@dsh-external/dsh-file-viewer')) throw new Error('viewer bundle remains')
NODE
  test ! -e "$PROFILE_DIR/node_modules/$VIEWER_NAME"
  test ! -e "$PROFILE_DIR/node_modules/$EDITOR_NAME"
  if [ -f "$PROFILE_DIR/pnpm-lock.yaml" ]; then
    ! grep -Fq "$VIEWER_NAME" "$PROFILE_DIR/pnpm-lock.yaml"
    ! grep -Fq "$EDITOR_NAME" "$PROFILE_DIR/pnpm-lock.yaml"
  fi
}

case "$MODE" in
  --check)
    profile_state
    echo 'uninstall: inspection only; no profile, Harness source, build artifact, or service was changed'
    ;;
  --remove)
    if [ -f "$PROFILE_DIR/package.json" ]; then
      mapfile -t installed < <(node - "$PROFILE_DIR/package.json" <<'NODE'
const manifest = require(process.argv[2])
for (const name of ['@dsh-external/dsh-file-viewer', '@dsh-external/dsh-file-viewer-editor']) {
  if (manifest.dependencies?.[name] !== undefined) console.log(name)
}
NODE
      )
      if [ "${#installed[@]}" -gt 0 ]; then
        run_plugin remove "${installed[@]}"
        verify_profile_removed
      else
        echo "uninstall: profile $PROFILE already omits both packages"
      fi
    else
      echo "uninstall: profile $PROFILE is absent; no profile was changed"
    fi
    echo 'uninstall: no Harness source or service was changed; the running Bundle set is unchanged until its next externally managed start'
    ;;
  *)
    echo 'usage: pnpm run remove [--check|--remove]' >&2
    exit 2
    ;;
esac
