# Official sidebar resource views

Status: implemented

## Ownership

The official Harness sidebar owns Workspace placement, occurrences, preview replacement, history and committed close. Viewer owns source/handler registration, feature view ids, JSON checkpoints and shared documents. The adapter translates ids using `workspaceTabs`; it retains no tab inventory or layout copy. The official `{ instanceId, descriptor }` legacy-import envelope is also the format for newly opened Viewer tabs, so restored drafts keep their complete Session/source/resource identity.

Restoration forwards the official occurrence signal. Cancellation releases unpresented feature state and unshared reads; document release preserves recoverable drafts, while committed close retains its explicit discard behavior.

`workspaceFileOpener` is the common filesystem entry. Viewer resolves arbitrary paths through user-files and accepts files; manager may accept directories. Official Files and DocumentPreview remain independent workspace consumers. The adapter passes the exact official transaction to `openResourceIn`, translates inner checkpoints for history, and calls its `cancel(reason)` when source or handler lifetime ends during guarded placement. A veto or failed claimed open never starts another tab or native fallback.

## Handler ownership

Handlers independently declare capability availability, metadata recommendations and optional automatic detection. Explicit and remembered selections require capabilities but bypass recognition. Exact-resource preferences precede type preferences. The video handler reads a bounded prefix to recognize MPEG-TS and BDAV packet spacing for `video/mp2t`; TypeScript names receive no exception. Prefix reads do not grant full-text loading permission. The HTML iframe occupies remaining view height and owns document scrolling.

## Retired responsibilities

Viewer does not consume `rightSidebar` or `rightbar.view`, and installation does not request the independent sidebar package. Preview plugins consume the injected Viewer service with type-only imports, rather than importing another dynamic Client module at runtime. CodeMirror remains the explicit lazy library graph row. No Host patch, profile mutation or service activation belongs to this migration.

This note supersedes the sidebar integration and automatic handler-selection descriptions in the [generic workbench note](2026-09-05-generic-resource-workbench.md); its document and draft ownership remains unchanged.
