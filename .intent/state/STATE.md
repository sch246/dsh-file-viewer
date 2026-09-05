# Resource workbench current intended state

Status: revision 0.3.5 activated under [the deleted fragment decision](../logs/2026-09-06-deleted-fragments.md). Revision 0.3.4 activation remains recorded in [the aligned comparison evidence](../logs/2026-09-06-aligned-comparison.md). No accepted realization lock or user visual acceptance is recorded.

## Intent

Provide a Session-aware generic resource workbench in the DeepSeek Harness Web right sidebar. Client plugins contribute sources and lazy handlers without receiving workbench, document or group store mutation authority.

## Stable behavior

- The frozen `ctx.resourceWorkbench` face exclusively owns source and handler registrations, handler selection, associations, resource views and shared text documents.
- A resource identity contains a Session id, source id and source-owned resource id. Descriptors add a name and optional MIME, kind, size and location without replacing that identity.
- A source independently contributes optional text and byte reading, guarded writing, watching and external opening. Text is never inferred by decoding arbitrary bytes. Duplicate live source ids fail.
- Handler selection applies an explicit request, user association, unique highest-priority default and safe text fallback in that order. Equal defaults expose a choice. Handler modules load only after their view mounts.
- The persistent workbench bar contains source breadcrumbs and a right-aligned handler dropdown. Each handler row has independent name and toggleable default targets: the name switches the current handler through its existing guards; the default marker sets or cancels its association without switching the current handler. External opening remains available inside the dropdown when supported.
- The built-in image handler consumes real bytes through an inert image element. SVG defaults to image and remains available through the text handler via open-with.
- Exact text references share one Base/Local/Source document across multiple view ids. Each view separately retains selection, scroll and undo state; moving or remounting a view does not reread or copy the document.
- Manual Update observes the latest source while preserving local edits. Manual Save uses conditional writes; a writable source without conditional writes requires explicit overwrite confirmation. Automatic Update requires watching; automatic Save requires conditional writes. Each shared document owns independent concrete automatic update/save choices.
- Global defaults initialize new documents, with optional source defaults taking precedence. Changes never mutate existing document choices or reschedule their automation, including during loading, refresh, source reconnect and Session switching. Hover or focus each current automation checkbox to expose its separate default checkbox immediately to the left. Defaults share an independent observable subscription. There are no separate default-setting buttons, inheritance or reset actions. Closing the last view and reopening uses the latest defaults.
- Exact hashes classify synchronized, local-ahead, source-ahead, diverged and unknown states. A conflict retains Base, Local and Source text, pauses automation and offers confirmed Overwrite source or Discard local actions.
- The text editor's upper-right overlay always shows the synchronization relationship, with state-dependent color. Its status also shows each actual update and save activity independently, including simultaneous operations. Activity text cycles through zero to three dots in fixed-width suffixes; reduced-motion mode uses static text, and assistive technology ignores the dots. Activities come exclusively from the existing read/save controllers and never infer a saved result from source observation or a synchronized hash relationship. Initial loading remains a separate state.
- Hover, keyboard focus or touch/click on the status exposes a vertical Update, Save, Line numbers and Differences stack. It remains expanded after mouse leave; Escape, an outside click or selecting the status dismisses it. Update and Save have current automation checkboxes. Line numbers has a current checkbox and a button that performs the same toggle, plus a hover/focus-revealed default checkbox. Touch keeps default checkboxes reachable. Operations do not reveal action buttons. Only controls intercept editor pointer input; failures, pauses and conflict-resolution actions remain independently available.
- Differences becomes Back to editor and uses the same local EditorView, preserving undo, selection and scroll across mode changes. Local remains editable according to source capability, while Source is always read-only. Shared Base-aligned row slots determine both panes' paired Base/current line-number columns, deleted rows, padding and linked vertical scroll geometry. Extra rows on any side shift later rows in every visible pane. Soft wrapping preserves original line numbers and uses common visual row heights. Baseline deletions are red and nonselectable; inserted lines are pale green with darker changed-fragment backgrounds rather than underline marks. Deleted rows and padding never enter document selection, clipboard text or writes. Unchanged sides are omitted, identical sides appear once, and synchronization retains comparison mode with current text. The lazy editor package reuses the maintained diff algorithm and owns alignment, not independent per-pane alignment decisions.
- Each text resource view retains line-number visibility, expanded controls, comparison mode and opaque editor state in its existing handler-state owner. The persisted browser default initializes only new presentation state; changing it leaves current views untouched.
- Browser-local draft records retain exact Base and Local text and the document's automation choices under the complete document identity. Restoration freshly loads Source and recomputes all three hashes without resetting retained automation; version-1 drafts without automation initialize it from current defaults. Provider revisions and transient failures remain runtime-only. A sidebar-committed close removes the record, while Client disposal flushes pending retention.
- The right-sidebar workbench owns groups, tabs, preview replacement, pin state, activation and close gestures. The viewer registers one static `resource-workbench` renderer. First edit pins a preview; close and handler switch honor document and handler vetoes. Close confirmation does not release a view or document; cleanup runs only after the sidebar commits removal of that exact instance.
- Optional source locations remain opaque. A location can display a label and segments; its selector id launches another right-sidebar feature with an optional source-owned selection hint.
- `@dsh-external/dsh-file-viewer-editor` owns CodeMirror dependencies and editor construction. Source state updates reuse the mounted view, preserve bounded cursor positions and do not enter undo history.
- The separate file-manager plugin owns authenticated user filesystem access, filesystem sources, navigation and its Files launcher. The independent resource-links plugin owns Chat path recognition and opening policy. User filesystem UI does not inherit agent sandbox or approval restrictions.

## Acceptance criteria

- `VIEWER-011`: Exact deleted character fragments have darker red backgrounds inside pale red baseline deletion rows. Highlight ranges follow live edits even when the baseline row text is unchanged; deletion spans remain display-only.

- `VIEWER-001`: One Session can retain multiple views of one exact text resource with shared edits and independent editor state; restoration retains Base and Local text against a fresh Source observation.
- `VIEWER-002`: Client fixtures can register in-memory text and byte sources, read and guarded-write without binary decoding, watch external changes, dispose a source and retain explicit source-unavailable state without receiving store setters.
- `VIEWER-003`: Manual and automatic synchronization derive from exact base/local/source text hashes, suppress stale completions and pause automation after conflicts or operation failures.
- `VIEWER-004`: Open-with UI exposes matching handlers and persisted associations; automatic controls remain capability-gated and destructive conflict resolution, dirty close and incompatible handler switching can be vetoed. Changing global defaults updates every view's default controls without changing open documents; closing and reopening initializes current defaults, while draft restoration retains recorded choices.
- `VIEWER-005`: Client boot contains the workbench and editor graph rows, while handler modules and CodeMirror remain lazy until a selected ready view mounts.
- `VIEWER-006`: Setup and uninstall inspect by default, mutate a profile only under explicit flags, change the viewer and editor dependencies together, and never modify Harness source or restart a service.
- `VIEWER-007`: Permanent status preserves synchronization, concurrent update/save activity and visible failures independently; pending punctuation stops on completion, cancellation, failure, reduced-motion preference or unmount. Update/Save controls remain interaction-driven, and default-marker clicks never switch the active handler.
- `VIEWER-008`: Differences appears only in the floating toolbar, retains one editable local editor and read-only source text, omits unchanged/repeated sides, follows document observations, and retains mode through synchronization.
- `VIEWER-009`: Two-column comparison line numbers and content use common Base-aligned slots; insertions, deletions and wrapping preserve cross-pane vertical alignment and linked scrolling. Copy and select-all exclude baseline deletion widgets and visual padding. Number toggles do not change document text or undo history.
- `VIEWER-010`: The expanded toolbar survives mouse leave and view remounts. Current automation and line-number controls reveal their independent default checkboxes to the left on hover/focus; defaults initialize only new documents or view presentations. No separate More/defaults section remains.

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

The [aligned comparison decision](../logs/2026-09-06-aligned-comparison.md) owns current candidate evidence. Earlier decisions and activation logs describe their respective revisions. No accepted realization lock or user visual acceptance is recorded.
