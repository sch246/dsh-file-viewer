# dsh-file-viewer contributor instructions

This repository is an out-of-tree DeepSeek Harness plugin. `README.md` owns the public contract and `.intent/state/STATE.md` owns intended state. The local current-state format is not the meta-intent protocol and records no accepted realization lock or installation claim.

- Build against an explicit `DSH_CHECKOUT`; never edit or restart that checkout implicitly.
- Keep `FileViewerService` as the only owner of browser document state, synchronization and actions. Providers contribute through `registerSource()` and receive no store setters.
- The viewer is source-neutral. The separate file-manager plugin owns authenticated user filesystem access, filesystem routing and its right-sidebar launcher.
- Every open resource is a right-sidebar workbench instance. Register the static `text-editor` view once and address all state and actions by opaque instance id.
- Keep the CodeMirror implementation in `@dsh-external/dsh-file-viewer-editor` and import it through `ctx.modules.import()`.
- Setup and uninstall default to inspection. They change a profile only under explicit flags and never mutate Harness source or restart a service.
- The viewer Bundle and editor dependency enter or leave a profile together; the editor remains a plain dependency while its graph row comes from the viewer Bundle patch.
- Canonical text belongs to each source. The generic editor never normalizes or trims source text.
