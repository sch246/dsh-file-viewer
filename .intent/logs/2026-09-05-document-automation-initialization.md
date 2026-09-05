# Document automation initialization

The synchronization defaults initialize newly opened exact Session/source/resource documents. Changing a default never changes an existing document, including one being loaded, refreshed, reconnected, restored into another view or revisited in another Session. Source defaults take precedence during initialization; source capabilities continue to gate execution. Views of the same exact document share its automation choices.

Each document owns two concrete automation booleans. The global defaults have their own observable subscription and browser persistence. Resource override inheritance, reset actions and the independent persisted resource-preference records have no role. Closing the last view discards the document; reopening initializes from the latest defaults. Retained browser drafts preserve automation alongside Base and Local text so Client restoration cannot silently enable saving or change active choices. Drafts without recorded automation initialize from the current defaults.

The controls present the two global default checkboxes in one horizontal row and omit Inherit update/save buttons.

## Verification

Candidate base: viewer `40c23ba7448e235d9168fdf27f969c54340f75c7`; verification Harness `0a53fb55bea101816fa226bb964ae2bed71c343b`. The candidate lives at `/root/dsh-resource-workbench-candidate/dsh-file-viewer`. This revision is not installed or activated; no profile, Host source or live plugin checkout was changed.

- Before implementation, `pnpm exec vitest run packages/dsh-file-viewer/tests/file-viewer-service.client.spec.ts -t 'changes defaults without'` failed: changing global defaults mutated the existing document from automatic update/save `false/false` to `true/true`.
- After implementation, `pnpm exec vitest run packages/dsh-file-viewer/tests/file-viewer-service.client.spec.ts` passed 47 tests, including unchanged existing snapshots, source observations and reconnects, failed refresh, Session reuse, loading/retry capture, new-document initialization, default subscriptions, retained draft automation, old draft recovery and pending timer deadlines.
- `pnpm run test` passed all 84 tests in 7 files. The public frozen service and real text renderer test proves cross-view default control updates without document notifications, shared-document automation, independent-document choices, renderer remount retention and last-view close/reopen initialization. Existing exact hashing, conditional-save conflicts, stale completions and draft retention tests pass.
- `DSH_CHECKOUT=/root/dsh-resource-workbench-candidate/harness pnpm run typecheck` passed.
- `DSH_CHECKOUT=/root/dsh-resource-workbench-candidate/harness pnpm run build` passed for viewer and editor artifacts.
- `git diff --check` passed. Source and built-artifact searches found no `automationInheritance`, `resetAutoUpdate`, `resetAutoSave`, `readPreferences`, `resolveAutomation` or resource-preference storage key.

Browser layout and managed deployment acceptance remain outside this candidate verification. No private Home probe, live browser observation, restart, profile operation or push was performed. The horizontal defaults row has source CSS and DOM integration evidence; actual browser geometry and GIF evidence belong to candidate integration.
