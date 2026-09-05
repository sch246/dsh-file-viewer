# File viewer current intended state

Status: source-defined revision under [the browser draft persistence decision](../logs/2026-09-05-editor-draft-persistence.md); no accepted realization lock.

## Intent

Provide a Session-aware, source-neutral text editor in the DeepSeek Harness Web right-sidebar workbench. Client plugins can contribute memory, filesystem, generated or remote-backed text sources without receiving viewer store mutation authority.

## Stable behavior

- `FileViewerService` exclusively owns registered sources, independent editor instances, exact text hashes, base/local/source snapshots, operation generations and document actions. The frozen `ctx.fileViewer` face addresses instances by opaque id.
- A document identity contains a Session id, source id and source-owned resource id. Opening the same identity activates its existing instance without reloading; different resources in one Session remain independent.
- A source owns canonical text, resource ids, optional title and location, opaque revision values, loading, optional guarded saving, optional watching and optional external opening. Duplicate live source ids fail.
- Manual Update observes the latest source while preserving local edits. Manual Save uses conditional writes; a writable source without conditional writes requires explicit overwrite confirmation. Automatic Update requires watching; automatic Save requires conditional writes. Their preferences are independent and persisted per resource.
- Exact hashes classify synchronized, local-ahead, source-ahead, diverged and unknown states. A conflict retains Base, Local and Source text, pauses automation and offers confirmed Overwrite source or Discard local actions.
- Browser-local draft records retain exact Base and Local text under the complete document identity. Explicit reopening freshly loads Source and recomputes all three hashes; provider revisions and transient failures remain runtime-only. Accepted close removes the record, while Client disposal flushes pending retention.
- The right-sidebar workbench owns instance tabs, activation and close gestures. The viewer registers one static `text-editor` renderer. Dirty close requires confirmation.
- Optional source locations remain opaque. A location can display a label and segments; its selector id launches another right-sidebar feature with an optional source-owned selection hint.
- `@dsh-external/dsh-file-viewer-editor` owns CodeMirror dependencies and editor construction. Source state updates reuse the mounted view, preserve bounded cursor positions and do not enter undo history.
- The separate file-manager plugin owns authenticated user filesystem access, filesystem sources, navigation, its Files launcher and Chat filesystem routing. User filesystem UI does not inherit agent sandbox or approval restrictions.

## Acceptance criteria

- `VIEWER-001`: One Session can retain and switch among multiple independently edited resources; opening an exact live identity activates it without reloading, while reopening after Client recreation restores its Base and Local text against a fresh Source observation.
- `VIEWER-002`: A Client fixture can register an in-memory source, open and save a resource, watch an external change, dispose the source and retain explicit source-unavailable state without receiving store setters.
- `VIEWER-003`: Manual and automatic synchronization derive from exact base/local/source text hashes, suppress stale completions and pause automation after conflicts or operation failures.
- `VIEWER-004`: The UI gates automatic controls by watch and conditional-save capabilities, exposes source location selectors, saves immediately on `Ctrl+S` or `Cmd+S`, and requires confirmation for destructive conflict resolution and dirty close.
- `VIEWER-005`: Client boot contains the viewer and editor graph rows, while no CodeMirror view exists before a ready editor instance mounts.
- `VIEWER-006`: Setup and uninstall inspect by default, mutate a profile only under explicit flags, change the viewer and editor dependencies together, and never modify Harness source or restart a service.

## Constraints

- The right-sidebar package owns layout, launcher registration, instance tabs and view selection. This package uses only its public workbench service and `rightbar.view` slot.
- Each source defines canonical text. The generic editor does not trim, normalize line endings or synthesize a terminal newline.
- File-manager and other source plugins consume public source, document, loaded-text and location types from `@dsh-external/dsh-file-viewer/client`.

## Non-goals

- Owning filesystem authorization, paths, directory operations, filesystem routing or Chat link policy.
- Binary, image, syntax-service, collaborative or streaming presentation.
- Persisting browser editor buffers in the Session log or sending them to the model.
- Restarting, publishing or asserting acceptance of a live deployment from repository setup.

## Evidence status

Source and focused tests define this revision. The installation status in `STATE.json` records an earlier live revision and is not evidence for this source-defined multi-instance behavior. No current realization lock or user acceptance is recorded.
