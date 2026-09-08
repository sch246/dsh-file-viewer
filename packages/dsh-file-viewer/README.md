---
description: "Generic resource opening with lazy text, image and contributed handlers for a DeepSeek Harness Web profile."
kind: "package-bundle"
---

# @dsh-external/dsh-file-viewer

## Summary

This Bundle adds a generic resource-opening service and one reusable right-sidebar renderer to a Web profile. Client plugins can register content providers, lazy handlers and independent resource views. Add the Bundle together with its text-editor dependency through the repository setup command; the shared `@dsh-external/dsh-user-files` provider supplies authenticated file access while manager directory navigation is optional.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

### Install into a profile

The repository setup command builds and installs the viewer Bundle and editor dependency together. It does not modify Harness source or restart the selected profile.

```sh
DSH_CHECKOUT=/path/to/deepseek-harness DSH_HOME=/path/to/dsh-home DSH_PROFILE=web pnpm run setup --install
```

### What you get

The Bundle inserts the browser `@dsh-external/dsh-file-viewer` row and the independent `@dsh-external/dsh-file-viewer-editor` graph row. The browser service exposes generic source, handler and opening actions through `ctx.resourceWorkbench`. Each resource view uses the static `resource-workbench` sidebar renderer; its selected text, image or contributed handler module loads on demand.

The Bundle registers the `filesystem` source before restoration and file-opening consumers. Its shared provider supplies text with explicit large-file confirmation, bounded bytes and revision-guarded saves independently of Links enablement. Viewer handles supported files through `chat/open-workspace-file`; directories and unsupported handlers delegate. Breadcrumbs and explicit system opening use the same Host helper; the viewer waits for `sessions` and `remote.session` before registering its runtime. The viewer metadata Remote supplies `resourcePollIntervalMs` (2000 ms in the Bundle); validated Host Config supplies ordered `largeFileBytes` (10 MiB) and `hugeFileBytes` (100 MiB) policy tiers. Above the large tier, automatic synchronization, browser draft writes and differences default off once and remain manually enableable; content polling stops while both automation choices are off. Above the huge tier, Continue loading gives stronger inline confirmation. Provider thresholds/byte limits and manager directory polling stay with their respective owners. Other sources can still register independent content capabilities and source-owned location selection.

The initial file panel scales exact bytes into IEC units and displays Load file or Continue loading without creating an editor or fetching content. Viewer requires user-files ^0.1.7 for resumable unary chunks, bounded delta updates and guarded line-range saves. Confirmation belongs to one shared open text document and is passed to its reads, watches and saves. Growth pauses further reads while retaining the current editor text. See [source approval and synchronization](../../README.md#synchronize-a-document).

Approved initial filesystem loads progressively show read-only text, with Stop loading, Retry loading and positional black segments showing verified received ranges. Retries reuse verified chunks within the same open document after checking the prepared file identity; page refresh and last close release the cache. A failed partial load displays a red Loading interrupted alert with the source diagnostic and retains the read-only preview for retry. Only complete validation enables editing and browser draft retention. Appends coalesce at `progressiveFlushIntervalMs` (300 ms by default); refreshes stage validated observations and prefer deltas when a known baseline is available.

Background filesystem checks use bounded deltas and await the entire consumer cycle under one source-wide permit. Size-aware idle delays default to 2/10/30 seconds with measured-work delay and capped failure backoff. Missing baselines and excessive deltas expose manual Update; automatic checks never download the full file. Explicit Update prefers a delta and uses an approved segmented read when a complete observation is required. See [delta updates and polling policy](../../README.md#synchronize-a-document).

Filesystem saves upload SHA-256-guarded changed line ranges against Base; unrelated disk changes remain untouched. A successful save with a differing actual source hash advances saved Base, retains current edits and exposes other source changes without claiming synchronization. Generic sources retain their declared save model. With automatic update off, permanent status also displays time since the last actual content synchronization.

Edits publish UTF-16 transaction ranges into one shared block document. Unchanged canonical text blocks retain their identity and hashes across views and offset shifts; byte lengths are tracked separately. Large-file edits check only dirty block hashes after input remains idle for `largeEditCheckDelayMs` (300 ms by default). One background check runs per document; stale completions cannot replace a later edit. Exact content comparison ignores partition history. Manual Save verifies the full canonical SHA-256 of captured latest text immediately. See [loading, retry and editing configuration](../../README.md#synchronize-a-document).

Synchronization defaults initialize newly opened text documents, subject to one-time large-tier defaults; changes leave existing document choices intact. Exact document references share automation across views, while separate documents own independent choices. Draft restoration retains those choices. See [synchronization](../../README.md#synchronize-a-document) for source defaults, capability requirements and global-default subscriptions.

Confirmed missing resources retain their views and local drafts, including saved drafts restored before the source returns. Text automation stays paused until a successful observation. Sources supply the generic missing signal; sidebar only renders the optional marking. See [source registration and failures](../../README.md#open-resources-from-another-plugin).

Fully loaded text remains locally editable without source write permission; Save as publishes another path and then switches the current tab. Appearance uses the shared Harness settings provider, with TextMate themes, browser-system fonts and an Open configuration action. The optional independent Markdown preview plugin renders sanitized HTML tables, images and links alongside Markdown, and shares unsaved Local text and preserves editor history when switching handlers. Full-document navigation, search/replace, font settings and optional plugin-contributed syntax modes are described in [editor commands and appearance](../../README.md#editor-commands-and-appearance).

The [handler dropdown](../../README.md#choose-a-handler) separates current-view selection from default associations. The text editor keeps synchronization and independent concurrent activities visible while its action stack expands on hover, focus or touch.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

[`cordis.patch.yml`](cordis.patch.yml) inserts the workbench and editor Client rows. [`src/client/workbench.ts`](src/client/workbench.ts) owns resource views, handlers, associations and sidebar restoration. [`src/client/service.ts`](src/client/service.ts) owns shared text documents, exact hashes and guarded asynchronous operations. The CodeMirror implementation stays in the sibling editor package and materializes after a ready or partial text view mounts.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Repository guide](../../README.md) — source registration, synchronization and installation.
- [Current intended state](../../.intent/state/STATE.md) — acceptance requirements.

-----

<a id="model-experience"></a>
## Model Experience

None. This Bundle changes human browser presentation and adds no model-visible input or tool.

<a id="known-limitations-and-deferred-work"></a>
## Known Limitations and Deferred Work

- The editor progressively previews initial loads and edits complete plain text. Filesystem text above the configured threshold requires a document-scoped Load file action; approval retains all editor capabilities. Sources own confirmation thresholds, canonical line representation and completion integrity.
- Workbench descriptors and text drafts survive Client recreation; selection, scroll, undo and custom handler state are memory-only.
- The image handler displays bytes but does not edit images. Custom byte handlers own their draft and revision model through the generic byte and close-guard APIs.
- Inline comparisons retain the editable Local document and show Source read-only, using common Base-aligned rows, paired line numbers and linked scrolling. Deleted baseline text and visual padding never enter the document or clipboard. The separate editor package owns alignment and rendering; providers own source-observation latency.

<a id="dev-note"></a>
## Dev Note

None.

## PDF, audio and video

The built-in `pdf`, `audio` and `video` handlers use the browser's PDF reader and native media controls. They require the source's optional `stream` capability and load lazily through the same open-with menu and default associations as the text/image handlers. Audio/video use metadata preload without autoplay, retain playback position and volume settings in view memory, and stop/release their media element on unmount. PDF toolbar features and reading-position retention depend on the browser. Unsupported browsers/codecs show an explanation; preparation and playback errors appear in red with reload available.

The public `ResourceSource.getStream(ref, signal)` and `service.getStream(viewId, signal)` return `ResourceStream { url, mediaType, inline, readBlob? }`. URLs must support browser-element authentication without custom headers and must not be persisted. Preparation participates in source/view cancellation; the renderer owns media elements and Blob URLs. Filesystem PDF preview uses user-files ^0.1.13 to fetch parallel ranges into a complete in-memory Blob before opening the native reader. It requires no local save permission, shows a black progress line, and supports cancellation/retry. Sources without `readBlob` use their embeddable URL. Audio/video use native GET/range requests without whole-file buffering. See [STATE](../../.intent/state/STATE.md#pdf-and-media-readers) for installation and proxy requirements.

The workbench provides no custom download buttons or download preferences. Explicit downloads belong to file-manager; native PDF toolbar actions remain browser-owned. PDF preview and file-manager downloads share the provider's range checks and deployment policy, with separate memory and local-file destinations.
