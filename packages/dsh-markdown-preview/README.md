# Markdown preview

This optional Client plugin registers the stable `markdown` text handler with the viewer. It renders shared Local text immediately, including unsaved edits in another view of the same resource. It neither reads files independently nor requires manager or Links.

Each preview retains its own scroll offsets and HTML toggle while mounted or switching handlers. Content edits do not reset scrolling; offsets clamp to the new maximum when the content becomes shorter. Browser scroll anchoring is disabled so edits above the viewport do not shift its numeric position. Late image/code layout changes use the same clamp. Closing the view ends its retained presentation.

Render HTML controls sanitized inline/block HTML. Turning it off displays the original HTML tags; Markdown code fences remain literal in either mode. The separate browser-local default initializes new previews only (initially enabled); changing it leaves existing previews untouched. Scripts, event attributes, arbitrary styles and frames remain filtered. Code highlighting/copying, GFM, math and external HTTP(S) assets remain available.

Use Edit side by side to open the text editor to the left of this preview. Both consume the same document. The preview follows local typing directly; a retry action appears only for incomplete or failed loading.

Document front matter is shown as labelled, source-preserving YAML metadata. Local Markdown links open through the viewer while same-document anchors and external links retain their native behavior.

## Install and remove

Build from this repository with `DSH_CHECKOUT=/path/to/deepseek-harness pnpm run build`. The selected profile must already provide a compatible viewer (`^0.1.5`), plus its own sidebar and filesystem dependencies. From the selected Host with explicit `DSH_HOME`, run:

```sh
node --import tsx/esm apps/cli/src/bin.ts plugin --profile web add /absolute/path/to/packages/dsh-markdown-preview
node --import tsx/esm apps/cli/src/bin.ts plugin --profile web remove @dsh-external/dsh-markdown-preview
```

Adding/removing this Bundle leaves the other preview plugin independent. Retain the viewer while either preview needs it. Activation is a separate service operation. See the [installation map](../../.intent/state/STATE.md).
