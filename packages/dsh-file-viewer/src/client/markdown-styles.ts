/** Scrollable Markdown content within the workbench's retained sidebar instance. */
export const MARKDOWN_CSS = `
.dsh-resource-markdown { display: flex; flex-direction: column; flex: 1; min-height: 0; overflow: hidden; }
.dsh-resource-markdown-content { flex: 1; min-height: 0; overflow: auto; padding: 16px; overflow-wrap: anywhere; }
.dsh-resource-markdown-controls { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 6px 12px; font-size: 12px; }
`
