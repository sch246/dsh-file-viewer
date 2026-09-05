# DeepSeek Harness Resource Workbench

## Summary

This repository adds generic resource opening to the DeepSeek Harness Web right-sidebar workbench. Client plugins register sources and lazy handlers through `ctx.resourceWorkbench`; text, bytes and source metadata remain separate capabilities. The built-in text editor keeps exact Base, Local and Source state, while the image handler reads bytes without decoding them as text. The separate file-manager plugin supplies user filesystem policy, navigation and Chat routing.

## Table of Contents

- [Open resources from another plugin](#open-resources-from-another-plugin)
- [Choose a handler](#choose-a-handler)
- [Synchronize a document](#synchronize-a-document)
- [Recover browser drafts](#recover-browser-drafts)
- [Use source locations](#use-source-locations)
- [Build and install](#build-and-install)
- [Remove the packages](#remove-the-packages)
- [Further Exploration](#further-exploration)
- [Dev Note](#dev-note)

-----

<a id="open-resources-from-another-plugin"></a>
## Open resources from another plugin

A Client plugin registers independent source capabilities and opens one descriptor. Identity is the exact Session, source and source-owned resource id; name, MIME, kind, size and location are handler-selection metadata. The returned id identifies one view. The same text resource can have several views with shared edits and independent selection, scroll and undo state.

```ts
import type { Context } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { ResourceSourceId } from '@dsh-external/dsh-file-viewer/client'

export async function openMemoryDocument(ctx: Context, sessionId: SessionId): Promise<() => void> {
  let document = { text: 'Hello from memory.\n', version: 1 }
  const sourceId = ResourceSourceId('example.memory')
  const unregister = ctx.resourceWorkbench.registerSource({
    id: sourceId,
    supportsConditionalTextSave: true,
    async readText() {
      return { ...document, descriptor: { name: 'welcome.txt', mediaType: 'text/plain' } }
    },
    async saveText(_ref, text, version) {
      if (version !== document.version) throw new Error('memory document changed')
      document = { text, version: document.version + 1 }
      return { version: document.version }
    },
  })

  await ctx.resourceWorkbench.open({
    ref: { sessionId, sourceId, resourceId: 'welcome' },
    name: 'welcome.txt',
    mediaType: 'text/plain',
  })
  return unregister
}
```

Source ids are non-empty and unique while registered. `readText` and `readBytes` are optional and independent; a byte-only source is never decoded through the text editor. Guarded text and byte writes use `saveText` and `saveBytes` with opaque revisions. Source watching is also content-specific.

Callers place a preview relative to a stable workbench instance, so a file tree can remain in its group while files open to its right:

```ts
await ctx.resourceWorkbench.open(descriptor, {
  target: { fromInstanceId: 'files', direction: 'right' },
  preview: true,
})
```

<a id="choose-a-handler"></a>
## Choose a handler

Selection order is an explicit handler, a saved MIME or extension association, a unique highest-priority default, then a safe source-provided text fallback. Equal defaults show the open-with choice instead of using registration order. Switching handlers retains the tab and group. Handler-owned close guards also apply to switching, and the first edit permanently pins a preview.

The image handler is the default for `image/*`; SVG also offers the text handler. It creates an object URL from `Uint8Array` and renders an `img` element, never native HTML. Custom byte editors use `readBytes`, `writeBytes`, `watchBytes`, `markEdited` and a retained `registerCloseGuard` controller without inheriting text hashing or normalization.

-----

<a id="synchronize-a-document"></a>
## Synchronize a document

Each exact text document compares hashes of the common base, local editor text and latest observed source text. Update observes the source while retaining local edits. Save uses the common base revision when the source supports conditional writes; a writable source without conditional writes requires explicit overwrite confirmation. Automatic preferences inherit global defaults, optional source defaults and explicit resource overrides. Reset removes the resource override. Capabilities gate execution without rewriting the saved preference. Source failures or conflicts pause automation without deleting the local text.

When local and source text both change, the editor shows Base, Local and Source text side by side. Overwrite source and Discard local require separate confirmation. `Ctrl+S` or `Cmd+S` requests an immediate save. A dirty close also requires confirmation.

Sources define canonical text, including line endings and terminal newlines. The generic editor preserves the supplied text and never trims or normalizes it.

-----

<a id="recover-browser-drafts"></a>
## Recover browser drafts

Each ready text document retains its exact Base and Local text in browser `localStorage`, keyed by the complete Session, source and resource identity. The existing version-1 draft format remains readable. Workbench layout persistence stores a JSON-safe descriptor and handler id; JSON-safe selection hints can persist, while opaque revisions and handler memory do not. A later restoration freshly reads Source and reconnects any number of views to the shared document.

A sidebar-committed instance close deletes its retained draft, while a vetoed or superseded close preserves the view and flushes its current edit. Storage parsing, access or quota failures do not replace the live editor text.

Base and Local text can contain sensitive source content. Retention stays in the user's origin-local browser workspace: it is not written to the Session log, sent to the model or logged over the network. Other scripts served from the same origin can access `localStorage`; accepting the document close or clearing site data removes retained content when browser storage is available.

-----

<a id="use-source-locations"></a>
## Use source locations

A resource descriptor or loaded content can include a plain location label and segments. When it also includes a `selectorId`, selecting the label or a segment launches that registered right-sidebar selector with the source-owned `selectionHint`. The workbench treats labels and hints as opaque values and assumes no path syntax.

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
- [Generic resource decision](.intent/logs/2026-09-05-generic-resource-workbench.md) — opening, handler and view/document responsibilities.
- [Implemented architecture note](docs/agent-notes/implemented/architecture/2026-09-05-generic-resource-workbench.md) — durable package ownership and extension rules.
- [Draft persistence decision](.intent/logs/2026-09-05-editor-draft-persistence.md) — local retention and recovery semantics.

<a id="dev-note"></a>
## Dev Note

The tracked compatibility patch records an earlier cross-repository contribution. File-manager integration owns any remaining transfer of that patch and its private installation receipt; viewer setup and uninstall leave both untouched.
