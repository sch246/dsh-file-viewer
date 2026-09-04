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

verify_markers() {
  grep -Fq "'chat/open-workspace-file'" "$CHECKOUT/packages/client/ui-chat/src/client/contract/slots.ts"
  grep -Fq 'externalProjectReferences?: boolean' "$CHECKOUT/packages/typert/generator/src/analyzer.ts"
  grep -Fq 'externalProjectReferences?: boolean' "$CHECKOUT/packages/typert/generator/src/workspace.ts"
}

write_receipt() {
  local owned="$1"
  local complete="$2"
  local temporary
  temporary="$(mktemp "${RECEIPT}.tmp.XXXXXX")"
  {
    echo 'receipt_version=1'
    echo "patch_sha256=$PATCH_SHA"
    echo "patch_applied_by_setup=$owned"
    echo "install_complete=$complete"
    echo "host_head=$(git -C "$CHECKOUT" rev-parse HEAD)"
    echo "profile=$PROFILE"
    echo 'markers=chat.open-workspace-file,typert.external-project-references'
    echo "packages=$VIEWER_NAME,$EDITOR_NAME"
  } > "$temporary"
  mv "$temporary" "$RECEIPT"
}

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
    state="$(patch_state)"
    case "$state" in
      present)
        verify_markers || { echo 'setup: compatibility marker verification failed' >&2; exit 1; }
        echo "setup: exact compatibility patch is present (sha256:$PATCH_SHA)"
        ;;
      absent)
        echo 'setup: compatibility patch is not applied; use --apply explicitly' >&2
        exit 1
        ;;
      drift)
        echo 'setup: compatibility patch neither applies nor reverses cleanly; preserve the checkout and inspect drift' >&2
        exit 1
        ;;
    esac
    if [ -f "$RECEIPT" ]; then
      echo "setup: receipt records sha256:${RECORDED_SHA:-missing}, applied_by_setup=${RECORDED_OWNED:-missing}"
    else
      echo 'setup: no ownership receipt is recorded; existing Host changes are externally owned'
    fi
    echo 'setup: inspection only; no source, profile, build artifact, or service was changed'
    ;;
  --apply)
    state="$(patch_state)"
    case "$state" in
      absent)
        git -C "$CHECKOUT" apply "$PATCH"
        verify_markers
        write_receipt true false
        echo "setup: applied and recorded compatibility patch sha256:$PATCH_SHA"
        ;;
      present)
        verify_markers
        if [ -f "$RECEIPT" ] && [ "$RECORDED_SHA" != "$PATCH_SHA" ]; then
          echo 'setup: an ownership receipt exists for a different patch; refusing to replace its provenance' >&2
          exit 1
        fi
        if [ "$RECORDED_OWNED" = true ]; then
          write_receipt true false
          echo 'setup: exact setup-owned compatibility patch is already present'
        else
          write_receipt false false
          echo 'setup: exact compatibility patch predates this setup; recorded external ownership'
        fi
        ;;
      drift)
        echo 'setup: compatibility patch neither applies nor reverses cleanly; no Host files were changed' >&2
        exit 1
        ;;
    esac
    echo 'setup: no profile, build artifact, or service was changed'
    ;;
  --install)
    if [ "$(patch_state)" != present ] || ! verify_markers; then
      echo 'setup: --install requires the exact compatibility patch; run --apply first' >&2
      exit 1
    fi
    if [ -f "$RECEIPT" ] && [ "$RECORDED_SHA" != "$PATCH_SHA" ]; then
      echo 'setup: the ownership receipt names a different patch; refusing a mixed installation' >&2
      exit 1
    fi
    owned=false
    if [ "$RECORDED_OWNED" = true ]; then owned=true; fi
    write_receipt "$owned" false
    (cd "$CHECKOUT" && pnpm run build:lib)
    DSH_CHECKOUT="$CHECKOUT" bash "$ROOT/scripts/build-host.sh"
    run_plugin add "$VIEWER_PACKAGE" "$EDITOR_PACKAGE"
    verify_profile_install
    write_receipt "$owned" true
    echo "setup: installed viewer bundle and editor dependency into profile $PROFILE"
    echo 'setup: no service restart was performed; Bundle membership takes effect at the next externally managed start'
    ;;
  *)
    echo 'usage: pnpm setup -- [--check|--apply|--install]' >&2
    exit 2
    ;;
esac
