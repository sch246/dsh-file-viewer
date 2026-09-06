# Reviewed viewer integration on the independent filesystem source

The final Claude contribution `8c4354f1633aab7517a3619fb4098ad11b644f30` was selectively applied to decoupled base `7dc2aa3`. The integration preserves viewer-owned filesystem access, independent manager/Links installation, workspace package coordinates and the generated meta-intent entry. No earlier size-based comparison disabling, draft cap, hash debounce or performance assumption was imported.

The advisory threshold is deployment configuration, validated by Host Config and delivered through viewer metadata. The selected default is 2,097,152 UTF-16 code units, not a measured performance boundary. Exact local text caching and equal successful draft-write suppression remain; cache recovery also handles a dispatch that commits before throwing.

Review found incomplete missing-resource propagation in the final source: byte operations, initial failures and restoration acknowledgment needed wiring. The filesystem source now translates the stable `user-files/not-found` code into the generic viewer error for text, bytes and polling. A missing watch event records confirmed absence directly; successful polling after failure reports even an unchanged revision. Unrelated failures retain the absence fact, and byte subscription disposal blocks late callbacks. Sidebar receives only the marking, independently of renderer availability. Its matching contribution is `7d0eb96`.

A valid persisted draft can open during confirmed source absence. The document owner recomputes Base/Local hashes, preserves known view metadata, withholds any current Source/revision, and pauses automation. Successful source observation reconnects it. This adds no alternate filesystem provider or manager dependency.

Validation ran in `/root/dsh-decoupling-apply/viewer` against the compatible Host at `/root/dsh-decoupling-615gv0tt/harness`, using existing installed dependency artifacts through private worktree dependency links:

- `DSH_CHECKOUT=/root/dsh-decoupling-615gv0tt/harness pnpm build` and `DSH_CHECKOUT=/root/dsh-decoupling-615gv0tt/harness pnpm typecheck` passed. Build regenerated Host metadata, Remote declarations, Client bundle and editor artifacts.
- `pnpm exec vitest run packages/dsh-file-viewer/tests/resource-retention.client.spec.ts packages/dsh-file-viewer/tests/filesystem-source.client.spec.ts packages/dsh-file-viewer/tests/file-viewer-panel.client.spec.tsx packages/dsh-file-viewer-editor/tests/editor.client.spec.ts` passed: four files, 29 tests before the later focused additions.
- `DSH_SIDEBAR=/root/dsh-decoupling-apply/sidebar/packages/dsh-right-sidebar pnpm exec vitest run packages/dsh-file-viewer/tests/file-viewer-service.client.spec.ts packages/dsh-file-viewer/tests/resource-workbench.client.spec.ts packages/dsh-file-viewer/tests/resource-workbench-sidebar-integration.client.spec.ts packages/dsh-file-viewer/tests/browser-plugin.client.spec.ts packages/dsh-file-viewer/tests/document-activities.client.spec.tsx packages/dsh-file-viewer-editor/tests/comparison.client.spec.ts` passed: five actual files, 73 tests. The final comparison filter named no file; the actual inline-diff file was run separately.
- `pnpm exec vitest run packages/dsh-file-viewer-editor/tests/inline-diff.client.spec.tsx` passed: two tests.
- `pnpm exec vitest run packages/dsh-file-viewer-editor/tests/editor.client.spec.ts` passed after the exception-cache addition: 11 tests.
- `pnpm exec vitest run packages/dsh-file-viewer/tests/resource-retention.client.spec.ts packages/dsh-file-viewer/tests/resource-workbench.client.spec.ts` passed after metadata retention and watch-disposal changes: 25 tests.
- `pnpm exec vitest run packages/dsh-file-viewer/tests/resource-retention.client.spec.ts` passed after the late-watch regression was added: eight tests.
- A `node --input-type=module` smoke imported built `Config`, accepted its default and an explicit threshold of eight, and rejected zero, negative, fractional, infinite and string thresholds.
- `git diff --check` passed.

These are repository and built-configuration results. No browser, A/B, performance, managed profile, Host-source edit, service action or publication was performed by this implementation task. The image handler retains its existing read-on-mount lifecycle; automatic detection requires a subscribed byte watcher or a fresh read. Invalid or unreadable browser drafts cannot be recovered as text.
