/** Scrollable Markdown content within the workbench's retained sidebar instance. */
export const MARKDOWN_CSS = `
.dsh-resource-markdown { display: flex; flex-direction: column; flex: 1; min-height: 0; overflow: hidden; }
.dsh-resource-markdown-content { flex: 1; min-height: 0; overflow: auto; padding: 16px; overflow-wrap: anywhere; }
.dsh-resource-markdown-controls { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 6px 12px; font-size: 12px; }
.dsh-resource-markdown-content { line-height: 1.65; }
.dsh-resource-markdown-content :is(h1,h2,h3,h4,h5,h6) { font-weight: 600; line-height: 1.3; margin: 1em 0 .5em; }
.dsh-resource-markdown-content h1 { font-size: 2em; }
.dsh-resource-markdown-content h2 { font-size: 1.5em; }
.dsh-resource-markdown-content h3 { font-size: 1.25em; }
.dsh-resource-markdown-content p { margin: .65em 0; }
.dsh-resource-markdown-content :is(ul,ol) { padding-inline-start: 2em; margin: .65em 0; }
.dsh-resource-markdown-content ul { list-style: disc; }
.dsh-resource-markdown-content ol { list-style: decimal; }
.dsh-resource-markdown-content blockquote { border-inline-start: 3px solid currentColor; padding-inline-start: 1em; margin-inline: 0; opacity: .8; }
.dsh-resource-markdown-content table { border-collapse: collapse; max-width: 100%; margin: 1em 0; }
.dsh-resource-markdown-content :is(th,td) { border: 1px solid color-mix(in srgb, currentColor 25%, transparent); padding: 6px 12px; }
.dsh-resource-markdown-content [align="center"] { text-align: center; }
.dsh-resource-markdown-content [align="right"] { text-align: right; }
.dsh-resource-markdown-content [align="left"] { text-align: left; }
.dsh-resource-markdown-content img { max-width: 100%; height: auto; }
.dsh-resource-markdown-content a { color: var(--link-color, #368ad8); text-decoration: underline; }
.dsh-resource-markdown-content :not(pre) > code { background: color-mix(in srgb, currentColor 8%, transparent); padding: .1em .3em; border-radius: 3px; }
.dsh-resource-markdown-content pre { overflow: auto; }
.dsh-resource-markdown-content .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
`
