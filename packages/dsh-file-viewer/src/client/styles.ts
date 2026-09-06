/** Text editor styles, installed for the plugin fiber lifetime. */
export const FILE_VIEWER_CSS = `
.dsh-resource-workbench-root{display:flex;flex-direction:column;height:100%;min-height:0;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary)}
.dsh-resource-workbench-bar{display:flex;align-items:center;gap:8px;padding:6px 8px;border-bottom:1px solid var(--dsw-alias-border-l2);font-size:12px}
.dsh-resource-workbench-bar button,.dsh-resource-handler-choice button{border:1px solid var(--dsw-alias-border-l2);border-radius:6px;background:var(--dsw-alias-bg-layer-2);color:inherit;padding:4px 7px;cursor:pointer}
.dsh-resource-handler-picker{position:relative;margin-left:auto;flex-shrink:0}.dsh-resource-handler-menu{position:absolute;right:0;top:calc(100% + 4px);z-index:30;display:flex;flex-direction:column;min-width:180px;max-width:min(300px,85vw);gap:4px;padding:6px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-1);box-shadow:0 4px 16px #0002}
.dsh-resource-handler-row{display:flex;align-items:stretch;gap:2px}.dsh-resource-handler-row button{border:0;background:transparent}.dsh-resource-handler-name{flex:1;text-align:left}.dsh-resource-handler-name[aria-pressed=true]{background:var(--dsw-alias-bg-layer-2);font-weight:600}.dsh-resource-handler-default[aria-pressed=true]{color:var(--dsw-alias-brand-primary)}
.dsh-resource-workbench-content{min-height:0;flex:1}.dsh-resource-handler-choice{display:flex;align-items:flex-start;gap:8px;flex-wrap:wrap;padding:16px}.dsh-resource-handler-choice strong{flex-basis:100%}
.dsh-resource-image-wrap{display:grid;place-items:center;height:100%;min-height:0;overflow:auto;padding:12px;background:repeating-conic-gradient(var(--dsw-alias-bg-layer-2) 0 25%,var(--dsw-alias-bg-layer-1) 0 50%) 0/20px 20px}
.dsh-resource-image-wrap img{display:block;max-width:100%;max-height:100%;object-fit:contain}
.dsh-file-viewer-root{position:relative;display:flex;flex-direction:column;height:100%;min-height:0;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-1)}
.dsh-file-viewer-float{position:absolute;top:5px;right:8px;z-index:20;display:flex;flex-direction:column;align-items:flex-end;max-width:calc(100% - 16px);pointer-events:none}
.dsh-file-viewer-float button,.dsh-file-viewer-float label{pointer-events:auto}
.dsh-file-viewer-status{display:flex;align-items:center;gap:6px;flex-wrap:wrap;justify-content:flex-end;border:1px solid var(--dsw-alias-border-l2);border-radius:6px;padding:3px 7px;font-size:11px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);cursor:pointer}
.dsh-file-viewer-status.is-synced{color:var(--dsw-alias-state-success-primary,#287a4a)}.dsh-file-viewer-status.is-local-ahead{color:var(--dsw-alias-brand-primary)}.dsh-file-viewer-status.is-source-ahead{color:var(--dsw-alias-state-warning-primary,#936600)}.dsh-file-viewer-status.is-diverged,.dsh-file-viewer-status.is-error{color:var(--dsw-alias-state-error-primary)}
.dsh-file-viewer-warning{display:inline-flex;align-items:center;justify-content:center;width:14px;height:14px;border-radius:50%;background:#d97706;color:#fff;font-size:10px;font-weight:700;line-height:1;flex:none;cursor:help}
.dsh-file-viewer-activity{white-space:nowrap}.dsh-file-viewer-pending-dots{display:inline-block;width:3ch;text-align:left}
.dsh-file-viewer-action-group,.dsh-file-viewer-location,.dsh-file-viewer-conflict{display:flex;align-items:center;gap:6px}
.dsh-file-viewer-location{min-width:0;overflow:hidden;color:var(--dsw-alias-label-secondary);font-size:12px;white-space:nowrap}
.dsh-file-viewer-location>span,.dsh-file-viewer-location-segment{min-width:0;overflow:hidden;text-overflow:ellipsis}
.dsh-file-viewer-location button{border:0;background:transparent;color:inherit;padding:0;text-decoration:underline;cursor:pointer}
.dsh-file-viewer-toolbar{display:flex;flex-direction:column;align-items:stretch;gap:4px;padding-top:4px;max-width:100%;font-size:12px;pointer-events:auto}
.dsh-file-viewer-toolbar [hidden]{display:none}
.dsh-file-viewer-action-group{position:relative;border:1px solid var(--dsw-alias-border-l2);border-radius:6px;background:var(--dsw-alias-bg-layer-2)}
.dsh-file-viewer-toolbar .dsh-file-viewer-action-group>button{flex:1;border:0;border-left:1px solid var(--dsw-alias-border-l2);border-radius:0;text-align:left}
.dsh-file-viewer-preference-pair{position:relative;display:flex;align-self:stretch;align-items:center}
.dsh-file-viewer-preference-pair label{display:flex;align-items:center;justify-content:center;padding:0 6px;min-height:100%;color:var(--dsw-alias-label-secondary)}
.dsh-file-viewer-preference-pair .dsh-file-viewer-default-toggle{position:absolute;right:100%;top:-1px;bottom:-1px;opacity:0;pointer-events:none;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l2);border-radius:6px 0 0 6px}
.dsh-file-viewer-preference-pair:hover .dsh-file-viewer-default-toggle,.dsh-file-viewer-preference-pair:focus-within .dsh-file-viewer-default-toggle{opacity:1;pointer-events:auto}
@media(hover:none){.dsh-file-viewer-preference-pair .dsh-file-viewer-default-toggle{opacity:1;pointer-events:auto}}
.dsh-file-viewer-toolbar button,.dsh-file-viewer-conflict button{border:1px solid var(--dsw-alias-border-l2);border-radius:6px;background:var(--dsw-alias-bg-layer-2);color:inherit;padding:4px 8px;cursor:pointer}
.dsh-file-viewer-toolbar button:disabled,.dsh-file-viewer-conflict button:disabled{cursor:not-allowed;opacity:.5}
.dsh-file-viewer-load-confirmation{display:flex;flex-direction:column;align-items:flex-start;gap:10px}.dsh-file-viewer-load-confirmation button{border:1px solid var(--dsw-alias-border-l2);border-radius:6px;background:var(--dsw-alias-bg-layer-2);color:inherit;padding:6px 12px;cursor:pointer}
.dsh-file-viewer-state{padding:16px;color:var(--dsw-alias-label-secondary)}
.dsh-file-viewer-failure,.dsh-file-viewer-notice{padding:6px 10px;font-size:12px}
.dsh-file-viewer-failure{color:var(--dsw-alias-state-error-primary)}
.dsh-file-viewer-failure-detail{display:block;margin-top:2px;color:var(--dsw-alias-label-secondary);overflow-wrap:anywhere}
.dsh-file-viewer-notice{color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-2)}
.dsh-file-viewer-conflict{align-items:flex-start;flex-wrap:wrap;padding:8px 10px;background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 8%,transparent)}
.dsh-file-viewer-conflict span{flex:1 1 220px;color:var(--dsw-alias-label-secondary);font-size:12px}
.dsh-file-viewer-primary-editor{display:flex;flex:1;min-height:0;min-width:0}
.dsh-file-viewer-editor-shell,.dsh-file-viewer-editor{min-height:0;flex:1;height:100%}
`
