/** File viewer locale namespace. */
export const NS = 'file-viewer'

/** Complete product-copy key set for the text editor. */
export type FileViewerLocaleKey =
  | 'loading' | 'editorLoading' | 'editorFailed'
  | 'save' | 'saving' | 'saveUnsupported' | 'update' | 'updating'
  | 'automatic' | 'autoUpdate' | 'autoUpdateUnsupported' | 'autoSave' | 'autoSaveUnsupported'
  | 'openExternal' | 'openExternalUnsupported' | 'dirty' | 'readOnly' | 'location'
  | 'sourceUnavailable' | 'loadFailed' | 'saveFailed' | 'saveConflict' | 'hashFailed'
  | 'watchFailed' | 'externalOpenFailed' | 'operationFailed'
  | 'synced' | 'local-ahead' | 'source-ahead' | 'diverged' | 'unknown'
  | 'automationPaused' | 'sourceStale' | 'conflict' | 'conflictHelp' | 'differences'
  | 'base' | 'local' | 'source' | 'sourceUnknown' | 'overwriteSource' | 'discardLocal'
  | 'confirmOverwrite' | 'confirmDiscard' | 'confirmClose'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Product copy owned by the file-viewer client. */
    'file-viewer': FileViewerLocaleKey
  }
}

export const en: Record<FileViewerLocaleKey, string> = {
  loading: 'Loading document…',
  editorLoading: 'Loading editor…',
  editorFailed: 'The editor could not be loaded.',
  save: 'Save',
  saving: 'Saving…',
  saveUnsupported: 'This source is read-only.',
  update: 'Update',
  updating: 'Updating…',
  automatic: 'Auto',
  autoUpdate: 'Update automatically after source changes.',
  autoUpdateUnsupported: 'Automatic update requires source watching.',
  autoSave: 'Save automatically with revision protection.',
  autoSaveUnsupported: 'Automatic save requires conditional writes.',
  openExternal: 'Open',
  openExternalUnsupported: 'External opening is unavailable for this source.',
  dirty: 'Edited',
  readOnly: 'Read only',
  location: 'Source location',
  sourceUnavailable: 'This document source is unavailable. Local text is retained.',
  loadFailed: 'The document could not be loaded.',
  saveFailed: 'The document could not be saved.',
  saveConflict: 'The source changed. Compare the versions before choosing what to keep.',
  hashFailed: 'The document could not be compared safely.',
  watchFailed: 'Source watching failed. Manual update remains available.',
  externalOpenFailed: 'The document could not be opened externally.',
  operationFailed: 'The document operation failed.',
  synced: 'Synced',
  'local-ahead': 'Local changes',
  'source-ahead': 'Source changed',
  diverged: 'Conflict',
  unknown: 'Checking',
  automationPaused: 'Automatic synchronization is paused until this state is resolved.',
  sourceStale: 'The source reported a change. Update to compare the latest text.',
  conflict: 'Both versions changed.',
  conflictHelp: 'Compare all three versions, then explicitly choose which version to keep.',
  differences: 'Differences',
  base: 'Base',
  local: 'Local',
  source: 'Source',
  sourceUnknown: 'Latest source text is unavailable.',
  overwriteSource: 'Overwrite source',
  discardLocal: 'Discard local',
  confirmOverwrite: 'Overwrite the source with the local text? This cannot be undone here.',
  confirmDiscard: 'Discard local edits and replace them with the latest source text?',
  confirmClose: 'Close this document and discard its unsaved local edits?',
}

export const zh: Record<FileViewerLocaleKey, string> = {
  loading: '正在加载文档…',
  editorLoading: '正在加载编辑器…',
  editorFailed: '无法加载编辑器。',
  save: '保存',
  saving: '正在保存…',
  saveUnsupported: '该来源为只读。',
  update: '更新',
  updating: '正在更新…',
  automatic: '自动',
  autoUpdate: '来源变化后自动更新。',
  autoUpdateUnsupported: '自动更新需要来源支持监听变化。',
  autoSave: '使用版本保护自动保存。',
  autoSaveUnsupported: '自动保存需要来源支持条件写入。',
  openExternal: '打开',
  openExternalUnsupported: '该来源不支持外部打开。',
  dirty: '已编辑',
  readOnly: '只读',
  location: '来源位置',
  sourceUnavailable: '文档来源当前不可用，已保留本地文本。',
  loadFailed: '无法加载文档。',
  saveFailed: '无法保存文档。',
  saveConflict: '来源已有变化，请比较版本后再选择保留内容。',
  hashFailed: '无法安全比较文档内容。',
  watchFailed: '来源监听失败，仍可手动更新。',
  externalOpenFailed: '无法从外部打开文档。',
  operationFailed: '文档操作失败。',
  synced: '已同步',
  'local-ahead': '本地有修改',
  'source-ahead': '来源有修改',
  diverged: '冲突',
  unknown: '正在检查',
  automationPaused: '自动同步已暂停，请先处理当前状态。',
  sourceStale: '来源报告了变化，请更新以比较最新文本。',
  conflict: '本地与来源均有修改。',
  conflictHelp: '比较三个版本，然后明确选择要保留的版本。',
  differences: '查看差异',
  base: '基准',
  local: '本地',
  source: '来源',
  sourceUnknown: '无法取得最新来源文本。',
  overwriteSource: '覆盖来源',
  discardLocal: '放弃本地修改',
  confirmOverwrite: '用本地文本覆盖来源吗？此操作无法在这里撤销。',
  confirmDiscard: '放弃本地修改并替换为最新来源文本吗？',
  confirmClose: '关闭此文档并放弃尚未保存的本地修改吗？',
}
