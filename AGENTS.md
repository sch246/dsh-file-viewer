# dsh-file-viewer contributor instructions

This repository is an out-of-tree DeepSeek Harness plugin. `README.md` owns the public contract and `.intent/state/STATE.md` owns intended state. The local current-state format is not the meta-intent protocol and records no accepted realization lock or installation claim.

- Follow the [latest dependency target](.intent/state/STATE.md#latest-dependency-target--migration-pending) for new work: feature cooperation does not establish a required dependency. The ownership statements below describe the current implementation; do not report the target as installed before runtime and profile migration.
- Build against an explicit `DSH_CHECKOUT`; never edit or restart that checkout implicitly.
- Keep `ResourceWorkbenchRuntime` as the only owner of sources, handlers, associations and resource views. `FileViewerService` owns shared text documents and exact synchronization state; providers receive no store setters.
- The workbench is source-neutral. Text and bytes are independent capabilities. In the current implementation, the file-manager plugin owns authenticated filesystem access, filesystem native-open capability, tree navigation and its launcher. The independent resource-links plugin owns Chat path recognition and preview/system opening policy.
- Register the static `resource-workbench` view once. The sidebar owns groups, previews and persisted layout; the workbench owns JSON-safe restore descriptors and reconnects views to resource state.
- One exact Session/source/resource reference owns one shared text document. View ids own selection, scroll and undo state. Moving or remounting a view must not reread, copy or destroy the document.
- Handler switching stays in the same sidebar instance. A retained handler controller registers close guards; renderer-effect disposal must not discard a dirty handler's veto.
- Keep the CodeMirror implementation in `@dsh-external/dsh-file-viewer-editor` and import it through `ctx.modules.import()`.
- Setup and uninstall default to inspection. They change a profile only under explicit flags and never mutate Harness source or restart a service.
- The viewer Bundle and editor dependency enter or leave a profile together; the editor remains a plain dependency while its graph row comes from the viewer Bundle patch.
- Canonical text belongs to each source. The generic editor never normalizes or trims source text, and byte handlers never force decoding through the text path.
