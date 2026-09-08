# HTML preview

Use Edit side by side to open an editor to the left of the preview.

This optional Client plugin registers an HTML handler for `.html`, `.htm` and `text/html` resources. It consumes the viewer’s shared fully loaded Local text, so unsaved edits can appear beside the text editor. Incomplete loading never executes a partial page.

The HTML document renders in a sandboxed iframe with an opaque origin. Scripts are disabled by default. Each preview has its own Allow scripts toggle and a separate browser-local default for new previews. Enabling scripts adds only `allow-scripts`; same-origin access, top navigation, popups and form submission remain unavailable. Turning the toggle or using Reload recreates the iframe, and changed Local text reloads its document. Runtime state inside the page does not survive that reload.

Self-contained HTML/CSS and absolute web assets can render. A fixed `about:blank` base prevents relative paths from resolving against Harness; this is not a local project web server. JavaScript has the iframe’s sandboxed browser environment, without access to the Harness DOM, storage or authenticated application context.

## Install and remove

Build from this repository with `DSH_CHECKOUT=/path/to/deepseek-harness pnpm run build`. The selected profile must already provide a compatible viewer (`^0.1.4`), plus its own sidebar and filesystem dependencies. From the selected Host with explicit `DSH_HOME`, run:

```sh
node --import tsx/esm apps/cli/src/bin.ts plugin --profile web add /absolute/path/to/packages/dsh-html-preview
node --import tsx/esm apps/cli/src/bin.ts plugin --profile web remove @dsh-external/dsh-html-preview
```

Adding/removing this Bundle leaves the other preview plugin independent. Retain the viewer while either preview needs it. Activation is a separate service operation. See the [installation map](../../.intent/state/STATE.md).
