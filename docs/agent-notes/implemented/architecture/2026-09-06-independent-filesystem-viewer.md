# Independent filesystem viewer

The viewer owns the browser `filesystem` source over `@dsh-external/dsh-user-files`. The shared provider owns authenticated path resolution, bounded text and byte reads, EOL revisions and guarded publication. Manager owns directories and mutations; optional Links owns path discovery. Viewer requires sidebar and the shared provider independently of both optional features.

`FileViewerRemote.metadata` publishes the viewer's validated `resourcePollIntervalMs`. The filesystem source registers before restoration and the file-opening listener. Exact Session/source/path identity preserves shared documents and drafts. Subscription polling waits for each read, cancels on disposal, and suppresses late snapshots.

File opens resolve through the shared Remote and use existing workbench handler selection. Directory and unmatched-handler requests delegate through the Host waterfall; accepted failures do not trigger another opener. Source-owned location callbacks carry opaque persisted hints, allowing filesystem breadcrumbs and explicit system opening to use `openWorkspaceFile` without a manager launcher id. Other sources retain sidebar selectors and independent text/byte capabilities.

The editor remains an internal plain dependency with a compatible independent version range and lazy module loading. Viewer distributes no Host patch; common opening is a Host capability and existing external-project generator support retains its owner. Setup reuses compatible shared dependencies and removes only viewer/editor contributions. Build and installation observations are recorded in the [local log](../../../../.intent/logs/2026-09-06-independent-feature-dependencies.md).
