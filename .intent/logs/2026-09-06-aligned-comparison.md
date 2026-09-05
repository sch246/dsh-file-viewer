# Aligned comparison and compact preferences

The user requested paired Base/current line numbers, shared Base-aligned geometry across Local and Source, linked scrolling, editable Local text, read-only Source text, nonselectable deleted baseline rows, and stronger inserted-fragment backgrounds. The user also requested retained toolbar expansion and hover-revealed default checkboxes immediately left of the current automation/line-number checkbox. Defaults continue to initialize only new documents or presentations. Installation and Web restart were explicitly authorized for this revision.

The target removes independent per-pane comparison geometry and the hidden duplicate Local view. One local editor owns document editing and undo in both modes; a derived alignment model owns row placement for both panes. The existing handler-state slot retains presentation preferences and opaque editor state. The separate More/defaults section and hover-only expansion state are removed.

Two focused control checks passed for retained expansion, current line-number toggling and default initialization across view remounts. Alignment, combined build, browser verification and activation remain pending.
