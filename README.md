# DeepSeek Harness Resource Workbench

## Workspace operations

The root is a development workspace; installable packages live under `packages/`. Run these root entries with prepared repository-local dependencies. `DSH_CHECKOUT` selects compatible Host source/declarations; profile operations also require explicit `DSH_HOME` and `DSH_PROFILE`.

| Root entry | Direct command from this repository | Effect |
| --- | --- | --- |
| `build` | `bash scripts/build-host.sh` | Build owned package artifacts. |
| `typecheck` | `bash scripts/typecheck-host.sh` | Check owned Host and Client programs. |
| `setup` | `bash scripts/setup-host.sh` | Inspect by default; append `--install` for installation. |
| `inspect` | `bash scripts/setup-host.sh --check` | Inspect only. |
| `remove` | `bash scripts/uninstall-host.sh` | Inspect by default; append `--remove` for removal. |

Build, typecheck and existing tests call installed Node tools directly; they never install dependencies. Tool versions are TypeScript 5.9.3, tsdown 0.22.14 and Vitest 4.1.8, with pnpm 10.17.1 declared for explicit dependency preparation. Use independent dependency directories when reusing existing package contents. Installation and removal retain the existing `dsh plugin` transactions and never restart services. The `uninstall` alias, where present, has the same inspection default as `remove`.

Each repository and package keeps its own version: compatibility means satisfying declared API ranges, not equal version numbers. Optional cooperation does not make another feature a required dependency. Root and distributed package licenses are MIT, with their copyright notices retained.

## Summary

This repository adds generic resource opening to the DeepSeek Harness Web right-sidebar workbench. Client plugins register sources and lazy handlers through `ctx.resourceWorkbench`; text, bytes and source metadata remain separate capabilities. The built-in text editor keeps exact Base, Local and Source state, while the image handler reads bytes without decoding them as text. The viewer owns the `filesystem` source over `@dsh-external/dsh-user-files`. Sidebar and that shared authenticated provider are required; manager directory navigation and Links recognition are independent optional features. All filesystem clicks use the Host `openWorkspaceFile` helper and its common opening policy.

## Table of Contents

- [Open resources from another plugin](#open-resources-from-another-plugin)
- [Choose a handler](#choose-a-handler)
- [Editor commands and appearance](#editor-commands-and-appearance)
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

Sources report confirmed absence by rejecting reads with `ResourceMissingError` (or a rejection carrying `resourceMissing: true`) or emitting a `{ kind: 'missing', error }` watch event. The workbench retains the view and local text, pauses text automation, and marks the tab title with a strikethrough. Successful reads or watch snapshots clear the marking; unrelated failures and renderer availability do not establish resource existence. The filesystem source maps the shared provider’s `user-files/not-found` code; other errors retain their original diagnostics.

A text source that needs approval rejects before reading content with `ResourceConfirmationRequiredError(sizeBytes, thresholdBytes)`, or emits a `{ kind: 'confirmation-required', error }` text watch event when a loaded file grows. The document presents a neutral size prompt and Load file action. Its explicit decision reaches the source through the optional `ResourceTextAccess` argument on `readText`, `saveText` and `watchText`; only `allowLargeFile: true` permits crossing the loading threshold. An optional `maxConfirmedBytes` restricts that approval to an inclusive existing-file size; the filesystem provider checks it before content reads. Sources return exact byte size through loaded descriptor `size` and save result `sizeBytes`. The decision belongs to the shared open document, survives view remounts, and ends when its last view closes.

Sources may supply `streamText` for progressive initial reads, or `createTextRead(ref)` for a document-owned resumable read used by initial loads and complete refreshes. The retained read exposes `stream(signal, access)` and `dispose()`. Its start event declares whether the canonical prefix is resumed, chunk events append only contiguous text, progress events describe received byte ranges, and complete supplies a revision and optional expected canonical SHA-256. The shared document owns accumulated text and verifies the final digest; source readers retain only transport state. Stop preserves resumable state; completion, last close and source disposal release it. EOF without complete is a failed load.

Sources may supply `saveTextDelta(ref, baseText, text, signal, access)`. Base and Local stay in process; the source chooses its delta transport and returns `ResourceSavedDelta.canonicalHash` for the actual result. This capability permits guarded manual saves despite whole-source divergence; `ResourceSaveConflictError` reports a rejected range without replacing the source diagnostic.

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

The workbench bar displays selectable source breadcrumbs and the selected handler dropdown. Long locations remain complete on one horizontally scrollable line instead of shortening every segment. Filesystem breadcrumbs use copyable `/` separators (including Windows drive paths); directory actions retain the source path. Hovering the location shows its full text. In the dropdown, selecting a handler name switches the current view; its circular default toggle sets or cancels the association without switching views. A supported external-open action is also available there. Tab reaches each independent control; Escape and outside clicks close the dropdown.

The image handler is the default for `image/*`; SVG also offers the text handler. It creates an object URL from `Uint8Array` and renders an `img` element, never native HTML. Custom byte editors use `readBytes`, `writeBytes`, `watchBytes`, `markEdited` and a retained `registerCloseGuard` controller without inheriting text hashing or normalization.

The independently installed [Markdown preview](packages/dsh-markdown-preview/README.md) is available for Markdown names and MIME types in Open with. It renders shared Local text live, including unsaved edits in another editor view. Each preview retains scroll position, clamping only when the content becomes shorter. Its HTML toggle is per view; a separate browser-local default initializes new previews only. Enabled HTML is parsed and sanitized; disabled HTML displays tags literally. Switching between text and preview retains the same document, editor selection and undo state; normal close protection still applies. Preview follows the same source approval and loading state as editing. Embedded HTML tables, images, links and details render as document content, preserving table alignment and image dimensions. Scripts, event handlers, arbitrary styles and embedded frames are filtered. Fenced code remains literal code with Host highlighting and copy controls; GFM tables, task lists, footnotes and math remain supported. Images use HTTP(S), and links use HTTP(S), mailto or document anchors; relative filesystem assets remain unsupported.

The independently installed [HTML preview](packages/dsh-html-preview/README.md) renders complete HTML documents in an opaque-origin sandboxed iframe. Script execution has a per-view toggle and a separate new-view default, initially off. Edits to shared Local text reload the iframe; Reload reruns it. Self-contained pages and absolute web assets work, while relative project files require a separate serving capability. It does not expose Harness DOM or storage to document code.

-----

<a id="editor-commands-and-appearance"></a>
## Editor commands and appearance

Focus the editor to use Ctrl+Home/End for the beginning/end of the complete loaded document; add Shift to extend selection across the document. CodeMirror keeps the complete text while rendering its viewport, so off-screen content participates in selection, copying and commands. Incomplete progressive reads still contain only the received prefix and remain read-only. Ctrl+F opens editor search and Ctrl+H opens replace; search covers the complete loaded text. The Source comparison pane supports search and navigation but cannot replace text. Save and normal undo/redo retain their existing behavior.

The floating editor controls provide font family, font size, theme and language choices. Ctrl+= and Ctrl+- adjust font size while the editor has focus. Typography and theme preferences share the Harness user settings document under `file-viewer`; opening settings or returning to the browser refreshes mounted views without replacing text or undo history. Open configuration opens the provider’s actual settings file in the workbench, including remote deployments. The file-backed provider normally uses `$DSH_HOME/settings.yaml`. Fonts come from the browser machine: the explicit system-font action requests browser permission where supported, and manual family names remain available. Missing fonts fall back to the default monospace stack. Light and dark modes distinguish line numbers with a separate gutter background, boundary and subdued color.

Themes accept supplied theme ids, TextMate `.tmTheme` XML and VS Code JSON/JSONC files, including relative theme includes and token-color files. Custom paths resolve on the Host; relative paths start beside the actual settings document. Theme rules are parsed and cached when loaded or changed, and the optional language pack supplies real TextMate grammars for incremental line coloring. Editor foreground/background, selection, cursor, gutters and token font styles follow supported theme colors; language-server semantic tokens are outside this API.

Fully loaded text remains locally editable when its source cannot save. Save to the original path still follows source permissions. Save as writes Local to another path and switches only the current tab after successful publication, retaining its editor state and later edits. Existing destinations require confirmation and an exact prepared revision; unsaved destination documents or browser drafts block replacement. If a destination is edited during publication, the written copy is reported while the current tab and both local documents remain intact. Incomplete loading and Source comparison panes remain read-only.

Syntax highlighting is optional. Install the separate [language pack](packages/dsh-file-viewer-languages/README.md) to add common languages; the viewer and editor still work as plain text without it. Choose automatic filename detection, plain text or an explicit language in the editor. Other Client plugins can contribute descriptors through `ctx.resourceWorkbench.registerEditorLanguage`; each descriptor supplies an id, label, optional extensions/filenames and an asynchronous loader returning TextMate grammar data (`kind: "textmate"`, `language`, `grammars`) or a plain CodeMirror StreamParser. The editor owns parser-to-extension conversion. Registrations return disposers; removing a provider restores plain text, and stale asynchronous loads cannot override a newer selection.

-----

<a id="synchronize-a-document"></a>
## Synchronize a document

Filesystem text larger than the shared provider’s `maxTextReadBytes` (1 MiB by default) first shows its size and a Load file button. Content reading, hashing, editor construction, watching and new draft retention begin after that action. Confirmed documents retain normal editing, saving and differences with no additional text size cap. If a loaded file grows beyond the threshold, the existing editor and local text remain available while new source reads and synchronization pause for confirmation. Local edits can grow beyond the threshold and save without an output-size prompt; reading an existing large source during a later operation still requires approval. Above the huge tier the inline message explains that browser memory use may greatly exceed file size and the page may become unresponsive; Continue loading explicitly allows the complete file. Approval below that tier carries a byte ceiling, so later unseen source growth cannot silently cross it. There is no separate download endpoint: loading transfers content into the editor. Byte/image limits are independent.

Filesystem content loads use bounded authenticated unary requests with `textReadConcurrency` workers (3 by default). The provider prepares a stable stat fingerprint and fixed raw-byte chunks (1 MiB by default); the browser verifies each chunk SHA-256 and incrementally decodes strict UTF-8 with BOM removal and LF normalization. A black, square-ended 3 px line below the breadcrumbs shows each received interval at its actual file position, leaving holes empty. Only the contiguous prefix enters the read-only preview: the first text appears immediately and later appends coalesce at `progressiveFlushIntervalMs` (300 ms). Lookahead is bounded to twice the worker count beyond the prefix.

Stop and failed requests preserve the prefix and verified out-of-order chunks in the shared open document. Retry prepares the file again and reuses data only when its version, path, size and chunk size still match. A changed plan shows a red interruption and retains the provisional preview; the next explicit Retry starts a fresh read. Resume survives view remounts but ends on page refresh, last close or source disposal. Transient network, incomplete JSON and timeout failures retry up to `textReadRetries` (3), with `textReadTimeoutMs` (15,000 ms) per attempt and exponential `textReadRetryDelayMs` (250 ms), capped by the timeout. Stop, permission, confirmation, stale-version and integrity failures do not retry automatically. Only stable Host completion and one final canonical hash verification enable editing, drafts, comparison and synchronization; the progress line fades afterward. Explicit refresh stages Source through the same segmented transport while retaining Local. Appends and read-only changes retain the same CodeMirror view, selection and scroll.

Filesystem background updates request deltas from the known canonical Source hash. Shared user-files Config bounds retained baselines by canonical string data and entry count, admits a bounded number of background computations without queueing, and limits diff work. Viewer `maxDeltaBytes` defaults to 1 MiB and caps the actual serialized UTF-8 success envelope, additionally bounded by provider policy. A missing/evicted baseline, excessive transfer or exhausted computation budget pauses polling and exposes Update while retaining Local. Automatic checks never fall back to a full-file response. Explicit Update also tries a delta first; unavailable deltas use a complete segmented read under the document's existing size approval. Initial loading remains progressive. Changed-file delta generation still reads the current file on the Host; unchanged stat identity avoids that work but cannot detect writes that preserve every observed stat field.

A source-wide browser permit covers text and byte watches through read, validation, hashing and awaited consumer application. Busy subscriptions skip and reschedule without queueing. The next delay is at least the whole preceding cycle's duration and the size-based idle interval: `resourcePollIntervalMs` (2000 ms in the Bundle), `largeResourcePollIntervalMs` (10,000 ms above largeFileBytes), or `hugeResourcePollIntervalMs` (30,000 ms above hugeFileBytes). Failures and provider busy responses exponentially back off to `resourcePollBackoffMaxMs` (60,000 ms); timing fields are positive ordered integers. Manual actions bypass background admission. Disposal aborts requests and ignores late results. Source watch listeners can return promises and producers must await them; generic invalidations retain their declared full-read behavior, while filesystem failures use explicit failure events.

The document validates every received original-coordinate range and the complete canonical output hash, then applies those ranges to Source blocks while retaining unchanged blocks. With automatic update off, only Source advances. With it on, exact matching remote ranges can update Local alongside unrelated local edits and advance Base to Source, retaining the remaining dirty text. Overlapping edits, shifted lines or an unavailable common Base preserve Local and pause automation for comparison. Editor range transactions map selection and existing undo positions and retain scroll without adding remote changes to undo history. Bad hashes never advance Source or synchronization time.

Each exact text document owns immutable Base, Local and Source block snapshots. CodeMirror reports UTF-16 transaction ranges through `editTextChanges`; the shared document applies them once and other views receive mapped transactions while retaining their own undo, selection and scroll. Untouched block objects and hashes survive position shifts. Local edits split oversized blocks or merge a short neighbor locally; complete deletion drops covered blocks without copying their contents. Viewer Config supplies ordered canonical UTF-8 byte thresholds `textBlockMinBytes`, `textBlockTargetBytes` and `textBlockMaxBytes` (0.5/1/2 MiB); Unicode code points remain whole and final short blocks are permitted. Download decoding supplies these same canonical block objects to the document; raw download hashes remain separate from canonical text hashes.

Local edits publish immediately with pending synchronization checks. Small documents check dirty blocks immediately; large documents wait for input idle at `largeEditCheckDelayMs` (300 ms), with one background check and only the latest pending edit. Canonical Local byte counts include edits independently of UTF-16 offsets and select the delay without whole-document encoding. Checks hash only changed blocks and compare exact content independently of partition boundaries, so undo to Base restores clean state even after splitting or merging. Block hashes never substitute for the standard full canonical SHA-256, which load, save and update still verify. Normal typing and idle checks do not materialize complete text. The snapshot `text` getter and `editText` replacement API remain for explicit full-text consumers; the getter is nonenumerable so metadata copies cannot invoke it. Save captures current text without waiting for the idle timer, and pending checks remain dirty for close guards. Update observes Source while retaining local edits. Filesystem Save computes ordered disjoint changed line ranges against Base, uploads only their replacements and mandatory SHA-256 old-range hashes, and permits unrelated current disk changes outside those ranges. Original line positions are exact; there is no fuzzy relocation. Insertions include an existing neighboring line as context unless the original file is empty. The provider checks every range against one current snapshot before atomic publication and preserves untouched BOM/EOL bytes and terminal-newline state. A range mismatch publishes nothing and appears as a conflict, with no bulk fallback. Generic sources can retain whole-text conditional writes; writable sources without conditional writes require explicit overwrite confirmation.

A delta save returns the actual canonical source hash, size and revision without downloading the full text. When that hash matches captured Local, Base and Source advance normally while edits made during the save remain local. If unrelated source content remains, the saved Base advances to captured Local, current edits remain, and a visible saved-with-other-changes notice pauses automatic synchronization. The viewer neither reports synchronization nor invents Source text; further manual deltas can still save matching ranges against the advanced Base. The last verified Source text/hash pair remains available as a stale delta baseline; it is never paired with the newly reported hash or replaced by Local. Refresh obtains actual Source for comparison. Explicit Overwrite source builds guarded ranges from known current Source and remains separately confirmed.

Synchronization status stays visible in the editor's upper-right corner. Actual updates and saves add independent activity text there; both can appear together. The text cycles through zero to three dots without shifting its width. Reduced-motion preferences disable that animation, and screen readers receive static activity names. Source changes or a synchronized relationship do not mean a save took place. While automatic update is off, status also shows elapsed time since the last successful content load, pull or equal-hash save. This runtime-only document timestamp does not reset on edits, metadata/watch polling, failures or a save that leaves other source changes. Seconds, minutes, hours with minutes and floored days are localized; timers stop while the browser page is hidden or the label is disabled.

Hover, focus or tap the status to reveal Update, Save, Line numbers, Browser draft and Differences. The stack stays open after the pointer leaves; Escape, an outside click or selecting the status closes it. Update and Save perform manual actions, with a left checkbox for the document's automation policy. Hover or focus that checkbox to reveal its separate default checkbox farther left. Line numbers uses the same arrangement, but its button also toggles current visibility. Touch devices expose the default checkboxes directly. Operation activity does not open the controls, while failures, paused automation and conflict-resolution actions stay accessible.

The two synchronization defaults initialize newly opened documents, with optional source defaults taking precedence. Changing a default leaves every existing document's automatic update/save choices unchanged, including during loading, refresh, source reconnection and Session switching. Views of the same exact document share these choices. Closing its last view and reopening initializes from the latest defaults. Capabilities gate execution: automatic update requires watching and automatic save requires conditional writes. The default controls update across views through `subscribeAutomationDefaults`, independently of document subscriptions.

Differences retains the same local editor and adds a read-only source pane only when needed. Both compare against a common base, with red deletions, pale green inserted lines and darker green changed fragments. Base has no separate pane: each comparison has two line-number columns for Base and its current version. Absent lines leave empty numbers, and soft-wrapped continuations do not acquire new numbers. A shared base-aligned row model supplies missing-row spacers and common row heights for both panes, which scroll together. Deleted baseline text and alignment spacers are display-only and excluded from selection, clipboard content, edits and saves. Local edits use the existing guarded synchronization flow; the source pane is read-only. Unchanged sides are omitted, identical sides appear once, and synchronization retains comparison mode except for the one-time reset on entering the large tier. Overwrite source and Discard local still require separate confirmation. `Ctrl+S` or `Cmd+S` requests an immediate save. A dirty close also requires confirmation.

Within pale red deleted rows, the exact removed character fragments have darker red backgrounds. Their ranges update with the comparison without changing selection or copy behavior.

Line-number visibility, expanded controls and comparison mode belong to each resource view and survive in-memory remounts. The browser remembers the default line-number preference; it initializes only new view presentations. Existing views keep their current setting when the default changes. Editor selection, scroll and undo stay with the same local editor across mode changes.

The workbench displays source file size using 1024-based bytes, KiB, MiB and GiB. Viewer Config defines ordered positive `largeFileBytes` and `hugeFileBytes`, defaulting to 10 MiB and 100 MiB. These are configurable user-chosen policies, not measured editor limits. On the first entry above the large tier in an open document, automatic update/save and browser draft writes start off; every view returns to ordinary editing with differences off once. The controls can enable each choice again without later observations resetting it. While both automation choices are off in a large or huge document, content polling stops; manual Update and guarded Save remain available. One orange `!` explains the tier and default choices in its tooltip and accessible text. Size classification uses source metadata, including exact saved bytes, without re-encoding every edit.

Sources define canonical text, including line endings and terminal newlines. The generic editor preserves the supplied text and never trims or normalizes it.

-----

<a id="recover-browser-drafts"></a>
## Recover browser drafts

Each ready text document with Browser draft enabled retains its exact Base and Local text and its automatic update/save choices in browser `localStorage`, keyed by the complete Session, source and resource identity. Version-1 drafts without automation choices remain readable and initialize those choices from current defaults. Workbench layout persistence stores a JSON-safe descriptor and handler id; JSON-safe selection hints can persist, while opaque revisions and handler memory do not. A later restoration freshly reads Source and reconnects any number of views to the shared document while applying the one-time large-tier defaults when applicable.

Large-file confirmation is runtime-only and is requested again after browser restoration. The Browser draft toggle belongs to the shared open document. Disabling it stops new writes while preserving existing records and local edits; enabling it remains subject to browser storage capacity and cannot guarantee recovery for very large drafts. A pending prompt leaves the existing draft record untouched; approval loads Source and restores Base and Local normally.

If a source confirms absence during restoration, a valid stored draft still opens with Base and Local text, unknown Source and source revision, and paused automation. A successful source read reconnects that draft.

A sidebar-committed instance close deletes its retained draft, while a vetoed or superseded close preserves the view and flushes its current edit. Storage parsing, access or quota failures do not replace the live editor text. Equal Base, Local and automation preferences skip an already successful draft write; failed writes remain retryable.

Base and Local text can contain sensitive source content. Retention stays in the user's origin-local browser workspace: it is not written to the Session log, sent to the model or logged over the network. Other scripts served from the same origin can access `localStorage`; accepting the document close or clearing site data removes retained content when browser storage is available.

-----

<a id="use-source-locations"></a>
## Use source locations

A resource descriptor or loaded content can include a plain location label and segments. When it also includes a `selectorId`, selecting the label or a segment launches that registered right-sidebar selector with the source-owned `selectionHint`. The workbench treats labels and hints as opaque values and assumes no path syntax.

Filesystem locations set `selectable: true`; their source `selectLocation` callback routes breadcrumb paths through the common Host helper. Manager handles directories when installed; otherwise Host can use its native opener. Other sources can supply `selectLocation`, register a sidebar selector, or omit selection. Persisted source hints remain JSON-safe and opaque to the generic workbench.

-----

<a id="build-and-install"></a>
## Build and install

Browser entries use the shared [browser build options](scripts/browser-build.ts): CommonJS output must explicitly retain browser dependency resolution, and emitted imports must belong to the declared Host module list or the generated bundle. The build rejects undeclared imports before installation.

Select an explicit compatible `DSH_CHECKOUT` providing authenticated Remotes, `openWorkspaceFile`, and external-project Typert generation. Build its declarations and generator first, then build the independently distributed shared provider and sidebar. Viewer requires the shared Harness settings provider and user-files ^0.1.7 for resumable unary reads, bounded delta updates, guarded saves and prepared Save As publication; the installation planner rejects older providers before changing a profile. This checkout selects Host APIs, not build tools: this repository pins pnpm 10.17.1, TypeScript 5.9.3, tsdown 0.22.14 and Vitest 4.1.8. Setup defaults to inspection and never patches or restarts the Host.

```sh
# Once compatible feature dependencies are published; generates pnpm-lock.yaml:
pnpm install
# Prerelease route without a lockfile, using explicit local packages or tarballs:
DSH_USER_FILES=/path/to/dsh-user-files DSH_SIDEBAR=/path/to/dsh-right-sidebar pnpm run install:local
DSH_CHECKOUT=/path/to/deepseek-harness pnpm run typecheck
DSH_CHECKOUT=/path/to/deepseek-harness pnpm run build

DSH_CHECKOUT=/path/to/deepseek-harness DSH_HOME=/path/to/dsh-home DSH_PROFILE=web pnpm run setup --check
DSH_CHECKOUT=/path/to/deepseek-harness DSH_HOME=/path/to/dsh-home DSH_PROFILE=web pnpm run setup --install
```

For large-file saves, inspect both reverse-proxy request-body limits and Harness `client-connection.maxRequestBodyBytes`. Patch JSON uploads can exceed replacement text size because of escaping, hashes and metadata; replacing every line can still approach a full-file upload. Adjust the actual save route and Host configuration together as needed; a configured tier or raised body ceiling does not establish memory capacity, browser storage availability or reliable operation at every file size.

To add preview handlers independently, build this workspace and use `dsh plugin --profile <name> add /absolute/path/to/packages/dsh-markdown-preview /absolute/path/to/packages/dsh-html-preview` with selected `DSH_HOME`. Install either or both. An existing deployment migrating from the built-in Markdown handler must add the Markdown Bundle in the same maintenance operation that upgrades viewer; preserve its `markdown` handler id so existing tabs restore. Viewer itself contains no fallback Markdown registration. Each preview can be removed independently, and neither requires the other. Root viewer removal also removes these consumers.

For optional syntax highlighting, build this workspace and add `packages/dsh-file-viewer-languages` through `dsh plugin --profile <name> add /absolute/path/to/packages/dsh-file-viewer-languages` from the selected Host with the selected `DSH_HOME`. The pack requires a compatible viewer API (^0.1.2), not an equal package version. It has its own Bundle and can be removed independently through the corresponding `dsh plugin remove` command. Setup of the viewer alone does not install the pack. Before removing the viewer, remove language packs that consume its service; retain independent manager and filesystem features.

The prerelease `install:local` command uses `--lockfile=false`; it does not create a portable dependency lock. Normal `pnpm install` regenerates a lockfile after compatible dependencies are available from the registry. Tarballs are installation inputs and are not tracked in this repository.

Setup reuses installed shared-provider and sidebar versions satisfying the viewer peer ranges. For an absent shared provider, setup uses the distributed provider resolved by this development installation; `DSH_USER_FILES` selects that resolution during `install:local`. Supply `DSH_SIDEBAR` as a package directory or tarball for an absent sidebar. Setup adds missing peers in the same plugin transaction. Sidebar package directories and tarballs are checked for their package name and compatible version before the transaction. Incompatible installed versions fail before mutation so their existing consumers can be reconciled. Build generates viewer Host metadata, Remote declarations, Client code and editor artifacts with repository-local executables. `resourcePollIntervalMs` belongs to the viewer Bundle and defaults to 2000 ms there; provider read limits remain provider configuration. Install adds the viewer Bundle and the independent CodeMirror package in one profile operation. The viewer Bundle contributes the source-neutral Client service and editor renderer; the editor package remains a plain dependency and separate browser graph row. An external operator controls service activation.

-----

<a id="remove-the-packages"></a>
## Remove the packages

Removal deletes viewer, editor and the supplied optional language/preview packages’ profile dependencies in one operation and retains sidebar and the shared provider for other consumers. It does not change Harness source or restart a service.

```sh
DSH_CHECKOUT=/path/to/deepseek-harness DSH_HOME=/path/to/dsh-home DSH_PROFILE=web pnpm run remove --check
DSH_CHECKOUT=/path/to/deepseek-harness DSH_HOME=/path/to/dsh-home DSH_PROFILE=web pnpm run remove --remove
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

The Host owns the common opening helper; external-project Typert support remains owned by its existing capability provider. Viewer distributes no Host patch and setup/uninstall never reverse historical adaptations. Inspect existing receipts when adapting an older Host; preserve skill-manager support and unrelated Host changes. Current build and installation evidence belongs in the [local log](.intent/logs/2026-09-06-independent-feature-dependencies.md).
