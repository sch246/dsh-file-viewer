// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { EditorView } from '@codemirror/view'
import { undo } from '@codemirror/commands'
import { createFileViewerEditor, type FileViewerEditorHandle } from '../src/client.ts'

let handle: FileViewerEditorHandle | undefined
afterEach(() => {
  handle?.destroy()
  handle = undefined
  document.body.replaceChildren()
  vi.unstubAllGlobals()
})

it('highlights deleted characters and refreshes their ranges inside an unchanged baseline row', () => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  const parent = document.createElement('div')
  document.body.appendChild(parent)
  const baseText = 'before OLD after'
  handle = createFileViewerEditor({ parent, text: 'before NEW after', readOnly: false, onChange() {},
    comparison: { baseText, labels: { local: 'Local', source: 'Source', noDifferences: 'Equal' } } })
  const removed = () => [...parent.querySelectorAll('.cm-deletedText')].map(node => node.textContent).join('')
  expect(removed()).toBe('OLD')
  expect(parent.querySelector('.cm-deletedChunk')?.textContent).toBe(baseText)
  handle.setText('before OLD changed')
  expect(removed()).toBe('after')
  expect(parent.querySelector('.cm-comparison-visual')?.getAttribute('contenteditable')).toBe('false')
  expect(EditorView.findFromDOM(parent.querySelector('.cm-editor')!)!.state.doc.toString()).toBe('before OLD changed')
})

it('edits the retained local view, updates source, toggles numbering and omits equal sides without writing', () => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  const parent = document.createElement('div')
  document.body.appendChild(parent)
  const onChange = vi.fn()
  const labels = { local: 'Local', source: 'Source', noDifferences: 'No differences' }
  handle = createFileViewerEditor({ parent, text: 'base\n', readOnly: false, onChange })
  const originalDOM = parent.querySelector('.cm-editor')!
  const local = EditorView.findFromDOM(originalDOM)!
  local.dispatch({ changes: { from: 0, to: 4, insert: 'local' }, selection: { anchor: 3 } })
  onChange.mockClear()
  const comparison = { baseText: 'base\n', sourceText: 'source\n', labels }
  handle.setComparison(comparison)
  expect(parent.querySelector('.cm-editor')).toBe(originalDOM)
  expect(parent.querySelectorAll('.cm-editor')).toHaveLength(2)
  const source = EditorView.findFromDOM(parent.querySelector('.dsh-file-viewer-source-pane .cm-editor')!)!
  expect(source.state.readOnly).toBe(true)
  expect(local.state.readOnly).toBe(false)
  expect(parent.querySelector('.cm-deletedChunk')?.textContent).toBe('base')
  expect(parent.querySelector('.cm-insertedText')?.textContent).toBe('local')
  expect(parent.querySelector('.cm-comparison-visual')?.getAttribute('contenteditable')).toBe('false')
  expect(parent.querySelectorAll('.cm-comparison-gutter')).toHaveLength(2)
  handle.setLineNumbers(false)
  expect(parent.querySelectorAll('.cm-comparison-gutter')).toHaveLength(0)
  handle.setComparison(comparison)
  expect(parent.querySelectorAll('.cm-comparison-gutter')).toHaveLength(0)
  handle.setLineNumbers(true)
  expect(parent.querySelectorAll('.cm-comparison-gutter')).toHaveLength(2)
  expect(onChange).not.toHaveBeenCalled()

  local.dispatch({ changes: { from: 5, insert: ' edit' } })
  expect(onChange).toHaveBeenLastCalledWith('local edit\n')
  onChange.mockClear()
  handle.setComparison({ ...comparison, sourceText: 'latest\n' })
  expect(source.state.doc.toString()).toBe('latest\n')
  handle.setComparison(undefined)
  expect(parent.querySelector('.cm-editor')).toBe(originalDOM)
  expect(parent.querySelector('.cm-lineNumbers')).toBeTruthy()
  expect(parent.querySelector('.cm-deletedChunk')).toBeNull()
  handle.setLineNumbers(false)
  expect(parent.querySelector('.cm-lineNumbers')).toBeNull()
  handle.setLineNumbers(true)
  expect(parent.querySelector('.cm-lineNumbers')).toBeTruthy()
  expect(onChange).not.toHaveBeenCalled()
  expect(undo(local)).toBe(true)
  expect(local.state.doc.toString()).toBe('base\n')

  handle.setComparison(comparison)
  expect((parent.querySelector('.dsh-file-viewer-local-pane') as HTMLElement).hidden).toBe(true)
  handle.setLineNumbers(false)
  handle.setComparison(undefined)
  handle.setComparison(comparison)
  expect(parent.querySelectorAll('.cm-comparison-gutter')).toHaveLength(0)
  handle.setText('source\n')
  expect(parent.querySelectorAll('.cm-editor')).toHaveLength(1)
  expect((parent.querySelector('.dsh-file-viewer-local-pane') as HTMLElement).hidden).toBe(false)
  handle.setComparison({ baseText: 'source\n', sourceText: 'source\n', labels })
  expect(parent.querySelector('[aria-label="No differences"]')).toBeTruthy()
  expect(parent.querySelector('.cm-deletedChunk')).toBeNull()
})
