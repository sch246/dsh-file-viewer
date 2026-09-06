# dsh-file-viewer contributor instructions

This repository is an out-of-tree DeepSeek Harness plugin. Read the [installation and adaptation map](.intent/state/STATE.md) before installation, adaptation or filesystem/lifecycle changes. Use it to select capabilities and preserve product behavior in the actual Host environment; refine it from user feedback and observed behavior. Record implementation constraints and execution evidence in local logs.

- Build against an explicit `DSH_CHECKOUT`; never edit or restart that checkout implicitly.
- Keep `ResourceWorkbenchRuntime` as the only owner of sources, handlers, associations and resource views. `FileViewerService` owns shared text documents and exact synchronization state; providers receive no store setters.
- Keep the workbench source-neutral and text/byte capabilities independent. Viewer owns the filesystem source over shared authenticated UI access; directory management and automatic Links recognition remain independent optional features.
- Register the static `resource-workbench` view once. The sidebar owns groups, previews and persisted layout; the workbench owns JSON-safe restore descriptors and reconnects views to resource state.
- One exact Session/source/resource reference owns one shared text document. View ids own selection, scroll and undo state. Moving or remounting a view must not reread, copy or destroy the document.
- Handler switching stays in the same sidebar instance. A retained handler controller registers close guards; renderer-effect disposal must not discard a dirty handler's veto.
- Keep the CodeMirror implementation in `@dsh-external/dsh-file-viewer-editor` and import it through `ctx.modules.import()`.
- Setup and uninstall default to inspection. They change a profile only under explicit flags and never mutate Harness source or restart a service.
- The viewer Bundle and editor dependency enter or leave a profile together; the editor remains a plain dependency while its graph row comes from the viewer Bundle patch.
- Canonical text belongs to each source. The generic editor never normalizes or trims source text, and byte handlers never force decoding through the text path.
