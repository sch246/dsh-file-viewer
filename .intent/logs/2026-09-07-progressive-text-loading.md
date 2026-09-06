# Progressive text loading implementation evidence

The user selected sequential progressive loading after the existing large-file confirmation, with immediate first text, coalesced later appends, a black square-ended 3 px progress line, and read-only partial content. This supersedes the streaming-presentation exclusion while retaining complete-document editing, existing size tiers and complete JSON saves. Refreshes continue to stage complete observations to preserve Local text.

The existing Harness streaming Remote returns an AsyncIterable and validates each event over its owned mux transport. Provider commit `addec63ae99d1598468eaa1264f8d154d8bb7de2` adds the independently versioned 0.1.2 API. The provider worker reported passing build, typecheck, generated descriptor/codec probes and 33 focused stream/filesystem/Remote cases. Review covered incremental UTF-8, CRLF and raw hashing, pre-content confirmation ceilings, completion stat checks, and cancellation closing an idle file handle. Completion does not reread content.

Viewer owns partial snapshots rather than treating incomplete content as ready. First text publishes immediately, later appends use configurable `progressiveFlushIntervalMs` (300 ms default), and only complete validation followed by hashing restores drafts and enables editing. A real append transaction and read-only Compartment replace full-text replacement/remount responsibilities for this path. Review also prevented retained differences mode from comparing partial text and retained completed filesystem revisions for the first watch.

Work stayed in isolated `/root/dsh-progressive-load/viewer` and `/root/dsh-progressive-load/user-files`. `DSH_USER_FILES=/root/dsh-progressive-load/user-files/packages/dsh-user-files DSH_SIDEBAR=/root/dsh-decoupling-apply/sidebar/packages/dsh-right-sidebar pnpm run install:local` installed independent dependencies using cached packages; transient registry connection resets recovered. Active plugin trees, Host source, profiles and services were not modified by this worker.

`DSH_CHECKOUT=/root/deepseek-harness pnpm run build` and `DSH_CHECKOUT=/root/deepseek-harness pnpm run typecheck` passed. The first build exposed exact-optional typing on the optional source stream and a partial/failure discriminant union; both were corrected. `pnpm run test:setup` passed 3 cases, including rejection of a provider missing the streaming API. The focused command below passed 27 cases; after making the final suffix append through a coalesced completion render, the two stream UI cases passed again with that assertion.

```sh
pnpm exec vitest run packages/dsh-file-viewer/tests/large-file-confirmation.client.spec.tsx packages/dsh-file-viewer/tests/file-size-config.host.spec.ts packages/dsh-file-viewer-editor/tests/editor.client.spec.ts
pnpm exec vitest run packages/dsh-file-viewer/tests/large-file-confirmation.client.spec.tsx -t 'stream chunk|stopped or failed'
```

The checks cover pre-confirmation inactivity, immediate and coalesced partial display, no partial hashes/drafts/saves, stop/failure/retry, retained draft restoration, final revision adoption, and real CodeMirror selection/scroll/history preservation. No browser automation, performance benchmark or wider suite was run. The coordinating agent owns profile activation and pushing. Complete-document memory and save request-body limits remain applicable.
