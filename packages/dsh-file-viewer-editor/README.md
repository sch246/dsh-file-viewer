# File viewer editor

Lazy CodeMirror implementation for the resource workbench. The viewer loads this graph row through `ctx.modules.import()` when a text view mounts.

Standard navigation and selection commands operate on the complete loaded document, including Ctrl+Home/End and Ctrl+Shift+Home/End. Ctrl+F opens search and Ctrl+H focuses replacement in editable panes. Search and replacement cover the full document; read-only panes expose search without replacement. Local edits and replacements retain undo/redo, while source synchronization maps selections and history without adding undo entries. Ctrl+=, Ctrl++ and Ctrl+- call the viewer's font-size callback from either focused pane.

Font family, size, line numbers, search translations, themes and language configuration update the retained editor through compartments. They preserve document state, selection and undo. The viewer owns preferences, filename detection, language choice and localized controls. Both comparison panes use the selected font, language and theme.

Optional language plugins return `{ kind: 'textmate', language, grammars }` with raw Shiki grammar registrations, or a plain `StreamParser`. This package alone creates CodeMirror extensions and tags. TextMate matching uses Shiki 4.3.1 with its Oniguruma WebAssembly engine, including scope selectors, embedded grammars, multiline state and token font styles. CodeMirror checkpoints immutable grammar stacks and incrementally parses lines around the viewport; edits never trigger whole-document tokenization. CodeMirror limits styled tokens on very long lines, while TextMate still computes the complete line's continuation state.

`setTheme()` accepts a parsed VS Code or TextMate theme object; `undefined` restores host appearance. Editor foreground/background, cursor, selection and gutter colors accompany TextMate token colors and italic, bold, underline and strikethrough styles. Missing gutter colors derive a distinct background, subdued numbers and a border from the theme foreground/background. Themes cannot supply semantic tokens that require a language server. Plain StreamParser contributions retain their CodeMirror highlighting and receive editor chrome colors. The Host supplies theme files and resolves includes; this browser module does not read paths or parse XML.

`setLanguage()` and `setTheme()` return promises and reject invalid grammar/theme input or engine initialization failures. The caller presents failures. Superseded asynchronous language work cannot update the editor; disposal releases the registry and its grammar/theme caches. The WebAssembly engine and fixed CodeMirror tag vocabulary are shared by the editor module. No language provider is required for plain text.

Build through the repository root with an explicit `DSH_CHECKOUT`, as described in the root README.
