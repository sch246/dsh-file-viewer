# Agent Note: Inline resource differences

The lazy CodeMirror package owns unified diff rendering through `@codemirror/merge`. The viewer selects changed Local and Source sides against the shared document's Base, omits unchanged sides, and combines repeated text. A separate Base column has no presentation responsibility.

Comparisons are read-only and expose no merge accept/reject actions. Baseline effects and text replacements update the comparison from document observations without writing to the shared document. The ordinary editor remains mounted while hidden, preserving its selection, scroll and history; explicit toolbar selection returns to that editor. Synchronization changes comparison content without ending comparison mode.

The sole Differences toggle belongs to the floating action toolbar, so ordinary document flow does not acquire or remove a diff button as automation advances Base. More and Collapse are two labels for one defaults-disclosure button. [The decision log](../../../../.intent/logs/2026-09-06-inline-differences.md) records implementation and verification evidence.
