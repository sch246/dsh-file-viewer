import { EditorState } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'

/** Parameters for one owned CodeMirror instance. */
export interface FileViewerEditorOptions {
  readonly parent: HTMLElement
  readonly text: string
  readonly readOnly: boolean
  readonly onChange: (text: string) => void
}

/** Handle whose disposal tears down the CodeMirror view and DOM observers. */
export interface FileViewerEditorHandle {
  setText(text: string): void
  destroy(): void
}

const theme = EditorView.theme({
  '&': { height: '100%', color: 'var(--dsw-text-primary)', backgroundColor: 'var(--dsw-surface-primary)' },
  '.cm-content': { caretColor: 'var(--dsw-accent-primary)', fontFamily: 'var(--dsw-font-mono)' },
  '.cm-cursor': { borderLeftColor: 'var(--dsw-accent-primary)' },
  '.cm-gutters': { backgroundColor: 'var(--dsw-surface-secondary)', color: 'var(--dsw-text-secondary)', border: 'none' },
  '&.cm-focused': { outline: 'none' },
})

/** Create one plain-text CodeMirror editor without wrapper or language service. */
export function createFileViewerEditor(options: FileViewerEditorOptions): FileViewerEditorHandle {
  let applying = false
  const view = new EditorView({
    parent: options.parent,
    state: EditorState.create({
      doc: options.text,
      extensions: [
        theme,
        EditorState.readOnly.of(options.readOnly),
        EditorView.lineWrapping,
        keymap.of([]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged && !applying) options.onChange(update.state.doc.toString())
        }),
      ],
    }),
  })
  return {
    setText: (text) => {
      if (text === view.state.doc.toString()) return
      applying = true
      try {
        view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } })
      } finally {
        applying = false
      }
    },
    destroy: () => { view.destroy() },
  }
}

/** This graph row is a library; Loader activation has no side effects. */
export function apply(): void {}
