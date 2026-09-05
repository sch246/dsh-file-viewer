# DeepSeek Harness File Viewer

## Summary

This repository adds independent plain-text editor instances to the DeepSeek Harness Web right sidebar. Client plugins register document sources and open resources through `ctx.fileViewer`; the viewer keeps local, base and latest source snapshots without assuming that a resource is a file. The separate file-manager plugin supplies user filesystem access, tree navigation and Chat file routing.

## Table of Contents

- [Open documents from another plugin](#open-documents-from-another-plugin)
- [Synchronize a document](#synchronize-a-document)
- [Use source locations](#use-source-locations)
- [Build and install](#build-and-install)
- [Remove the packages](#remove-the-packages)
- [Further Exploration](#further-exploration)
- [Dev Note](#dev-note)

-----

<a id="open-documents-from-another-plugin"></a>
## Open documents from another plugin

A Client plugin registers a source and opens one source-owned resource. The returned instance id addresses every later editor action. Opening the same Session, source and resource identity activates its existing instance without reloading it.

```ts
import type { Context } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { FileViewerSourceId } from '@dsh-external/dsh-file-viewer/client'

export async function openMemoryDocument(ctx: Context, sessionId: SessionId): Promise<() => void> {
  let document = { text: 'Hello from memory.\n', version: 1 }
  const sourceId = FileViewerSourceId('example.memory')
  const unregister = ctx.fileViewer.registerSource({
    id: sourceId,
    supportsConditionalSave: true,
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

Source ids are non-empty and unique while registered. A source without `save` creates read-only instances. A source without `watch` supports manual Update but not automatic update.

-----

<a id="synchronize-a-document"></a>
## Synchronize a document

Each instance compares exact hashes of the common base, local editor text and latest observed source text. Update observes the source while retaining local edits. Save uses the common base revision when the source supports conditional writes; a writable source without conditional writes requires explicit overwrite confirmation. Automatic Save is available only when the source declares conditional writes. Automatic Update requires source watching. Source failures or conflicts pause automation without deleting the local text.

When local and source text both change, the editor shows Base, Local and Source text side by side. Overwrite source and Discard local require separate confirmation. `Ctrl+S` or `Cmd+S` requests an immediate save. A dirty close also requires confirmation.

Sources define canonical text, including line endings and terminal newlines. The generic editor preserves the supplied text and never trims or normalizes it.

-----

<a id="use-source-locations"></a>
## Use source locations

A loaded document can include a plain location label and segments. When it also includes a `selectorId`, selecting the label or a segment launches that registered right-sidebar selector with the source-owned `selectionHint`. The viewer treats labels and hints as opaque values and assumes no path syntax.

The file-manager plugin uses this mechanism for filesystem locations. Memory, generated and remote-backed sources can omit selectors or register their own launcher.

-----

<a id="build-and-install"></a>
## Build and install

Use an explicit DeepSeek Harness `0.1.2-alpha.2` checkout. Setup defaults to read-only inspection and does not patch Harness source or restart a service.

```sh
pnpm install
DSH_CHECKOUT=/path/to/deepseek-harness pnpm run typecheck
DSH_CHECKOUT=/path/to/deepseek-harness pnpm run build

DSH_CHECKOUT=/path/to/deepseek-harness DSH_PROFILE=web pnpm run setup --check
DSH_CHECKOUT=/path/to/deepseek-harness DSH_PROFILE=web pnpm run setup --install
```

Install adds the viewer Bundle and the independent CodeMirror package in one profile operation. The viewer Bundle contributes the source-neutral Client service and editor renderer; the editor package remains a plain dependency and separate browser graph row. An external operator controls service activation.

-----

<a id="remove-the-packages"></a>
## Remove the packages

Removal deletes both profile dependencies in one operation. It does not change Harness source or restart a service.

```sh
DSH_CHECKOUT=/path/to/deepseek-harness DSH_PROFILE=web pnpm run uninstall --check
DSH_CHECKOUT=/path/to/deepseek-harness DSH_PROFILE=web pnpm run uninstall --remove
```

-----

<a id="further-exploration"></a>
## Further Exploration

- [Viewer Bundle reference](packages/dsh-file-viewer/README.md) — composition and ownership.
- [Current intended state](.intent/state/STATE.md) — synchronization and acceptance requirements.
- [Workbench decision](.intent/logs/2026-09-05-source-neutral-editor-workbench.md) — responsibility split.

<a id="dev-note"></a>
## Dev Note

The tracked compatibility patch records an earlier cross-repository contribution. File-manager integration owns any remaining transfer of that patch and its private installation receipt; viewer setup and uninstall leave both untouched.
