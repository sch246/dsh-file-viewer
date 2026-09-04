# Agent Note: Session-scoped file viewer platform

Status: implemented

## Problem

Chat has one workspace-file action, but an in-browser viewer needs document state, save conflict handling, presentation, and content adapters without making Chat depend on a specific viewer. Loading workspace files directly in the browser or through Node filesystem APIs would also bypass the Session workspace and configured Harness filesystem policy.

## Decision

The browser `FileViewerService` exclusively owns source registration and per-Session document state. Consumers receive a frozen `ctx.fileViewer` face with source registration and intent-level actions; sources receive document references and abort signals, not store mutation methods. One operation generation per Session prevents superseded loads or saves from publishing stale state.

The built-in workspace source is an adapter over a Host Typert Remote. The Host derives its root from the addressed Session header, resolves and inspects paths through `ctx.fs`, reads complete bounded UTF-8 text, and publishes saves only through the opaque version returned by load. This keeps workspace containment and backend policy at the capability owner.

The Harness contribution is a generic `chat/open-workspace-file` waterfall. The viewer handles or delegates according to Host-owned `openMode`, while Chat retains the terminal native opener. The right-sidebar package owns layout and visibility; the viewer contributes one Files tab and calls its public `openTab` action.

CodeMirror state and view dependencies live in `@dsh-external/dsh-file-viewer-editor`. The viewer Bundle inserts both graph rows at boot, and the Client asks the module service for the editor factory only after a ready document mounts. This separates boot graph availability from `EditorView` lifetime without promising network-lazy delivery.

## Alternatives considered

**Make workspace files the service's only source.** Rejected because browser memory, generated content, and future remote sources would need parallel state owners and presentation paths.

**Expose the document store to providers.** Rejected because providers could bypass operation generations, dirty baselines, conflict state, and Session isolation.

**Put CodeMirror in the main viewer bundle.** Rejected because every viewer lifecycle would own editor dependencies and construction even when no document reaches ready state.

**Fall back to the native opener after every viewer error.** Rejected as the only policy because some deployments need a failed preview to remain visible instead of opening another application. `openMode` makes that choice explicit.

**Read workspace content with Node filesystem APIs.** Rejected because it would create a second path policy and bypass the configured `ctx.fs` backend.

## Consequences

Other plugins can add sources without sharing writable state, and workspace reads and saves retain Harness policy and concurrency protection. The split editor adds one boot graph row and one profile dependency. Installation therefore adds and removes viewer and editor together, while only the viewer package is a Bundle. The setup receipt distinguishes exact setup-owned Host bytes from externally owned or drifted source, so uninstall can fail safely instead of reverting unrelated work.
