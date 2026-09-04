/** File viewer locale namespace. */
export const NS = 'file-viewer'

/** Complete product-copy key set for the Files tab. */
export type FileViewerLocaleKey =
  | 'tab'
  | 'empty'
  | 'loading'
  | 'editorLoading'
  | 'editorFailed'
  | 'save'
  | 'saving'
  | 'saveUnsupported'
  | 'refresh'
  | 'refreshDirty'
  | 'openExternal'
  | 'openExternalUnsupported'
  | 'dirty'
  | 'sourceUnavailable'
  | 'loadFailed'
  | 'saveFailed'
  | 'externalOpenFailed'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'file-viewer': FileViewerLocaleKey
  }
}

export const en: Record<FileViewerLocaleKey, string> = {
  tab: 'Files',
  empty: 'Open a file to preview it here.',
  loading: 'Loading file…',
  editorLoading: 'Loading editor…',
  editorFailed: 'The editor could not be loaded.',
  save: 'Save',
  saving: 'Saving…',
  saveUnsupported: 'This source is read-only.',
  refresh: 'Refresh',
  refreshDirty: 'Save or discard edits before refreshing.',
  openExternal: 'Open in system',
  openExternalUnsupported: 'System open is unavailable for this source.',
  dirty: 'Unsaved changes',
  sourceUnavailable: 'This file source is unavailable.',
  loadFailed: 'The file could not be loaded.',
  saveFailed: 'The file could not be saved.',
  externalOpenFailed: 'The file could not be opened by the system.',
}

export const zh: Record<FileViewerLocaleKey, string> = {
  tab: '文件',
  empty: '打开文件后可在此处预览。',
  loading: '正在加载文件…',
  editorLoading: '正在加载编辑器…',
  editorFailed: '无法加载编辑器。',
  save: '保存',
  saving: '正在保存…',
  saveUnsupported: '该来源为只读。',
  refresh: '刷新',
  refreshDirty: '请先保存或放弃修改，再刷新。',
  openExternal: '在系统中打开',
  openExternalUnsupported: '该来源不支持在系统中打开。',
  dirty: '有未保存的修改',
  sourceUnavailable: '文件来源当前不可用。',
  loadFailed: '无法加载文件。',
  saveFailed: '无法保存文件。',
  externalOpenFailed: '系统无法打开该文件。',
}
