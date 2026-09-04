# DeepSeek Harness File Viewer

## Summary

This repository adds a session-scoped text editor to the DeepSeek Harness Web right sidebar. Chat file links can open in the browser, continue to the operating-system opener, or try the browser before falling back. Other Client plugins can register document sources without receiving the viewer's writable store, while the built-in workspace source keeps all Host file access behind `ctx.fs` and the Session workspace boundary.

## Table of Contents

- [How it fits together](#how-it-fits-together)
- [Open documents from another plugin](#open-documents-from-another-plugin)
- [Workspace safety and save conflicts](#workspace-safety-and-save-conflicts)
- [Choose the Chat open policy](#choose-the-chat-open-policy)
- [Editor loading and performance](#editor-loading-and-performance)
- [Build and install](#build-and-install)
- [Remove or roll back](#remove-or-roll-back)

-----

<a id="how-it-fits-together"></a>
## How it fits together

The installable `@dsh-external/dsh-file-viewer` Bundle contributes the Host Remote, browser service, Files tab, built-in workspace source, and the `@dsh-external/dsh-file-viewer-editor` graph row. The editor package owns the CodeMirror implementation. The viewer uses the right-sidebar service only to reveal its `files` tab; `FileViewerService` remains the sole owner of registered sources, per-Session document snapshots, and actions.

The public browser service is `ctx.fileViewer`. A document identity contains a Session id, a source id, and a source-owned resource id. Opening a newer document supersedes in-flight load, save, and external-open work for that Session, so a stale completion cannot replace newer state.

-----

<a id="open-documents-from-another-plugin"></a>
## Open documents from another plugin

A Client plugin can register an in-memory or remote-backed source and then open one of its resources. The source owns content and version tokens; the viewer owns presentation and Session state.

```ts
import type { Context } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { FileViewerSourceId } from '@dsh-external/dsh-file-viewer/client'

export async function openMemoryDocument(ctx: Context, sessionId: SessionId): Promise<() => void> {
  let document = { text: 'Hello from memory.\n', version: 1 }
  const sourceId = FileViewerSourceId('example.memory')
  const unregister = ctx.fileViewer.registerSource({
    id: sourceId,
    async load() {
      return { ...document, title: 'welcome.txt' }
    },
    async save(_ref, text, version) {
      if (version !== document.version) throw new Error('memory document changed')
      document = { text, version: document.version + 1 }
      return { version: document.version }
    },
  })

  await ctx.fileViewer.open({ sessionId, sourceId, resourceId: 'welcome' })
  return unregister
}
```

Source ids must be non-empty and unique while registered. The disposer invalidates documents that still refer to that source. Omitting `save` makes its documents read-only; omitting `openExternal` disables the external-open action.

-----

<a id="workspace-safety-and-save-conflicts"></a>
## Workspace safety and save conflicts

The built-in `workspace` source obtains its root from the immutable cwd in the addressed Session header. The Host resolves both root and requested path through `ctx.fs`, verifies containment, rejects a final symlink or non-regular file, enforces the inclusive `maxReadBytes` limit, and accepts only NUL-free valid UTF-8. It does not use Node filesystem APIs for workspace content.

Every load returns an opaque filesystem version after checking that the file did not change during the read. Save sends that exact version to `ctx.fs.writeText` with guarded replacement. A version conflict fails the save and retains the user's dirty browser text. Refresh also refuses to discard dirty text; save or otherwise preserve the edit before refreshing.

-----

<a id="choose-the-chat-open-policy"></a>
## Choose the Chat open policy

`openMode` controls only Chat's workspace-file waterfall. Calls to `ctx.fileViewer.open()` always request a browser document directly.

| Value | Chat file-link behavior |
|---|---|
| `preview` | Handle the link in the Files tab. A preview failure is reported and does not open another application. |
| `system` | Delegate directly to Chat's native operating-system opener. |
| `preview-or-system` | Try the Files tab, then delegate when the viewer open rejects. This is the default. |

The **Show in folder** action continues to use Chat's native `.` request and never enters the file-viewer waterfall.

-----

<a id="editor-loading-and-performance"></a>
## Editor loading and performance

The editor uses CodeMirror 6's state and view packages as a plain-text editor with line wrapping. It deliberately omits language parsers, syntax services, and extension-heavy keymaps, keeping the owned editor graph small and avoiding per-document language-worker cost.

The editor graph row is part of the Bundle's boot composition, so its browser artifact can be discovered and fetched during Client boot. The viewer calls `ctx.modules.import()` and creates an `EditorView` only after a document reaches `ready` and the Files tab mounts. This defers editor materialization and DOM observers; it is not a network-lazy-loading guarantee.

-----

<a id="build-and-install"></a>
## Build and install

Use an explicit clean DeepSeek Harness `0.1.2-alpha.2` checkout. The setup command defaults to read-only patch inspection, and no command restarts a service.

```sh
pnpm install
DSH_CHECKOUT=/path/to/deepseek-harness pnpm run typecheck
DSH_CHECKOUT=/path/to/deepseek-harness pnpm run build

DSH_CHECKOUT=/path/to/deepseek-harness DSH_PROFILE=web pnpm setup
DSH_CHECKOUT=/path/to/deepseek-harness DSH_PROFILE=web pnpm setup -- --apply
DSH_CHECKOUT=/path/to/deepseek-harness DSH_PROFILE=web pnpm setup -- --install
```

`--apply` changes only compatible Harness source and records the exact patch digest and ownership in the checkout's Git-private receipt. `--install` requires that exact patch, rebuilds Harness libraries and both plugin packages, then adds the viewer Bundle and editor package to the profile in one pnpm transaction. The post-install checks require both dependency and lockfile entries, both exact local links, one viewer Bundle entry, no editor Bundle entry, and both composed graph rows.

Bundle membership takes effect when an external operator next starts the profile. Review the target diff and the receipt before authorizing that activation.

-----

<a id="remove-or-roll-back"></a>
## Remove or roll back

Uninstall also defaults to read-only inspection. Explicit removal removes whichever of the two profile dependencies are present in one transaction and reverses Host source only when the receipt proves this setup applied the same patch bytes.

```sh
DSH_CHECKOUT=/path/to/deepseek-harness DSH_PROFILE=web pnpm uninstall
DSH_CHECKOUT=/path/to/deepseek-harness DSH_PROFILE=web pnpm uninstall -- --remove
```

If an owned patch has drifted or the receipt names another digest, removal fails before changing the profile or Host source. If the patch existed before setup, removal preserves it. A successful owned reversal rebuilds Harness libraries and leaves service activation to the external operator.

## Further Exploration

- [Host package contract](packages/dsh-file-viewer/README.md) — workspace Remote configuration, errors, and limits.
- [Current intended state](.intent/state/STATE.md) — stable behavior and acceptance boundaries.
- [Architecture decision](docs/agent-notes/implemented/architecture/2026-09-05-session-scoped-file-viewer-platform.md) — ownership and editor-split rationale.

## Dev Note

None.
