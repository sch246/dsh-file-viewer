<!-- meta-intent:entry:start -->
## Intent-package entry

Maintain an executable installation and maintenance map as user understanding, upstream software and environments change. The first map can be incomplete; use user feedback and checked reality to improve it, rather than making accumulated implementation debt the permanent design.

- Start with [this package's STATE](.intent/state/STATE.md) and the user's request. STATE tells an unfamiliar Agent which effects to provide, why they matter, where to find resources, and how to install, adapt, verify and remove them under applicable conditions. Keep every supported capability reachable from that map.
- Before writing, distinguish the information's role. STATE owns intended effects and reusable operational guidance. LOG owns selected actual decisions, observations and their reasons; historical implementation gaps, debt inventories and task progress belong there or in a disposable work record. Keep conditions and adaptation steps needed to act in STATE, without turning it into a status table. LOCK retains an exact purpose-bound realization, not permanent requirements. Do not turn this distinction into a mandatory document transaction for each repair.
- Inspect the target and recover relevant existing decisions before inferring new requirements. Code, tests and past installations are evidence about implementations; they do not decide user intent. Optional cooperation does not establish a required dependency. Change STATE when feedback clarifies an effect or experience improves the executable route, not merely because current code differs.
- Maintain confirmed intent in STATE, not a parallel product-behavior test suite. Do not routinely add tests to obtain confidence in an inferred interpretation. Retain useful externally grounded contract and mechanical-invariant checks; remove superseded UI/behavior expectations and unused test scaffolding within the authorized scope. A test is evidence, not a veto over clarified intent, and retained tests need not run for unrelated changes.
- Act within the user's existing authority. Read selected sources when why, scope or attribution matters; do not replay every LOG. Choose checks that resolve a real uncertainty at reasonable cost, and distinguish observed results from unperformed checks.
- This entry routes attention; it does not replace STATE or the selected protocol. Follow the package's state record for protocol/binding changes. See [meta-intent's map](../meta-intent/state/STATE.md) when maintaining this guidance or when the roles themselves are unclear.
<!-- meta-intent:entry:end -->

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
