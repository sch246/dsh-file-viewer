# Agent Note: Compact resource controls

Status: implemented in candidate

## Decision

Handler choice and default association are independent actions. A pressed-button marker supports choosing and cancelling a default while the handler name alone requests switching through the retained draft guard. The dropdown contains both actions without imposing native radio semantics on the cancellable association.

The editor's permanent status presents the exact synchronization relationship and independent update/save activity. Read and save controllers can overlap, so the primary operation enum cannot describe every active task. `FileViewerService` projects both activity booleans and the primary enum in its notification method; consumers hold no task registry or inferred completion state. Save preparation failure therefore clears the published primary operation as soon as its controller ends.

Hover, focus and touch disclose the vertical manual-action stack. Automation checkboxes state policy, and global defaults only initialize new documents. The only animation is a fixed-width dot suffix on active status text; motion preferences and unmount dispose its interval. Dots have no accessible text contribution. Source observations and hash equality never claim a successful save.

## Consequences

Failures and conflict resolution remain independent of disclosure. Activity cannot reveal buttons or obscure synchronization status, and the overlay only intercepts its controls. The document's synchronization, conditional-save, draft and handler-guard responsibilities remain in their existing owners. [The decision log](../../../../.intent/logs/2026-09-06-compact-resource-controls.md) records verification and the browser acceptance owner.
