# Resource workbench current intended state

Status: source-defined revision under [the generic resource workbench decision](../logs/2026-09-05-generic-resource-workbench.md); no accepted realization lock.

## Intent

Provide a Session-aware generic resource workbench in the DeepSeek Harness Web right sidebar. Client plugins contribute sources and lazy handlers without receiving workbench, document or group store mutation authority.

## Stable behavior

- The frozen `ctx.resourceWorkbench` face exclusively owns source and handler registrations, handler selection, associations, resource views and shared text documents.
- A resource identity contains a Session id, source id and source-owned resource id. Descriptors add a name and optional MIME, kind, size and location without replacing that identity.
- A source independently contributes optional text and byte reading, guarded writing, watching and external opening. Text is never inferred by decoding arbitrary bytes. Duplicate live source ids fail.
- Handler selection applies an explicit request, user association, unique highest-priority default and safe text fallback in that order. Equal defaults expose a choice. Handler modules load only after their view mounts.
- The built-in image handler consumes real bytes through an inert image element. SVG defaults to image and remains available through the text handler via open-with.
- Exact text references share one Base/Local/Source document across multiple view ids. Each view separately retains selection, scroll and undo state; moving or remounting a view does not reread or copy the document.
- Manual Update observes the latest source while preserving local edits. Manual Save uses conditional writes; a writable source without conditional writes requires explicit overwrite confirmation. Automatic Update requires watching; automatic Save requires conditional writes. Their preferences are independent and persisted per resource.
- Automatic preferences inherit the persisted global defaults, optional source defaults and explicit per-resource overrides in that order. Reset removes a resource override. Version-1 stored booleans remain explicit resource choices; missing preferences inherit instead of becoming explicit false.
- Exact hashes classify synchronized, local-ahead, source-ahead, diverged and unknown states. A conflict retains Base, Local and Source text, pauses automation and offers confirmed Overwrite source or Discard local actions.
- Browser-local draft records retain exact Base and Local text under the complete document identity. Explicit reopening freshly loads Source and recomputes all three hashes; provider revisions and transient failures remain runtime-only. A sidebar-committed close removes the record, while Client disposal flushes pending retention.
- The right-sidebar workbench owns groups, tabs, preview replacement, pin state, activation and close gestures. The viewer registers one static `resource-workbench` renderer. First edit pins a preview; close and handler switch honor document and handler vetoes. Close confirmation does not release a view or document; cleanup runs only after the sidebar commits removal of that exact instance.
- Optional source locations remain opaque. A location can display a label and segments; its selector id launches another right-sidebar feature with an optional source-owned selection hint.
- `@dsh-external/dsh-file-viewer-editor` owns CodeMirror dependencies and editor construction. Source state updates reuse the mounted view, preserve bounded cursor positions and do not enter undo history.
- The separate file-manager plugin owns authenticated user filesystem access, filesystem sources, navigation, its Files launcher and Chat filesystem routing. User filesystem UI does not inherit agent sandbox or approval restrictions.

## Acceptance criteria

- `VIEWER-001`: One Session can retain multiple views of one exact text resource with shared edits and independent editor state; restoration retains Base and Local text against a fresh Source observation.
- `VIEWER-002`: Client fixtures can register in-memory text and byte sources, read and guarded-write without binary decoding, watch external changes, dispose a source and retain explicit source-unavailable state without receiving store setters.
- `VIEWER-003`: Manual and automatic synchronization derive from exact base/local/source text hashes, suppress stale completions and pause automation after conflicts or operation failures.
- `VIEWER-004`: Open-with UI exposes matching handlers and persisted associations; automatic controls remain capability-gated and destructive conflict resolution, dirty close and incompatible handler switching can be vetoed.
- `VIEWER-005`: Client boot contains the workbench and editor graph rows, while handler modules and CodeMirror remain lazy until a selected ready view mounts.
- `VIEWER-006`: Setup and uninstall inspect by default, mutate a profile only under explicit flags, change the viewer and editor dependencies together, and never modify Harness source or restart a service.

## Constraints

- The right-sidebar package owns group layout, previews, tabs and restoration descriptors. This package uses only its public service and `rightbar.view` slot.
- Each source defines canonical text. The generic editor does not trim, normalize line endings or synthesize a terminal newline.
- File-manager and other plugins consume public generic resource types from `@dsh-external/dsh-file-viewer/client`.

## Non-goals

- Owning filesystem authorization, paths, directory operations, filesystem routing or Chat link policy.
- Native HTML execution, archive editing, collaborative or streaming presentation.
- Persisting browser editor buffers in the Session log or sending them to the model.
- Restarting, publishing or asserting acceptance of a live deployment from repository setup.

## Evidence status

Source, focused tests and builds define this revision. [The generic deployment log](../logs/2026-09-05-generic-workbench-deployment.md) records local installation, authorized activation and bounded private/live browser verification. The revision has no accepted realization lock or user visual acceptance.
