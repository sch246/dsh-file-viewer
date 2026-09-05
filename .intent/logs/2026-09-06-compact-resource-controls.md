# Compact resource controls

## Intended behavior

Revision 0.3.2 uses source breadcrumbs and a right-aligned handler dropdown as the persistent workbench bar. Every handler has two independent targets: its name requests guarded switching; its toggleable default marker changes the association without switching the current view. The marker uses pressed-button semantics because its default can be cancelled.

The text editor keeps synchronization status visible above a vertical action overlay. Hover, focus or touch exposes Update and Save with automation checkboxes on the left, then More. More exposes the two initialization defaults vertically, followed by Collapse. Defaults retain their document-creation semantics. Capability restrictions, confirmation, paused automation, retained failures and differences remain available.

The user's final direction places activity animation exclusively in the permanent status. Actual update/save text cycles through zero to three dots with a reserved three-character suffix; reduced-motion users see static text. Dots are hidden from accessibility names. Concurrent activities are independently visible alongside the synchronization relationship. No activity-triggered button reveal, completion-feedback timer, checkbox animation or inferred save success is part of this revision.

## Ownership

The existing read and save operation controllers remain authoritative. A single document notification method projects their activity booleans and the primary `operation` value into immutable snapshots. This also clears a stale primary saving value when revision validation blocks a write after save preparation. A watch snapshot immediately publishes cancellation of the prior read before awaiting replacement hashing. The renderer owns only hover/focus/touch disclosure and pending punctuation. No source registry, synchronization decision, draft lifetime, provider API, Host contribution or profile membership changes.

## Verification

Candidate base is viewer `226e99ec470abb1d5aa5b82f92f7a8a35ae18578`; the explicit verification Harness is `/root/dsh-resource-workbench-candidate/harness`, revision `0a53fb55bea101816fa226bb964ae2bed71c343b` with its existing candidate changes. The candidate plugin alone owns this revision's edits.

Focused renderer tests cover both handler click targets, default cancellation, cross-view initialization defaults, permanent synchronization state, hover/focus/touch disclosure, Escape/outside dismissal, pending dot cycles, reduced-motion changes and timer disposal. Tests using the actual document service hold read/write promises independently, exercise both completion orders, retain prior failure during retry, reject hash preparation and source conflicts, and verify a successful save cancels an older read without adopting its late result.

- `DSH_CHECKOUT=/root/dsh-resource-workbench-candidate/harness pnpm run test` passed 93 tests in 8 files, including initial loading without update/save activity and watch cancellation while replacement hashing remains pending.
- `DSH_CHECKOUT=/root/dsh-resource-workbench-candidate/harness pnpm run typecheck` passed.
- `DSH_CHECKOUT=/root/dsh-resource-workbench-candidate/harness pnpm run build` passed for the viewer and editor browser artifacts and declarations.
- A temporary negative control retained the old primary operation when a save-conflict failure appeared. `DSH_CHECKOUT=/root/dsh-resource-workbench-candidate/harness pnpm exec vitest run packages/dsh-file-viewer/tests/document-activities.client.spec.tsx -t source-conflict` rejected it with actual `saving` versus expected `idle`. The control was removed before the passing suite and final build.
- `git diff --check` passed. A local Node check verified terminal newlines and all 19 relative file links in the five changed Markdown documents. This external repository defines no `doc-sync` or lint command; no Harness-wide documentation result is claimed.

Browser geometry, real candidate composition and user visual acceptance belong to the main integration task. No live profile mutation, managed service restart, installation, activation, realization lock or push is recorded by this candidate change.
