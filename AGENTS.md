# dsh-file-viewer contributor instructions

This repository is an out-of-tree DeepSeek Harness plugin. `README.md` owns the public contract and `.intent/state/STATE.md` owns intended state. The local current-state format is not the meta-intent protocol and records no accepted realization lock or installation claim.

- Build against an explicit `DSH_CHECKOUT`; never edit or restart that checkout implicitly.
- Keep `FileViewerService` as the only owner of browser document state and actions. Providers contribute through `registerSource()` and receive no store setters.
- The workspace adapter uses the Session header cwd and `ctx.fs`; never use Node filesystem APIs for workspace content.
- Keep the CodeMirror implementation in `@dsh-external/dsh-file-viewer-editor` and import it through `ctx.modules.import()`.
- Setup defaults to patch validation. Applying the patch or changing a profile requires an explicit flag.
- The Git-private `dsh-file-viewer.patch-state` receipt and exact tracked patch digest decide whether uninstall may reverse Harness source. Drift fails without reverting user changes.
- The viewer Bundle and editor dependency enter or leave a profile together; the editor remains a plain dependency while its graph row comes from the viewer Bundle patch.
