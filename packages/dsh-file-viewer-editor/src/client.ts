import { ChangeSet, EditorSelection, EditorState, StateEffect, Text, Transaction } from '@codemirror/state'
import { history, historyKeymap } from '@codemirror/commands'
import { getOriginalDoc, originalDocChangeEffect, unifiedMergeView } from '@codemirror/merge'
import { EditorView, keymap } from '@codemirror/view'

/** Parameters for one owned CodeMirror instance. */
export interface FileViewerEditorOptions {
  readonly parent: HTMLElement
  readonly text: string
  readonly readOnly: boolean
  readonly onChange: (text: string) => void
  /** Exact baseline for an inline comparison; omit for the ordinary editor. */
  readonly originalText?: string
  /** Opaque, memory-only snapshot captured by this module for the same resource view. */
  readonly viewState?: unknown
  /** Receives document, selection and scroll changes, and the final state before disposal. */
  readonly onViewStateChange?: (state: unknown) => void
}

/** Handle whose disposal tears down the CodeMirror view and DOM observers. */
export interface FileViewerEditorHandle {
  /** Replace source text without recording an undo step or invoking onChange. */
  setText(text: string): void
  /** Update the baseline of a handle created with originalText, without changing its document. */
  setOriginalText(text: string): void
  /** Capture selection, undo history and scroll offsets for a later mount. */
  captureViewState(): unknown
  destroy(): void
}

class ViewState {
  constructor(
    readonly state: EditorState,
    readonly scrollTop: number,
    readonly scrollLeft: number,
    readonly scrollEffect: ReturnType<EditorView['scrollSnapshot']>,
  ) {}
}

const bindings = new WeakMap<EditorView, { options: FileViewerEditorOptions; applying: boolean }>()

function captureViewState(view: EditorView): ViewState {
  return new ViewState(view.state, view.scrollDOM.scrollTop, view.scrollDOM.scrollLeft, view.scrollSnapshot())
}

function reportViewState(view: EditorView): void {
  bindings.get(view)?.options.onViewStateChange?.(captureViewState(view))
}

// Captured EditorState values must not retain a disposed view or its callbacks.
const updateListener = EditorView.updateListener.of((update) => {
  const binding = bindings.get(update.view)
  if (update.docChanged && binding && !binding.applying) binding.options.onChange(update.state.doc.toString())
  if (update.docChanged || update.selectionSet) reportViewState(update.view)
})

function replaceText(state: EditorState, text: string, comparison: boolean): Transaction {
  const selection = state.selection
  return state.update({
    changes: { from: 0, to: state.doc.length, insert: comparison ? Text.of(text.split('\n')) : text },
    selection: EditorSelection.create(selection.ranges.map(range => EditorSelection.range(
      Math.min(range.anchor, text.length),
      Math.min(range.head, text.length),
    )), selection.mainIndex),
    annotations: Transaction.addToHistory.of(false),
  })
}

const theme = EditorView.theme({
  '&': { height: '100%', color: 'var(--dsw-alias-label-primary)', backgroundColor: 'var(--dsw-alias-bg-layer-1)' },
  '.cm-content': { caretColor: 'var(--dsw-alias-brand-primary)', fontFamily: 'monospace' },
  '.cm-cursor': { borderLeftColor: 'var(--dsw-alias-brand-primary)' },
  '.cm-gutters': { backgroundColor: 'var(--dsw-alias-bg-layer-2)', color: 'var(--dsw-alias-label-secondary)', border: 'none' },
  '.cm-deletedChunk': { backgroundColor: 'rgba(220, 65, 65, .12)' },
  '&.cm-merge-b .cm-changedLine': { backgroundColor: 'rgba(45, 170, 85, .12)' },
  '&.cm-focused': { outline: 'none' },
})

/**
 * Create a plain-text editor or an inline comparison with its supplied baseline and no merge actions.
 * @param options Mount, source text and callbacks; text overrides the snapshot document without an undo step.
 * @returns A handle that captures memory-only state and disposes the mounted view.
 * @throws When viewState was not captured by this loaded editor module.
 */
export function createFileViewerEditor(options: FileViewerEditorOptions): FileViewerEditorHandle {
  const prior = options.viewState
  if (prior !== undefined && !(prior instanceof ViewState)) {
    throw new Error('file-viewer: invalid editor view state')
  }
  const extensions = [
    theme,
    history(),
    EditorState.readOnly.of(options.readOnly),
    EditorView.lineWrapping,
    keymap.of(historyKeymap),
    updateListener,
    ...(options.originalText === undefined ? [] : unifiedMergeView({
      original: Text.of(options.originalText.split('\n')),
      mergeControls: false,
      syntaxHighlightDeletions: false,
    })),
  ]
  let state = prior
    ? prior.state.update({ effects: StateEffect.reconfigure.of(extensions) }).state
    : EditorState.create({ doc: options.originalText === undefined ? options.text : Text.of(options.text.split('\n')), extensions })
  let scrollTo = prior?.scrollEffect
  if (state.doc.toString() !== options.text) {
    const replacement = replaceText(state, options.text, options.originalText !== undefined)
    state = replacement.state
    scrollTo = scrollTo?.map(replacement.changes)
  }
  const view = new EditorView({
    parent: options.parent,
    state,
    // CodeMirror also restores after layout when the mount initially has no visible size.
    scrollTo,
  })
  const binding = { options, applying: false }
  bindings.set(view, binding)
  if (prior) {
    view.scrollDOM.scrollTop = prior.scrollTop
    view.scrollDOM.scrollLeft = prior.scrollLeft
  }
  const onScroll = () => { reportViewState(view) }
  view.scrollDOM.addEventListener('scroll', onScroll)
  let destroyed = false
  return {
    setText: (text) => {
      if (text === view.state.doc.toString()) return
      binding.applying = true
      try {
        view.dispatch(replaceText(view.state, text, options.originalText !== undefined))
      } finally {
        binding.applying = false
      }
    },
    setOriginalText: text => {
      const original = getOriginalDoc(view.state)
      if (original.toString() === text) return
      const changes = ChangeSet.of({ from: 0, to: original.length, insert: Text.of(text.split('\n')) }, original.length)
      view.dispatch({ effects: originalDocChangeEffect(view.state, changes), annotations: Transaction.addToHistory.of(false) })
    },
    captureViewState: () => captureViewState(view),
    destroy: () => {
      if (destroyed) return
      destroyed = true
      try {
        reportViewState(view)
      } finally {
        view.scrollDOM.removeEventListener('scroll', onScroll)
        bindings.delete(view)
        view.destroy()
      }
    },
  }
}

/** This graph row is a library; Loader activation has no side effects. */
export function apply(): void {}
