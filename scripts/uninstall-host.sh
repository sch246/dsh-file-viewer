#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VIEWER_NAME='@dsh-external/dsh-file-viewer'
EDITOR_NAME='@dsh-external/dsh-file-viewer-editor'
CHECKOUT="${DSH_CHECKOUT:?uninstall: set DSH_CHECKOUT to an explicit Harness checkout}"
PROFILE="${DSH_PROFILE:?uninstall: set DSH_PROFILE to an explicit profile name}"
PROFILE_HOME="${DSH_HOME:-${HOME:?uninstall: HOME is required when DSH_HOME is unset}}"
if [ -z "${DSH_HOME:-}" ]; then PROFILE_HOME="$PROFILE_HOME/.dsh"; fi
PROFILE_DIR="$PROFILE_HOME/profiles/$PROFILE"
PATCH="$ROOT/patches/deepseek-harness.patch"
MODE="${1:---check}"

if [ ! -f "$CHECKOUT/package.json" ] || ! git -C "$CHECKOUT" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "uninstall: invalid DSH_CHECKOUT: $CHECKOUT" >&2
  exit 1
fi
if [ ! -f "$PATCH" ]; then
  echo "uninstall: required Harness compatibility patch is missing: $PATCH" >&2
  exit 1
fi

PATCH_SHA="$(sha256sum "$PATCH" | awk '{print $1}')"
RECEIPT="$(git -C "$CHECKOUT" rev-parse --git-path dsh-file-viewer.patch-state)"
if [[ "$RECEIPT" != /* ]]; then RECEIPT="$CHECKOUT/$RECEIPT"; fi
RECORDED_SHA=""
RECORDED_OWNED=""
if [ -f "$RECEIPT" ]; then
  RECORDED_SHA="$(sed -n 's/^patch_sha256=//p' "$RECEIPT")"
  RECORDED_OWNED="$(sed -n 's/^patch_applied_by_setup=//p' "$RECEIPT")"
fi

patch_state() {
  if git -C "$CHECKOUT" apply --check --reverse "$PATCH" 2>/dev/null; then
    echo present
  elif git -C "$CHECKOUT" apply --check "$PATCH" 2>/dev/null; then
    echo absent
  else
    echo drift
  fi
}

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

run_plugin() {
  pnpm --dir "$CHECKOUT" dsh plugin --profile "$PROFILE" "$@"
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
    state="$(patch_state)"
    echo "uninstall: compatibility patch state=$state, expected sha256:$PATCH_SHA"
    if [ -f "$RECEIPT" ]; then
      echo "uninstall: receipt sha256:${RECORDED_SHA:-missing}, applied_by_setup=${RECORDED_OWNED:-missing}"
    else
      echo 'uninstall: no ownership receipt; Host source will be preserved'
    fi
    profile_state
    if [ "$state" = drift ]; then
      echo 'uninstall: Host contribution has drifted; --remove will refuse source reversal' >&2
      exit 1
    fi
    echo 'uninstall: inspection only; no source, profile, build artifact, or service was changed'
    ;;
  --remove)
    owned=false
    if [ -f "$RECEIPT" ]; then
      if [ "$RECORDED_SHA" != "$PATCH_SHA" ]; then
        echo 'uninstall: ownership receipt names a different patch; refusing all changes' >&2
        exit 1
      fi
      if [ "$RECORDED_OWNED" = true ]; then owned=true; fi
    fi
    state="$(patch_state)"
    if [ "$owned" = true ] && [ "$state" = drift ]; then
      echo 'uninstall: owned Host contribution drifted; preserving source and profile for explicit recovery' >&2
      exit 1
    fi

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

    if [ "$owned" = true ]; then
      if [ "$state" = present ]; then
        git -C "$CHECKOUT" apply --reverse "$PATCH"
      fi
      (cd "$CHECKOUT" && pnpm run build:lib)
      rm -f "$RECEIPT"
      echo 'uninstall: reversed the exact setup-owned Host patch and rebuilt Harness libraries'
    else
      if [ -f "$RECEIPT" ]; then rm -f "$RECEIPT"; fi
      echo 'uninstall: preserved Host source because this setup did not apply the patch'
    fi
    echo 'uninstall: no service restart was performed; the running Bundle set is unchanged until its next externally managed start'
    ;;
  *)
    echo 'usage: pnpm run uninstall [--check|--remove]' >&2
    exit 2
    ;;
esac
