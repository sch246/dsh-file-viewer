/** HTML preview layout styles. */
export const HTML_PREVIEW_CSS = `
.dsh-html-preview{display:flex;flex-direction:column;height:100%;min-width:0;min-height:0;overflow:hidden}
.dsh-html-preview-controls{display:flex;flex:none;gap:10px;align-items:center;padding:6px 12px;font-size:12px;flex-wrap:wrap;border-bottom:1px solid var(--dsw-alias-border-l2)}
.dsh-html-preview-controls button,.dsh-html-preview-controls input{font:inherit}
.dsh-html-preview-controls button{border:1px solid var(--dsw-alias-border-l2);border-radius:6px;background:var(--dsw-alias-bg-layer-2);color:inherit;padding:4px 7px;cursor:pointer}
.dsh-html-preview-controls button:disabled{cursor:default;opacity:.55}
.dsh-html-preview-controls label{display:flex;align-items:center;gap:4px}
.dsh-html-preview-frame{display:block;flex:1;min-height:0;width:100%;border:0;background:white}
.dsh-html-preview-notice{padding:16px}
.dsh-html-preview-error{padding:8px 12px;color:var(--error-color,#c33)}
`
