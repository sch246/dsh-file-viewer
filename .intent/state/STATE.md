# Resource workbench current intended state

Recorded deployment: revision 0.3.5 activated under [the deleted fragment decision](../logs/2026-09-06-deleted-fragments.md). Revision 0.3.4 activation remains recorded in [the aligned comparison evidence](../logs/2026-09-06-aligned-comparison.md). This local STATE is an installation and behavior map, not the meta-intent protocol. Historical activation does not certify a new target checkout; no accepted realization lock or user visual acceptance is recorded.

## Intent

Provide a Session-aware generic resource workbench in the DeepSeek Harness Web right sidebar. Client plugins contribute sources and lazy handlers without receiving workbench, document or group store mutation authority.

## User intent and provenance

Source: Codex task **评估网页文件查看编辑能力 (2)**, conversation `01a07134-78e5-7503-83c1-059bc388eecf`, actual user messages. Times below use **Asia/Shanghai (UTC+08:00)**, converted from message UTC timestamps. The September 5 18:54 message pastes both user requests and GPT proposals; the quoted user requests establish intent, while GPT implementation suggestions are not independent user requirements.

- September 5 18:54, pasted user request: “文本查看应该只是文件编辑的一种功能罢了” and “应该能在文件编辑器里切换打开方式”. The resource workbench supports contributed handlers; text is one handler. The same pasted discussion assigns groups and placement to the shared sidebar, including opening tree selections to the right without replacing the tree. The proposed single editor plugin tab is not a requirement to reintroduce nested file tabs.
- September 5 20:50: “默认的更新和保存应该与当前实例的更新保存无关，只影响新开时的自动更新自动保存的状态”. This supersedes the pasted GPT inheritance/reset proposal. The two inheritance buttons are rejected. The horizontal defaults row requested in this message is an intermediate presentation, superseded by the final hover controls below.
- September 5 23:04 and September 6 00:14: keep breadcrumbs and a right-aligned open-with dropdown; handler names switch views and separate default markers toggle associations. “一个复选框就行了” confirms checkboxes instead of rotating icons; synchronization status remains visible and changes color. September 6 00:20 suggests operation animation in that status rather than revealing buttons; independent update/save activity is the implemented interpretation.
- September 6 01:02: “点击‘查看差异’时视图直接替换编辑区域” and “它一定要是实时的”. Differences belongs beside Update/Save in the floating controls. Base has no separate pane; sides equal to Base are omitted. September 6 01:32 further requires editable Local, read-only Source, stronger green character backgrounds, line numbers and red deletions excluded even from select-all/copy.
- September 6 01:53: “需要以基准行进行对齐才行” and “悬浮按钮的展开状态在鼠标移开后应该保持”. Paired Base/current columns, shared row displacement and linked scrolling align every visible side. Current and default line-number choices follow the automation control arrangement. “鼠标悬浮到自动更新/自动保存的框上的时候，才在左边额外显示一个勾选框” is the final default-control request; it supersedes separate More/default controls. September 6 02:45 adds “删除时对应的地方要有红色背景的”, including removed character fragments.

## Installation map

### Composition and implementation owners

| Owner | Required contribution and location |
| --- | --- |
| Harness Web profile | Supported package declarations and source launcher; the manifests target `0.1.2-alpha.2`. Check actual API compatibility after Host upgrades. |
| `@dsh-external/dsh-right-sidebar` | Must be built and composed first. Owns groups, placement, previews, tab orientation/dragging, resizing and layout persistence; these are not editor responsibilities. |
| Viewer Bundle | [Bundle rows](../../packages/dsh-file-viewer/cordis.patch.yml) compose viewer and editor Client graph entries. [Workbench](../../packages/dsh-file-viewer/src/client/workbench.ts) owns generic opening, handlers and associations; [document service](../../packages/dsh-file-viewer/src/client/service.ts) owns synchronization. |
| Editor dependency | [Editor package](../../packages/dsh-file-viewer-editor/package.json) owns CodeMirror and comparison rendering. It is installed as a plain dependency, never a second Bundle, and loaded lazily. |
| Optional filesystem provider | `@dsh-external/dsh-file-manager` requires this viewer and supplies metadata, text/bytes, guarded saves, native-open capability and the Files launcher. Other sources can use the viewer without the manager. |
| Optional Chat consumer | `@dsh-external/dsh-resource-links` requires manager, viewer and sidebar. It owns path recognition and Chat `preview\|system` policy; the viewer does not install it. |

### Build, install and removal

The [repository guide](../../README.md#build-and-install) owns build commands. Select explicit `DSH_CHECKOUT`, `DSH_HOME` and `DSH_PROFILE` for every profile operation. The viewer scripts permit omitted `DSH_HOME` and then use the ordinary default Home; supplying it avoids selecting an unintended profile. Keep sibling checkouts at the relative locations declared in the development manifest, or deliberately update those local links before building.

| Operation | Owned entry and effects |
| --- | --- |
| Inspect | [Setup](../../scripts/setup-host.sh), `pnpm run setup --check`: checks checkout and package-source presence only. It does not prove an installed profile or browser works. |
| Install/update | `pnpm run setup --install`: builds both packages and adds both absolute package paths in one `dsh plugin add` transaction; verifies manifest, lock, resolution and composed rows. The viewer is the Bundle and the editor is a plain dependency. |
| Inspect removal | [Uninstall](../../scripts/uninstall-host.sh), `pnpm run uninstall --check`: reports declared dependencies and viewer Bundle presence. |
| Remove | `pnpm run uninstall --remove`: removes both declared dependencies in one transaction and checks absence. Remove dependent resource-links and manager Bundles first, retaining unrelated sidebar consumers. |

Scripts do not apply or reverse Harness patches or restart services. Build output and local build symlinks change during installation; the running profile is activated separately. After installation, inspect exact dependency/lock/resolution targets, Bundle and composed Client rows; after removal, inspect their absence. In particular, uninstall's already-absent dependency branch does not check for residual symlinks or lock rows. A successful inspection alone is not removal or boot evidence. Preserve user drafts and unrelated profile settings; package removal does not clear origin-local browser storage.

### Host adaptation and ownership limits

The tracked [historical Harness patch](../../patches/deepseek-harness.patch) includes the initial `chat/open-workspace-file` waterfall and other integration changes; it is not an input to viewer setup or uninstall. Resource-links maintains an incremental patch over that Chat baseline, including routing the workspace `.` action through the waterfall. Applying or reversing the historical patch wholesale can overlap that newer contribution.

No current viewer or manager lifecycle script transfers the historical patch receipt. Resource-links refuses to adopt an already-applied patch without its matching receipt. The [resource-links baseline preparation map](https://github.com/sch246/dsh-resource-links/blob/main/.intent/state/STATE.md#preparing-a-host-that-lacks-the-baseline) identifies the exact Chat symbols and reviewed adaptation record needed on a Host without the waterfall. The [historical installation record](../logs/2026-09-05-live-web-install.md) excludes `packages/typert/generator/` from viewer ownership because its external-project support belongs to skill-manager. An integrator must inspect the selected Host, the historical receipt and resource-links receipt, preserve changes owned elsewhere, and reconcile that baseline before setup or removal; reverse applicability alone does not establish ownership transfer. After a Harness upgrade, adapt only the affected public sidebar/workbench APIs and owned Host increment, then regenerate the affected artifacts through their owning scripts. A clean arbitrary Host is not established as supported by the deployment logs.

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
- `VIEWER-011`: Exact deleted character fragments have darker red backgrounds inside pale red baseline deletion rows. Highlight ranges follow live edits even when the baseline row text is unchanged; deletion spans remain display-only.

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

The aligned comparison and deleted-fragment records linked above own the implementation and activation evidence for their revisions. This documentation update does not rerun those observations or install anything. Earlier decisions and activation logs describe their respective revisions. No accepted realization lock or user visual acceptance is recorded.
