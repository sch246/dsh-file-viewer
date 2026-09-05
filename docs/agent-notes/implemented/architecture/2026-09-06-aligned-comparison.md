# Shared alignment and retained text presentation

CodeMirror document text remains the editing and clipboard authority. The comparison row model derives Base/Local/Source visual slots and paired numbers without inserting baseline deletions or padding into that text. Both panes consume common row heights and scrolling geometry. Independent pane alignment would allow source-only additions or wrapping to shift corresponding lines apart.

The existing resource handler-state owner retains one text presentation record containing line-number visibility, toolbar expansion, comparison mode and the opaque editor checkpoint. Browser defaults initialize new presentations and never rewrite retained values. The local EditorView survives mode changes; Source stays read-only. Separate editable projections would split undo authority and could lose edits during synchronization.
