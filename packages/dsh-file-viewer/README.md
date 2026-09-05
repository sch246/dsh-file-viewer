---
description: "Source-neutral multi-instance text editing for users composing a DeepSeek Harness Web profile."
kind: "package-bundle"
---

# @dsh-external/dsh-file-viewer

## Summary

This Bundle adds a source-neutral text editor service and one reusable right-sidebar renderer to a Web profile. Client plugins can register content providers and open independent editor instances. Add the Bundle together with its editor dependency through the repository setup command; the file-manager plugin independently provides filesystem sources and navigation.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

### Install into a profile

The repository setup command builds and installs the viewer Bundle and editor dependency together. It does not modify Harness source or restart the selected profile.

```sh
DSH_CHECKOUT=/path/to/deepseek-harness DSH_PROFILE=web pnpm run setup --install
```

### What you get

The Bundle inserts the browser `@dsh-external/dsh-file-viewer` row and the independent `@dsh-external/dsh-file-viewer-editor` graph row. The browser service exposes source registration and instance actions through `ctx.fileViewer`. Each open resource becomes a right-sidebar workbench instance rendered by the shared `text-editor` view.

The Bundle registers no file source or right-sidebar launcher. A source provider supplies loading, optional saving and watching, opaque revisions, and optional source-location selection. The file-manager plugin owns the user filesystem provider and Files launcher.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

[`cordis.patch.yml`](cordis.patch.yml) inserts the viewer and editor Client rows. [`src/client/service.ts`](src/client/service.ts) owns sources, editor instances, exact text hashes and guarded asynchronous operations. [`src/client/index.ts`](src/client/index.ts) registers the public face and one static workbench renderer. The CodeMirror implementation stays in the sibling editor package and materializes only after a ready document mounts.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Repository guide](../../README.md) — source registration, synchronization and installation.
- [Current intended state](../../.intent/state/STATE.md) — acceptance requirements.

-----

<a id="model-experience"></a>
## Model Experience

None. This Bundle changes human browser presentation and adds no model-visible input or tool.

<a id="known-limitations-and-deferred-work"></a>
## Known Limitations and Deferred Work

- The editor presents complete plain text. Sources own size limits, partial-loading policy and canonical line representation.
- Browser editor instances are in memory and do not survive a Client reload.
- The differences view presents complete Base, Local and Source text without syntax-aware diff alignment.

<a id="dev-note"></a>
## Dev Note

None.
