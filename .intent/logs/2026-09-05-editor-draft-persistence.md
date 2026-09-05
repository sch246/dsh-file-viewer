# Browser editor draft persistence

The source-neutral editor retains recoverable Base and Local text across Client controller or browser recreation. One browser-local record is keyed by the complete Session, source and resource identity. An explicit open always reads the current Source, recomputes exact hashes for the retained Base, retained Local and fresh Source text, and derives the current three-way relationship.

The retained record contains text only. Source-owned revisions can be opaque or non-serializable, so guarded writes after recovery use only a revision returned by the current source load. Operation failures and paused-automation state also remain runtime-only.

Draft writes are debounced while editing and flushed during Client disposal. A rejected dirty close flushes the current record; an accepted close deletes it so discarded edits do not return. Storage read, parse, write, quota and removal failures cannot replace live editor content or block lifecycle completion.

Base and Local text may be sensitive. They remain in origin-local browser storage and do not enter the Session log, model input or network logging. Same-origin scripts can read this storage, and retained content remains until the instance is accepted for close or the user clears browser site data.

Focused controller tests establish restoration, source movement, exact-text rebasing, edit-back, close and storage-failure behavior. This decision records no live installation or user acceptance.
