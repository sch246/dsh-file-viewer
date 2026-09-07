// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { redo, undo } from '@codemirror/commands'
import { EditorView } from '@codemirror/view'
import { createFileViewerEditor, type FileViewerEditorHandle, type FileViewerEditorOptions } from '../src/client.ts'
import { asFileViewerEditorModule } from '../../dsh-file-viewer/src/client/editor-module.ts'

class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

const handles = new Set<FileViewerEditorHandle>()

beforeEach(() => { vi.stubGlobal('ResizeObserver', ResizeObserverStub) })

afterEach(() => {
  try {
    for (const handle of handles) handle.destroy()
  } finally {
    handles.clear()
    document.body.replaceChildren()
    vi.unstubAllGlobals()
  }
})

function mount(options: Partial<Omit<FileViewerEditorOptions, 'parent'>> = {}) {
  const parent = document.createElement('div')
  document.body.appendChild(parent)
  const handle = createFileViewerEditor({ parent, text: 'before', readOnly: false, onChange: () => {}, ...options })
  handles.add(handle)
  const view = EditorView.findFromDOM(parent.querySelector('.cm-editor')!)!
  return { handle, parent, view }
}

describe('CodeMirror editor handle', () => {
  it('updates source state without rebuilding the view and disposes its DOM', () => {
    const { parent, handle } = mount()
    const editor = parent.querySelector('.cm-editor')

    handle.setText('after')
    expect(parent.querySelector('.cm-editor')).toBe(editor)
    expect(parent.querySelector('.cm-content')?.textContent).toBe('after')

    handle.destroy()
    expect(parent.childElementCount).toBe(0)
  })

  it('restores independent selection, scroll and undo history with current callbacks', () => {
    const oldChange = vi.fn()
    const first = mount({ text: 'first', onChange: oldChange })
    first.view.dispatch({ changes: { from: 5, insert: ' edit' }, selection: { anchor: 1, head: 8 } })
    first.view.scrollDOM.scrollTop = 137
    first.view.scrollDOM.scrollLeft = 19
    const firstState = first.handle.captureViewState()
    first.handle.destroy()

    const second = mount({ text: 'second' })
    second.view.dispatch({ changes: { from: 6, insert: ' draft' }, selection: { anchor: 3 } })
    second.view.scrollDOM.scrollTop = 52
    const secondState = second.handle.captureViewState()
    second.handle.destroy()

    oldChange.mockClear()
    const newChange = vi.fn()
    const restoredFirst = mount({ text: 'first edit', viewState: firstState, onChange: newChange })
    const restoredSecond = mount({ text: 'second draft', viewState: secondState })
    expect(restoredFirst.view.state.selection.main).toMatchObject({ anchor: 1, head: 8 })
    expect(restoredFirst.view.scrollDOM.scrollTop).toBe(137)
    expect(restoredFirst.view.scrollDOM.scrollLeft).toBe(19)
    expect(restoredSecond.view.state.selection.main.head).toBe(3)
    expect(restoredSecond.view.scrollDOM.scrollTop).toBe(52)

    expect(undo(restoredFirst.view)).toBe(true)
    expect(restoredFirst.view.state.doc.toString()).toBe('first')
    expect(newChange).toHaveBeenLastCalledWith([{ from: 5, to: 10, insert: '' }])
    expect(oldChange).not.toHaveBeenCalled()
    expect(restoredSecond.view.state.doc.toString()).toBe('second draft')
    expect(undo(restoredSecond.view)).toBe(true)
    expect(restoredSecond.view.state.doc.toString()).toBe('second')
    expect(redo(restoredFirst.view)).toBe(true)
    expect(restoredFirst.view.state.doc.toString()).toBe('first edit')
  })

  it('uses current text and read-only permission when restoring a stale snapshot', () => {
    const first = mount()
    first.view.dispatch({ changes: { from: 6, insert: ' edit' }, selection: { anchor: 2, head: 6 } })
    const viewState = first.handle.captureViewState()
    first.handle.destroy()
    const onChange = vi.fn()
    const restored = mount({ text: 'new', readOnly: true, viewState, onChange })
    expect(restored.view.state.doc.toString()).toBe('new')
    expect(restored.view.state.selection.main).toMatchObject({ anchor: 2, head: 3 })
    expect(restored.view.state.readOnly).toBe(true)
    expect(onChange).not.toHaveBeenCalled()
    const editable = mount({ text: 'new', viewState: restored.handle.captureViewState() })
    expect(editable.view.state.readOnly).toBe(false)
    expect(undo(editable.view)).toBe(false)
  })

  it('excludes external replacements from undo history and retains subsequent edits across remounts', () => {
    const onChange = vi.fn()
    const first = mount({ onChange })
    first.view.dispatch({ selection: { anchor: 6 } })
    first.handle.setText('new')
    first.handle.setText('new')
    expect(first.view.state.selection.main.head).toBe(3)
    expect(onChange).not.toHaveBeenCalled()
    expect(undo(first.view)).toBe(false)
    first.view.dispatch({ changes: { from: 3, insert: ' edit' } })
    const restored = mount({ text: 'new edit', viewState: first.handle.captureViewState() })
    expect(undo(restored.view)).toBe(true)
    expect(restored.view.state.doc.toString()).toBe('new')
    expect(undo(restored.view)).toBe(false)
  })

  it('leaves unchanged source state and undo history intact', () => {
    const onViewStateChange = vi.fn()
    const { handle, view } = mount({ text: 'same', onViewStateChange })
    handle.setText('same')
    expect(onViewStateChange).not.toHaveBeenCalled()

    view.dispatch({ changes: { from: 4, insert: ' edit' } })
    expect(onViewStateChange).toHaveBeenCalledTimes(1)
    handle.setText('same edit')
    expect(onViewStateChange).toHaveBeenCalledTimes(1)

    expect(undo(view)).toBe(true)
    expect(onViewStateChange).toHaveBeenCalledTimes(2)
    handle.setText('same')
    expect(onViewStateChange).toHaveBeenCalledTimes(2)

    handle.setText('other')
    expect(view.state.doc.toString()).toBe('other')
    expect(onViewStateChange).toHaveBeenCalledTimes(3)
  })

  it.each([false, true])('keeps exact text when a dispatch fails after commit=%s', committed => {
    const { handle, view } = mount({ text: 'before' })
    const dispatch = view.dispatch.bind(view)
    const replacement = vi.spyOn(view, 'dispatch').mockImplementationOnce((...transactions) => {
      if (committed) dispatch(...transactions)
      throw new Error('dispatch failure')
    })
    expect(() => handle.setText('after')).toThrow('dispatch failure')
    replacement.mockRestore()
    handle.setText('before')
    expect(view.state.doc.toString()).toBe('before')
    handle.setText('after')
    expect(view.state.doc.toString()).toBe('after')
  })

  it('reports selection, document and scroll updates and captures final offsets before disposal', () => {
    const onViewStateChange = vi.fn()
    const first = mount({ onViewStateChange })
    first.view.dispatch({ selection: { anchor: 4 } })
    expect(onViewStateChange).toHaveBeenCalledTimes(1)
    first.handle.setText('updated')
    expect(onViewStateChange).toHaveBeenCalledTimes(2)
    first.view.scrollDOM.scrollTop = 81
    first.view.scrollDOM.dispatchEvent(new Event('scroll'))
    expect(onViewStateChange).toHaveBeenCalledTimes(3)
    first.view.scrollDOM.scrollTop = 92
    first.handle.destroy()
    expect(onViewStateChange).toHaveBeenCalledTimes(4)
    const restored = mount({ text: 'updated', viewState: onViewStateChange.mock.lastCall![0] })
    expect(restored.view.state.selection.main.head).toBe(4)
    expect(restored.view.scrollDOM.scrollTop).toBe(92)
    first.view.scrollDOM.dispatchEvent(new Event('scroll'))
    first.handle.destroy()
    expect(onViewStateChange).toHaveBeenCalledTimes(4)
    expect(first.parent.childElementCount).toBe(0)
  })

  it('disposes the view even when the final state callback throws', () => {
    const first = mount({ onViewStateChange: () => { throw new Error('callback failed') } })
    expect(() => first.handle.destroy()).toThrow('callback failed')
    expect(first.parent.childElementCount).toBe(0)
    expect(() => first.view.scrollDOM.dispatchEvent(new Event('scroll'))).not.toThrow()
  })

  it('appends read-only source chunks and enables editing without moving selection, scroll or adding undo', () => {
    const onChange = vi.fn()
    const { parent, handle, view } = mount({ text: 'first', readOnly: true, onChange })
    const editor = parent.querySelector('.cm-editor')
    view.dispatch({ selection: { anchor: 1, head: 4 } })
    view.scrollDOM.scrollTop = 137
    handle.appendText('\nsecond')
    expect(view.state.doc.toString()).toBe('first\nsecond')
    expect(view.state.selection.main).toMatchObject({ anchor: 1, head: 4 })
    expect(view.scrollDOM.scrollTop).toBe(137)
    expect(onChange).not.toHaveBeenCalled()
    handle.setReadOnly(false)
    expect(parent.querySelector('.cm-editor')).toBe(editor)
    expect(view.state.readOnly).toBe(false)
    expect(undo(view)).toBe(false)
    view.dispatch({ changes: { from: 12, insert: ' edited' } })
    expect(undo(view)).toBe(true)
    expect(view.state.doc.toString()).toBe('first\nsecond')
  })

  it('maps selection and local undo through guarded remote line changes while retaining scroll', () => {
    const onChange = vi.fn()
    const { handle, view } = mount({ text: 'a\nb\nc\n', onChange })
    view.dispatch({ changes: { from: 4, to: 5, insert: 'C' }, selection: { anchor: 4, head: 5 } })
    onChange.mockClear()
    view.scrollDOM.scrollTop = 123
    handle.applyChanges([{ from: 0, to: 2, insert: 'long\n' }])
    expect(view.state.selection.main).toMatchObject({ anchor: 7, head: 8 })
    expect(view.scrollDOM.scrollTop).toBe(123)
    expect(onChange).not.toHaveBeenCalled()
    expect(undo(view)).toBe(true)
    expect(view.state.doc.toString()).toBe('long\nb\nc\n')
    expect(undo(view)).toBe(false)
  })

  it('emits disjoint input and undo ranges without serializing the full document', () => {
    const onChange = vi.fn()
    const text = 'unchanged line\n'.repeat(10000)
    const { view, handle } = mount({ text, onChange })
    const serialize = vi.spyOn(Object.getPrototypeOf(view.state.doc), 'toString')
    try {
      view.dispatch({ changes: [{ from: 1, to: 3, insert: '漢😀' }, { from: 50, to: 51, insert: '' }] })
      expect(onChange).toHaveBeenLastCalledWith([
        { from: 1, to: 3, insert: '漢😀' }, { from: 50, to: 51, insert: '' },
      ])
      handle.applyChanges([{ from: 100, to: 100, insert: 'peer' }])
      expect(undo(view)).toBe(true)
      expect(serialize).not.toHaveBeenCalled()
      expect(onChange).toHaveBeenLastCalledWith([
        { from: 1, to: 4, insert: 'nc' }, { from: 51, to: 51, insert: 'n' },
      ])
    } finally { serialize.mockRestore() }
  })

  it('rejects foreign view state before attaching an editor', () => {
    const parent = document.createElement('div')
    expect(() => createFileViewerEditor({
      parent, text: 'source', readOnly: false, onChange: () => {}, viewState: {},
    })).toThrow('invalid editor view state')
    expect(parent.childElementCount).toBe(0)
  })

  it('validates the lazy module export before returning its factory', () => {
    for (const invalid of [null, undefined, {}, { createFileViewerEditor: true }]) {
      expect(() => asFileViewerEditorModule(invalid)).toThrow('does not export createFileViewerEditor')
    }
    const module = { createFileViewerEditor }
    expect(asFileViewerEditorModule(module)).toBe(module)
  })
})
