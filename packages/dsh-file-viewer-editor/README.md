# File viewer editor

Lazy CodeMirror implementation for the resource workbench. The viewer loads this graph row through `ctx.modules.import()` when a text view mounts.

Standard navigation and selection commands operate on the complete loaded document, including Ctrl+Home/End and Ctrl+Shift+Home/End. Ctrl+F opens search and Ctrl+H focuses replacement in editable panes. Search and replacement cover the full document; read-only panes expose search without replacement. Local edits and replacements retain undo/redo, while source synchronization maps selections and history without adding undo entries.

Font family, size, line numbers, search translations and language configuration update the retained editor through compartments. They preserve document state, selection and undo. The viewer owns browser preferences, filename detection, language choice and localized controls. Both comparison panes use the selected font and language.

Optional language plugins contribute lazy plain `StreamParser` objects through the viewer's language registry. This package alone creates `StreamLanguage` extensions, keeping CodeMirror state instances inside one browser module. No provider is required for plain text. Removing a provider clears highlighting; asynchronous results from an earlier choice cannot replace the current language. Tokenization is incremental and viewport-driven.

Build and check through the repository root with an explicit `DSH_CHECKOUT`, as described in the root README. The editor's focused regression file is `tests/editor.client.spec.ts`.
