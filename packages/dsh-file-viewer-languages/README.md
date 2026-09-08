# File viewer languages

Optional syntax highlighting for `@dsh-external/dsh-file-viewer` `^0.1.1`. Install this package as an additional Bundle in the same Web profile as the viewer. Its Bundle contributes only its own client graph row; removing it removes its language registrations. The viewer and its editor work without this package.

The pack registers JavaScript, TypeScript, JSON, Python, HTML, XML, CSS, SCSS, Less, YAML, Shell, C, C++, Java, C#, Go, Rust, SQL, TOML and Dockerfile. The editor chooses a registered language from filename hints or the user's selection. HTML highlights markup without embedded JavaScript/CSS modes. JSX, TSX and Markdown have no dedicated parser in this pack and retain plain-text editing.

Parsers come from [`@codemirror/legacy-modes`](https://code.haverbeke.berlin/codemirror/legacy-modes). Each loader returns a plain StreamParser object. The editor owns `StreamLanguage.define()` and CodeMirror instances; this package's single client artifact contains tokenizer code without CodeMirror runtime modules or additional chunks. Registration uses Cordis effects so plugin disposal unregisters every language.

Run the repository build with an explicit `DSH_CHECKOUT`, then `node --test packages/dsh-file-viewer-languages/tests/languages.test.mjs`. The package test checks the shipped client artifact, parser compatibility with CodeMirror and registration cleanup.
