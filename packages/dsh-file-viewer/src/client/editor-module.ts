/** Direct CodeMirror factory shape supplied by the independent editor graph row. */
export interface FileViewerEditorModule {
  createFileViewerEditor(options: {
    readonly parent: HTMLElement
    readonly text: string
    readonly readOnly: boolean
    readonly onChange: (text: string) => void
  }): {
    setText(text: string): void
    destroy(): void
  }
}

/** Validate the dynamic module boundary before the UI creates an editor. */
export function asFileViewerEditorModule(value: unknown): FileViewerEditorModule {
  if (
    typeof value !== 'object'
    || value === null
    || !('createFileViewerEditor' in value)
    || typeof value.createFileViewerEditor !== 'function'
  ) {
    throw new Error('file-viewer: editor module does not export createFileViewerEditor')
  }
  return value as FileViewerEditorModule
}
