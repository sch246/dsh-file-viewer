# dsh-file-viewer contributor instructions

This repository is an out-of-tree DeepSeek Harness plugin. `README.md` owns the public contract and `.intent/state/STATE.md` owns intended state. No realization lock is active until setup completes against a named Harness revision.

- Build against an explicit `DSH_CHECKOUT`; never edit or restart that checkout implicitly.
- Keep `FileViewerService` as the only owner of browser document state and actions. Providers contribute through `registerSource()` and receive no store setters.
- The workspace adapter uses the Session header cwd and `ctx.fs`; never use Node filesystem APIs for workspace content.
- Keep the CodeMirror implementation in `@dsh-external/dsh-file-viewer-editor` and import it through `ctx.modules.import()`.
- Setup defaults to patch validation. Applying the patch or changing a profile requires an explicit flag.
