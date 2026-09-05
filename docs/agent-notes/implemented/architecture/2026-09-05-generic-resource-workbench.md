# Agent Note: Generic resource workbench

Status: implemented

## Problem

Browser features need one deterministic route for opening text, bytes and future resource types into sidebar groups. A text-only instance model cannot safely choose non-text viewers, preserve one document across side-by-side views or restore resource tabs without duplicating sidebar layout state. External source changes can also race local edits, reads, writes, watches and asynchronous view transitions.

## Decision

The frozen `ctx.resourceWorkbench` face owns source registration, lazy handler registration, handler selection, associations and resource views. A descriptor identifies a resource by exact Session, source and source-owned id; name, MIME, kind, size and optional location are selection and presentation metadata.

Sources expose text and bytes independently. Text handlers use one shared document per exact reference, with Base, Local and Source text, opaque revisions, exact hashes, operation generations and conflict-paused automation. Byte handlers read, guarded-write and watch `Uint8Array` with source revisions without entering the text document model. Handler-owned retained controllers can pin the first edit and veto both close and handler switching.

The selection order is explicit handler, stored association, unique highest-priority default and safe source-provided text fallback. Equal default matches show a choice. The built-in image handler is the `image/*` default and renders source bytes through `img`; SVG also exposes the text editor through open-with. Native HTML execution is not a handler.

The right-sidebar workbench exclusively owns group layout, target resolution, previews, pin state and persisted instance placement. It persists the resource service's JSON-safe descriptor and handler id. The resource service reconnects restored views to providers and documents; missing sources or handlers stay visible as unavailable states. Close confirmation only decides whether removal is safe. Resource and document cleanup runs after the sidebar commits removal of the same instance, so a stale asynchronous close cannot discard retained state.

Text documents capture global and optional source defaults at creation and own concrete automation choices. Global-default changes notify an independent subscription and never mutate or reschedule existing documents. Capability checks gate execution without rewriting a document choice. The version-1 browser draft retains automation with Base/Local text, so Client restoration preserves choices even after defaults change; a committed last-view close removes that state. Drafts without automation initialize from current defaults. The [initialization decision and regression evidence](../../../../.intent/logs/2026-09-05-document-automation-initialization.md) define this lifetime; persisted resource overrides and reset APIs have no owner.

CodeMirror remains in `@dsh-external/dsh-file-viewer-editor` and loads only for a ready text view. Opaque editor state belongs to each view and retains selection, scroll and undo history through group remounts while source text updates remain outside undo history.

## Alternatives considered

**Add binary fields to the text load result.** Rejected because it would make decoding and text synchronization implicit for byte resources.

**Let each caller pick a viewer and target group.** Rejected because associations, ambiguity and stable adjacency would diverge among file trees, Chat and memory providers.

**Keep one text document per tab.** Rejected because side-by-side views would duplicate watches, drafts and conflict state and moving a tab could trigger a reread.

**Let each provider own text editor state.** Rejected because every provider would duplicate operation generations, dirty-state comparison, automation, conflict behavior and workbench lifecycle wiring.

**Treat a Session as one document slot.** Rejected because switching resources would destroy unrelated local edits and make stale operations compete for one state owner.

**Give the workbench filesystem access.** Rejected because memory and remote-backed sources use the same opening and synchronization behavior, while filesystem authorization and navigation remain a separate product responsibility.

**Resolve text conflicts automatically.** Rejected because neither local nor source text has general precedence. Explicit overwrite and discard actions preserve the user's choice.

## Consequences

Resource providers need no sidebar store access. All handlers share one open-with and lifecycle path, while format-specific draft models remain in their retained controllers. The viewer exposes `ctx.resourceWorkbench` and registers the `resource-workbench` sidebar view. Installation adds and removes the workbench and CodeMirror packages together and never mutates Harness source or restarts a service.
