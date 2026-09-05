# File viewer current intended state

Status: source-defined. This repository uses its own current-state record; it has no selected protocol, accepted realization lock, or recorded live installation.

## Intent

Provide a session-scoped text document platform in DeepSeek Harness Web. Chat can route workspace-file links to a Files tab, other Client plugins can contribute document sources, and the built-in source can load and guard saves without bypassing the Harness filesystem capability.

## Stable behavior

- `FileViewerService` is the only browser owner of source registration, per-Session document snapshots, operation generations, and document actions. The public `ctx.fileViewer` face exposes intent methods but no store setters.
- A source is identified by a non-empty branded id and owns resource ids, loaded text, optional title, optional opaque version, saving, and optional external opening. Duplicate live ids fail.
- Opening a document reveals the right-sidebar `files` tab and starts one Session-scoped load. Later document, save, refresh, external-open, source-removal, and disposal work invalidates the operations it supersedes.
- The workspace source obtains cwd from the addressed Session header and performs containment, metadata, byte reads, UTF-8 validation, and guarded writes through `ctx.fs` only.
- A save publishes only when the source accepts the loaded version. Failure retains dirty text. Refresh refuses dirty state.
- Chat `openMode` is `preview`, `system`, or `preview-or-system`; the last value is the default. The native action remains the terminal waterfall behavior.
- The optional native-opener probe never gates source, listener, or tab registration. A missing or failed probe degrades only the Files toolbar's system-open action.
- The editor graph row is present in boot composition. CodeMirror module materialization and `EditorView` creation wait for a ready document mount; network-lazy delivery is not required.

## Acceptance criteria

- `VIEWER-001`: Two sessions can hold different active documents and edits without sharing snapshots or stale completions.
- `VIEWER-002`: A Client fixture can register an in-memory source, open and save a resource, dispose the source, and observe explicit source-unavailable state without receiving store mutation authority.
- `VIEWER-003`: Workspace loads reject escape, final symlink, non-file, invalid UTF-8, NUL-bearing, oversized, missing, changed-during-read, and cancelled requests through stable Remote categories.
- `VIEWER-004`: Workspace saves require the exact opaque loaded version, enforce the same byte limit, and never overwrite a concurrently changed file.
- `VIEWER-005`: All three Chat policies preserve waterfall ownership: preview handles, system delegates, and preview-or-system delegates only after viewer open rejects.
- `VIEWER-006`: Client boot contains the viewer and editor graph rows, while no CodeMirror view exists before a ready document is mounted.
- `VIEWER-007`: Setup and uninstall inspect by default, mutate only under explicit flags, install both profile dependencies coherently, never restart a service, and reverse only exact setup-owned Host bytes.

## Constraints

- The right-sidebar package owns full-height layout, tab registration, and tab visibility semantics. This package contributes one `files` tab and uses its public `openTab` action.
- The Harness ui-chat package owns the generic `chat/open-workspace-file` waterfall and native terminal opener. The compatibility patch contributes that generic extension point without making Harness depend on this viewer.
- `@dsh-external/dsh-file-viewer-editor` owns CodeMirror dependencies and editor construction. The viewer imports its public client module and does not absorb that implementation.
- `maxReadBytes` is required Host deployment configuration. It is an inclusive limit for loaded bytes and encoded save bytes, not a truncation threshold.

## Non-goals

- Binary, directory, image, diff, language-service, collaborative, or streaming-file presentation.
- Persisting browser editor buffers in the Session log or sending them to the model.
- Restarting, publishing, or asserting acceptance of a live deployment from repository setup.

## Evidence status

Source and focused tests define the current implementation. A temporary private Harness Home verified the complete target package set and browser boot before installation. The live `web` profile then recorded the viewer Bundle and editor dependency, `dsh-web` restarted active, and Chromium observed one boot entry per package plus a selected Files tab with no console or request failures. This evidence records one local deployment, not a portable realization lock or user acceptance.
