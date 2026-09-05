# Agent Note: Session-scoped text editor platform

Status: implemented

## Problem

Browser features need to present editable text from unrelated providers without sharing mutable document state or coupling the editor to filesystem policy. One Session can contain several open resources, and external source changes can race local edits, reads, saves, watches and instance closure.

## Decision

The browser `FileViewerService` exclusively owns source registration, independent editor instances, content hashes and synchronization actions. Consumers receive a frozen `ctx.fileViewer` face whose actions use opaque instance ids. Sources receive document references and abort signals, not state setters.

Each instance retains exact Base, Local and latest Source text. Content hashes classify their relationship without interpreting line endings or other source syntax. Manual Update observes source text without discarding local edits. Automatic Update requires source watching, and automatic Save requires conditional writes. Conflicts pause automation and remain visible until the user explicitly overwrites the source or discards local text.

The right-sidebar workbench owns launchers, tabs, activation and close gestures. The viewer registers one static `text-editor` renderer and opens one workbench instance per exact Session, source and resource identity. A source can link its opaque location segments to another feature's launcher.

The file-manager plugin owns authenticated user filesystem access, its filesystem source, navigation and Chat filesystem routing. Filesystem UI authorization follows the signed-in user and does not reuse agent sandbox or approval policy. The viewer has no Host Remote or built-in file source.

CodeMirror state, view and undo dependencies live in `@dsh-external/dsh-file-viewer-editor`. The viewer Bundle inserts both browser graph rows. The Client creates an editor only after a ready instance mounts and updates the existing view without adding source refreshes to undo history.

## Alternatives considered

**Let each provider own its editor state.** Rejected because every provider would need duplicate operation generations, dirty-state comparison, automation, conflict behavior and workbench lifecycle wiring.

**Treat a Session as one document slot.** Rejected because switching resources would destroy unrelated local edits and force stale reads to compete for one state owner.

**Give the editor filesystem access.** Rejected because memory and remote-backed sources need the same synchronization behavior, while filesystem authentication and navigation form a separate product responsibility.

**Resolve conflicts automatically.** Rejected because neither local nor source text has general precedence. Explicit directional actions preserve the user's choice.

## Consequences

Client plugins can add sources without sharing writable viewer state. One source implementation defines canonical text, opaque revisions and optional locations for all of its resources. The file-manager can evolve filesystem behavior independently, while the editor keeps one synchronization path for every source. Installation adds and removes viewer and editor together, and its scripts never mutate Harness source.
