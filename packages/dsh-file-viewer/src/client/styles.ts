/** Text editor styles, installed for the plugin fiber lifetime. */
export const FILE_VIEWER_CSS = `
.dsh-resource-workbench-root{display:flex;flex-direction:column;height:100%;min-height:0;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary)}
.dsh-resource-workbench-bar{display:flex;align-items:center;gap:8px;padding:6px 8px;border-bottom:1px solid var(--dsw-alias-border-l2);font-size:12px;flex-wrap:wrap}
.dsh-resource-workbench-bar label{display:flex;align-items:center;gap:5px}.dsh-resource-workbench-bar select,.dsh-resource-workbench-bar button,.dsh-resource-handler-choice button{border:1px solid var(--dsw-alias-border-l2);border-radius:6px;background:var(--dsw-alias-bg-layer-2);color:inherit;padding:4px 7px}
.dsh-resource-workbench-content{min-height:0;flex:1}.dsh-resource-handler-choice{display:flex;align-items:flex-start;gap:8px;flex-wrap:wrap;padding:16px}.dsh-resource-handler-choice strong{flex-basis:100%}
.dsh-resource-image-wrap{display:grid;place-items:center;height:100%;min-height:0;overflow:auto;padding:12px;background:repeating-conic-gradient(var(--dsw-alias-bg-layer-2) 0 25%,var(--dsw-alias-bg-layer-1) 0 50%) 0/20px 20px}
.dsh-resource-image-wrap img{display:block;max-width:100%;max-height:100%;object-fit:contain}
.dsh-file-viewer-root{display:flex;flex-direction:column;height:100%;min-height:0;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-1)}
.dsh-file-viewer-header{display:flex;flex-direction:column;gap:6px;padding:8px;border-bottom:1px solid var(--dsw-alias-border-l2)}
.dsh-file-viewer-heading,.dsh-file-viewer-toolbar,.dsh-file-viewer-action-group,.dsh-file-viewer-location,.dsh-file-viewer-conflict{display:flex;align-items:center;gap:6px}
.dsh-file-viewer-title{min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600}
.dsh-file-viewer-status,.dsh-file-viewer-readonly,.dsh-file-viewer-dirty{border-radius:999px;padding:1px 6px;font-size:11px;white-space:nowrap;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary)}
.dsh-file-viewer-status.is-diverged{color:var(--dsw-alias-state-error-primary)}
.dsh-file-viewer-location{min-width:0;overflow:hidden;color:var(--dsw-alias-label-secondary);font-size:12px;white-space:nowrap}
.dsh-file-viewer-location>span,.dsh-file-viewer-location-segment{min-width:0;overflow:hidden;text-overflow:ellipsis}
.dsh-file-viewer-location button{border:0;background:transparent;color:inherit;padding:0;text-decoration:underline;cursor:pointer}
.dsh-file-viewer-toolbar{flex-wrap:wrap}
.dsh-file-viewer-defaults{font-size:12px;color:var(--dsw-alias-label-secondary)}.dsh-file-viewer-defaults summary{cursor:pointer}.dsh-file-viewer-defaults[open]{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.dsh-file-viewer-defaults label{display:flex;align-items:center;gap:4px}.dsh-file-viewer-defaults button{border:1px solid var(--dsw-alias-border-l2);border-radius:6px;background:var(--dsw-alias-bg-layer-2);color:inherit;padding:3px 6px}
.dsh-file-viewer-action-group{border:1px solid var(--dsw-alias-border-l2);border-radius:6px;overflow:hidden;background:var(--dsw-alias-bg-layer-2)}
.dsh-file-viewer-action-group>button{border:0;border-right:1px solid var(--dsw-alias-border-l2);border-radius:0}
.dsh-file-viewer-action-group>label{display:flex;align-items:center;gap:3px;padding:0 6px;font-size:11px;color:var(--dsw-alias-label-secondary)}
.dsh-file-viewer-toolbar button,.dsh-file-viewer-conflict button,.dsh-file-viewer-differences-toggle{border:1px solid var(--dsw-alias-border-l2);border-radius:6px;background:var(--dsw-alias-bg-layer-2);color:inherit;padding:4px 8px;cursor:pointer}
.dsh-file-viewer-toolbar button:disabled,.dsh-file-viewer-conflict button:disabled{cursor:not-allowed;opacity:.5}
.dsh-file-viewer-conflict .is-primary{border-color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-brand-primary);color:white}
.dsh-file-viewer-state{padding:16px;color:var(--dsw-alias-label-secondary)}
.dsh-file-viewer-failure,.dsh-file-viewer-notice{padding:6px 10px;font-size:12px}
.dsh-file-viewer-failure{color:var(--dsw-alias-state-error-primary)}
.dsh-file-viewer-notice{color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-2)}
.dsh-file-viewer-conflict{align-items:flex-start;flex-wrap:wrap;padding:8px 10px;background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 8%,transparent)}
.dsh-file-viewer-conflict span{flex:1 1 220px;color:var(--dsw-alias-label-secondary);font-size:12px}
.dsh-file-viewer-differences-toggle{align-self:flex-start;margin:6px 10px}
.dsh-file-viewer-differences{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1px;max-height:38%;overflow:auto;background:var(--dsw-alias-border-l2);border-bottom:1px solid var(--dsw-alias-border-l2)}
.dsh-file-viewer-differences>div{min-width:0;padding:8px;background:var(--dsw-alias-bg-layer-1)}
.dsh-file-viewer-differences pre{margin:6px 0 0;white-space:pre-wrap;overflow-wrap:anywhere;font:11px/1.45 monospace}
.dsh-file-viewer-editor-shell,.dsh-file-viewer-editor{min-height:0;flex:1;height:100%}
@media(max-width:700px){.dsh-file-viewer-differences{grid-template-columns:1fr}}
`
