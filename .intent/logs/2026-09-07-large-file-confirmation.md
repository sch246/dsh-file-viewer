# Large-file confirmation implementation evidence

The requested effect is an explicit Load file action before loading large text, followed by normal editor capabilities. The existing shared-provider 1 MiB text limit supplies the configurable confirmation threshold. Confirmation is one open document’s runtime state and is absent from drafts and source-global state. The provider removes the permanent text size rejection while byte/image limits stay independent.

The Viewer uses the generic source confirmation error and watch notification to stop before initial hashes, editor creation, content watches and new draft writes. A growing source retains local text and the mounted editor while awaiting confirmation. Reads that complete after last-view closure cannot update metadata, hash content or materialize an editor. A pending confirmation remains actionable after its source reconnects.

Review clarified that output-only growth is already-local content: saving a small source with large replacement text does not request confirmation solely because of the replacement size. Subsequent reads of an existing large disk source still require explicit permission. The provider’s post-publication revision read accepts the text it just published.

Fresh-worktree validation found Client tsconfig references pointing one directory above the repository, although build scripts create the selected Host link inside the repository. The paths now use that owned link. Initial typecheck failed on the stale paths; an intermediate build caught a union-narrowing error, and the browser registration test required the new explicit `allowLargeFile: false` request field. Both code and expectation were corrected.

Dependency installation used repository-local pinned tools and an independent node_modules via `DSH_USER_FILES=/root/dsh-large-file-confirm/user-files/packages/dsh-user-files DSH_SIDEBAR=/root/dsh-decoupling-apply/sidebar/packages/dsh-right-sidebar pnpm run install:local`. No active plugin checkout was built or modified. This record describes candidate implementation evidence; private-profile and real browser acceptance belong to the coordinating agent.

Final candidate checks passed against `DSH_CHECKOUT=/root/deepseek-harness`: `pnpm run build` generated Host, Remote, Client and editor artifacts; `pnpm run typecheck` passed all three compiler programs. The focused command below passed 8 files and 99 tests, including existing missing-draft restoration and concurrent update/save behavior. `git diff --check` passed, and the built Client/declared source API contains the confirmation action and localized labels.

```sh
pnpm exec vitest run packages/dsh-file-viewer/tests/large-file-confirmation.client.spec.tsx packages/dsh-file-viewer/tests/filesystem-source.client.spec.ts packages/dsh-file-viewer/tests/file-viewer-service.client.spec.ts packages/dsh-file-viewer/tests/file-viewer-panel.client.spec.tsx packages/dsh-file-viewer/tests/resource-retention.client.spec.ts packages/dsh-file-viewer/tests/resource-workbench.client.spec.ts packages/dsh-file-viewer/tests/document-activities.client.spec.tsx packages/dsh-file-viewer/tests/browser-plugin.client.spec.ts
```

Shared-provider commits reviewed alongside this change: `f8a4fa3eff1de2c0c63f0d1f17632b472e064dce` and `1a5baaf0b5c77d791dacbc9264d645a1324aec8e`. Its worker reported passing Host/Remote build, typecheck and 16 filesystem/Remote tests with real temporary files, EOL preservation, revision guards and cancellation after publication. No changes were made to manager, sidebar, Host source, profiles or services by this implementation worker.
