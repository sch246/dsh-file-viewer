# File viewer languages

Optional syntax highlighting for `@dsh-external/dsh-file-viewer` `^0.1.2`. Install this package as an additional Bundle in the same Web profile as the viewer. Its Bundle contributes only its own client graph row; removing it removes its language registrations. The viewer and its editor work without this package.

The pack registers JavaScript, JSX, TypeScript, TSX, Markdown, JSON/JSONC, Python, HTML, XML, CSS, SCSS, Less, YAML, Shell, C, C++, Java, C#, Go, Rust, SQL, TOML and Dockerfile. The editor chooses a registered language from filename hints or the user's selection. Grammar bundles include their maintained embedded-language dependencies, including JavaScript and CSS in HTML. Markdown fenced-code highlighting follows the grammars loaded in the editor registry.

Grammars come from [`@shikijs/langs`](https://shiki.style/languages) 4.3.1. Each loader returns `{ kind: 'textmate', language, grammars }`, where `grammars` contains raw language registrations. The editor owns TextMate matching, theme compilation and CodeMirror instances. This package's single client artifact contains grammar data without CodeMirror runtime modules or additional chunks. Registration uses Cordis effects so plugin disposal unregisters every language.

Build through the repository root with an explicit `DSH_CHECKOUT`.
