/** Editor factory supplied by the independent graph row; view state stays opaque to the viewer. */
export interface FileViewerEditorModule {
  createFileViewerEditor(options: {
    readonly parent: HTMLElement
    readonly text: string
    readonly readOnly: boolean
    readonly onChange: (text: string) => void
    /** Baseline for an inline comparison, omitted for normal editing. */
    readonly originalText?: string
    readonly viewState?: unknown
    readonly onViewStateChange?: (state: unknown) => void
  }): {
    setText(text: string): void
    /** Update only the baseline of a comparison created with originalText. */
    setOriginalText(text: string): void
    captureViewState(): unknown
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
