# Adaptive polling and delta update evidence

The user requested both nonaccumulating adaptive polling and delta updates. The previously selected future 1 MiB automatic-update threshold now applies to actual serialized UTF-8 delta success envelopes. Background work stops with a manual Update action when the provider lacks a baseline, exceeds the transfer limit or exhausts its diff budget. Explicit Update prefers a delta and may fall back to a complete approved read; initial progressive loading and the 1/10/100 MiB document policies remain in effect.

The inspected watch implementation awaited only the RPC, while its document listener launched hashing without returning the promise. The source now owns one background permit across text and byte subscriptions through awaited consumer completion. Contending watches skip instead of queueing. Size-aware idle intervals, observed cycle duration and capped exponential failures control rescheduling. Provider admission separately bounds background work across browser clients. Manual operations bypass these permits.

Provider commit `7ea9b07b29189f7a4e8e1a1316e22d7244d2a9dc` supplies version 0.1.4, bounded canonical baselines and a maintained jsdiff-based neutral text-patch leaf. The viewer requires ^0.1.4 without changing independent manager/sidebar versions. Shared line generation and validation replace the editor-owned save differ; CodeMirror remains the presentation owner. Received patches validate Source once before advancing state. Automatic application can retain unrelated Local edits with exact-position range guards and mapped editor transactions. A stale verified Source pair remains available after a save preserving external changes, without pairing old text with the new reported hash.

Work remained in `/root/dsh-poll-backpressure/viewer` and the assigned provider tree; older live trees were not edited or built. `DSH_USER_FILES=/root/dsh-poll-backpressure/user-files/packages/dsh-user-files DSH_SIDEBAR=/root/dsh-decoupling-apply/sidebar/packages/dsh-right-sidebar pnpm run install:local` reused the package cache and created candidate-owned dependencies. An early typecheck preceded generated viewer declarations and failed on its missing Remote face; building generated the required artifacts. Final `DSH_CHECKOUT=/root/deepseek-harness pnpm run build` and `DSH_CHECKOUT=/root/deepseek-harness pnpm run typecheck` passed. Inspection of `lib/client.js` found embedded `diffTextLines` and `applyTextPatches` definitions and no unresolved text-patch package import.

Executed focused checks:

```sh
pnpm exec vitest run packages/dsh-file-viewer/tests/filesystem-source.client.spec.ts packages/dsh-file-viewer/tests/delta-update.client.spec.ts packages/dsh-file-viewer/tests/text-patch.client.spec.ts packages/dsh-file-viewer/tests/delta-save.client.spec.ts packages/dsh-file-viewer/tests/file-size-config.host.spec.ts
pnpm exec vitest run packages/dsh-file-viewer-editor/tests/editor.client.spec.ts -t 'guarded remote'
pnpm run test:setup
pnpm exec vitest run packages/dsh-file-viewer/tests/large-file-confirmation.client.spec.tsx packages/dsh-file-viewer/tests/resource-retention.client.spec.ts
pnpm exec vitest run packages/dsh-file-viewer/tests/large-file-confirmation.client.spec.tsx -t 'shares one decision'
pnpm exec vitest run packages/dsh-file-viewer/tests/delta-update.client.spec.ts
pnpm exec vitest run packages/dsh-file-viewer/tests/delta-save.client.spec.ts
```

The five-file check passed 18 cases after updating the insertion fixture to accept the shared differ's left-neighbor guard. The selected editor case passed, including selection mapping, scroll and local undo retention. Installer checks passed three cases including rejection of provider 0.1.3. The confirmation/retention run passed 21 cases and exposed one obsolete full-read-count expectation; the corrected shared-decision case then passed independently. The final delta-update and delta-save reruns passed three and two cases respectively, including reopening a stopped watch after explicit refresh and clearing the manual-required state after an equal-hash save. Separate selected initial/huge confirmation checks passed two cases. No broad suite, browser automation, A/B test or performance benchmark was run.

Provider evidence reports 51 affected tests, a final 20-case delta/stream rerun, build/typecheck and generated-schema/cancellation/package-export probes passing; its implementation diff was reviewed. Stat identity cannot detect writes preserving all observed fields, jsdiff deadlines are cooperative, and changed files still require complete Host reads and linear tokenization. Baseline accounting is retained string data rather than total heap. These limitations are documented; no universal large-file performance claim is made. Parent owns push and activation.
