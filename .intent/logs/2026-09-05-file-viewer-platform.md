# File viewer platform decision log

Date: 2026-09-05

## Input

The requested product is a session-scoped browser text viewer that handles Chat workspace links and admits future non-workspace sources. Workspace access must retain Harness filesystem policy, browser editing must detect concurrent saves, and installing an external viewer must not give uninstall authority over pre-existing Harness changes.

## Decisions

- One frozen `ctx.fileViewer` face exposes source registration and document actions over a private `FileViewerService` owner.
- The built-in workspace adapter is one ordinary source and uses a Host Typert namespace backed only by `ctx.fs` and Session header cwd.
- CodeMirror lives in a separate editor package and graph row. Boot composition can preload that row, while ready-document mounting controls editor materialization.
- Chat owns a generic file-open waterfall. Deployment chooses preview, system, or preview-then-system behavior without changing callers.
- Setup records exact patch bytes and whether it applied them. Profile installation records both the viewer Bundle and editor dependency; uninstall preserves any patch not proven setup-owned.

## Evidence boundary

Repository tests and source establish implementation behavior. A private temporary Home establishes two-package profile resolution. This log records no live deployment, user-visible browser acceptance, protocol adoption, or realization lock.
