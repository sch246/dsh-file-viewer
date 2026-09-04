/** Files tab styles, installed for the plugin fiber lifetime. */
export const FILE_VIEWER_CSS = `
.dsh-file-viewer-root{display:flex;flex-direction:column;height:100%;min-height:0;color:var(--dsw-text-primary)}
.dsh-file-viewer-toolbar{display:flex;align-items:center;gap:8px;padding:8px;border-bottom:1px solid var(--dsw-border-subtle)}
.dsh-file-viewer-title{min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600}
.dsh-file-viewer-dirty{color:var(--dsw-text-secondary);font-size:12px}
.dsh-file-viewer-toolbar button{border:1px solid var(--dsw-border-subtle);border-radius:6px;background:var(--dsw-surface-secondary);color:inherit;padding:4px 8px}
.dsh-file-viewer-toolbar button:disabled{cursor:not-allowed;opacity:.5}
.dsh-file-viewer-state{padding:16px;color:var(--dsw-text-secondary)}
.dsh-file-viewer-failure{padding:8px 12px;color:var(--dsw-text-danger)}
.dsh-file-viewer-editor-shell,.dsh-file-viewer-editor{min-height:0;flex:1;height:100%}
`
