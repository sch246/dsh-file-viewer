---
description: "Generic resource opening with lazy text, image and contributed handlers for a DeepSeek Harness Web profile."
kind: "package-bundle"
---

# @dsh-external/dsh-file-viewer

## Summary

This Bundle adds a generic resource-opening service and one reusable right-sidebar renderer to a Web profile. Client plugins can register content providers, lazy handlers and independent resource views. Add the Bundle together with its text-editor dependency through the repository setup command; the file-manager plugin independently provides filesystem sources and navigation.

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

The Bundle inserts the browser `@dsh-external/dsh-file-viewer` row and the independent `@dsh-external/dsh-file-viewer-editor` graph row. The browser service exposes generic source, handler and opening actions through `ctx.resourceWorkbench`. Each resource view uses the static `resource-workbench` sidebar renderer; its selected text, image or contributed handler module loads on demand.

The Bundle registers no file source or right-sidebar launcher. A provider independently supplies text or bytes, optional guarded writes and watches, opaque revisions, and optional source-location selection. The file-manager plugin owns the user filesystem provider, external-opening policy and Files launcher.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

[`cordis.patch.yml`](cordis.patch.yml) inserts the workbench and editor Client rows. [`src/client/workbench.ts`](src/client/workbench.ts) owns resource views, handlers, associations and sidebar restoration. [`src/client/service.ts`](src/client/service.ts) owns shared text documents, exact hashes and guarded asynchronous operations. The CodeMirror implementation stays in the sibling editor package and materializes only after a ready text view mounts.

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
- Workbench descriptors and text drafts survive Client recreation; selection, scroll, undo and custom handler state are memory-only.
- The image handler displays bytes but does not edit images. Custom byte handlers own their draft and revision model through the generic byte and close-guard APIs.
- The differences view presents complete Base, Local and Source text without syntax-aware diff alignment.

<a id="dev-note"></a>
## Dev Note

None.
