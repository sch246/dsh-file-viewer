// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { createFileViewerEditor } from '../src/client.ts'

class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

Object.defineProperty(globalThis, 'ResizeObserver', { value: ResizeObserverStub, configurable: true })

afterEach(() => { document.body.replaceChildren() })

describe('CodeMirror editor handle', () => {
  it('updates source state without rebuilding the view and disposes its DOM', () => {
    const parent = document.createElement('div')
    document.body.appendChild(parent)
    const handle = createFileViewerEditor({
      parent,
      text: 'before',
      readOnly: false,
      onChange: () => {},
    })
    const editor = parent.querySelector('.cm-editor')

    handle.setText('after')
    expect(parent.querySelector('.cm-editor')).toBe(editor)
    expect(parent.querySelector('.cm-content')?.textContent).toBe('after')

    handle.destroy()
    expect(parent.childElementCount).toBe(0)
  })
})
