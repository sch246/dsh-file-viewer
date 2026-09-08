# Test maintenance scope

The user authorized removal of product-behavior tests while retaining necessary external-contract and mechanical-invariant checks. Confirmed intent belongs in STATE, not a parallel assertion suite. The shared meta-intent Agent entry carries this rule.

Removed 19 complete test files; mixed files retain only the applicable grounded checks. Unused runner entries, UI test dependencies and fixtures were removed where no retained consumer uses them. Runtime source and live profile are unchanged.

Retained evidence resources:

- `packages/dsh-file-viewer/tests/segmented-text-read.client.spec.ts`: UTF-8/digest validation, retry bounds, cancellation and resource release.
- `packages/dsh-file-viewer/tests/text-document.client.spec.ts`: block partition/hash integrity and full-text materialization invariant.
- `packages/dsh-file-viewer/tests/text-patch.client.spec.ts`: exact changed-line ranges and neighbor guards.
- `scripts/profile-peers.test.mjs`: profile/provider compatibility preflight contract.

The delta-update file retains bad final-hash rejection and unchanged source text/hash only; recovery-state policy assertions were removed.

No tests or builds were run for this cleanup. Syntax, manifest/reference consistency and diff checks are static evidence only.
