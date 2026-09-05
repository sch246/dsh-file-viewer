# Inline differences and compact disclosure

## Decision

Revision 0.3.3 uses one More/Collapse button and puts the sole Differences/Back to editor toggle in the floating toolbar. The comparison area replaces the visible editor area; it does not insert another row above it. Local and Source each compare against Base, unchanged sides are omitted, identical changed sides appear once, and there is no Base column. When synchronization advances Base, comparison mode remains open and displays the current full text.

`@codemirror/merge` 6.12.2 supplies maintained unified diff rendering inside the lazy editor package. Its `unifiedMergeView` configuration disables merge controls; `originalDocChangeEffect` updates the baseline without modifying the displayed document. Read-only diff documents receive exact `Text` values, including carriage returns. The ordinary editor stays mounted but hidden, preserving its view state and undo history. Comparison updates cannot save, overwrite, discard or edit a shared document.

## Evidence

The candidate starts at `2b882e7f2f476e12b608c642a3758ed94125cd96`. `pnpm view @codemirror/merge version` reported 6.12.2; its installed declarations and [official source](https://github.com/codemirror/merge/blob/main/src/unified.ts) confirm unified rendering, disabled merge controls and original-document update effects. `pnpm install --filter @dsh-external/dsh-file-viewer-editor` completed after transient registry connection retries; the lockfile changes only the new merge dependency and its resolution. Bundle membership is unchanged.

The focused UI/CodeMirror smoke uses the actual document service and editor: it checks More/Collapse labels, red/green diff decorations, unchanged-side omission, changing source/local observations, synchronization without leaving diff mode, and the retained editor's selection and undo. Browser composition and installation are owned by the main integration task. No live checkout, Host, profile, service or historical deployment record is changed by this candidate.

- `DSH_CHECKOUT=/root/dsh-resource-workbench-candidate/harness pnpm exec vitest run packages/dsh-file-viewer-editor/tests/inline-diff.client.spec.tsx packages/dsh-file-viewer/tests/file-viewer-panel.client.spec.tsx -t 'inline differences|presents conflicts|keeps status'` passed 3 selected tests; 4 unrelated cases were filtered out.
- `DSH_CHECKOUT=/root/dsh-resource-workbench-candidate/harness pnpm run build` passed both packages' TypeScript compilation and browser builds. The editor bundle is 572.28 kB, 152.58 kB gzip.
- `git diff --check` passed. No full suite, separate typecheck, extended negative control or live operation was run for this revision.
