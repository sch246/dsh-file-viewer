// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { EditorView } from '@codemirror/view'
import { undo } from '@codemirror/commands'
import { afterEach, expect, it, vi } from 'vitest'
import { FileViewerPanel } from '../../dsh-file-viewer/src/client/FileViewerPanel.tsx'
import { FileViewerService, FileViewerSourceId, type FileViewerWatchEvent } from '../../dsh-file-viewer/src/client/service.ts'
import { en } from '../../dsh-file-viewer/src/client/locales.ts'
import { createFileViewerEditor } from '../src/client.ts'

afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear() })

it('shows live inline differences without changing the retained editor and toggles More in place', async () => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  const service = new FileViewerService({ hashText: async text => text })
  const sourceId = FileViewerSourceId('inline-diff')
  let watch!: (event: FileViewerWatchEvent) => void
  service.registerSource({ id: sourceId, load: async () => ({ text: 'base\n' }), save: async () => ({}),
    supportsConditionalSave: true, watch: (_ref, listener) => { watch = listener; return () => {} } })
  const id = await service.open({ sessionId: 'session' as never, sourceId, resourceId: 'one' })
  const edit = vi.fn((key: string, text: string) => service.edit(key, text))
  const loadEditor = async () => ({ createFileViewerEditor })
  try {
    const rendered = render(<FileViewerPanel instanceId={id}
      snapshot={key => service.snapshot(key)} subscribe={(key, listener) => service.subscribe(key, listener)}
      edit={edit} save={() => {}} refresh={() => {}} overwriteSource={() => {}} discardLocal={() => {}}
      setAutoUpdate={() => {}} setAutoSave={() => {}}
      automationDefaults={() => service.automationDefaults()}
      subscribeAutomationDefaults={listener => service.subscribeAutomationDefaults(listener)}
      setGlobalAutoUpdate={() => {}} setGlobalAutoSave={() => {}} confirm={() => true}
      loadEditor={loadEditor} t={key => en[key]} />)
    await waitFor(() => { expect(rendered.container.querySelector('.cm-editor')).toBeTruthy() })
    const primary = rendered.container.querySelector('.dsh-file-viewer-primary-editor') as HTMLElement
    const originalDOM = primary.querySelector('.cm-editor')!
    const editor = EditorView.findFromDOM(originalDOM)!
    await act(async () => { editor.dispatch({ changes: { from: 0, to: 4, insert: 'local' }, selection: { anchor: 3 } }) })
    const before = service.snapshot(id)
    edit.mockClear()
    fireEvent.focus(screen.getByTitle(en.synchronization))
    const more = screen.getByRole('button', { name: en.more })
    fireEvent.click(more)
    expect(more.textContent).toBe(en.collapse)
    expect(screen.getAllByRole('button', { name: en.collapse })).toHaveLength(1)
    fireEvent.click(more)
    expect(more.textContent).toBe(en.more)
    fireEvent.click(screen.getByRole('button', { name: en.differences }))
    const difference = screen.getByRole('region', { name: en.differences })
    await waitFor(() => { expect(difference.querySelector('.cm-deletedChunk')?.textContent).toContain('base') })
    expect(difference.querySelector('.cm-changedLine')?.textContent).toContain('local')
    expect(within(difference).queryByRole('region', { name: en.source })).toBeNull()
    expect(difference.querySelector('.cm-chunkButtons')).toBeNull()
    expect(primary.hidden).toBe(true)
    expect(primary.querySelector('.cm-editor')).toBe(originalDOM)
    expect(service.snapshot(id)).toBe(before)
    expect(edit).not.toHaveBeenCalled()
    await act(async () => { watch({ kind: 'snapshot', snapshot: { text: 'remote\n' } }) })
    const sourcePane = within(difference).getByRole('region', { name: en.source })
    await waitFor(() => { expect(sourcePane.querySelector('.cm-changedLine')?.textContent).toContain('remote') })
    await act(async () => { watch({ kind: 'snapshot', snapshot: { text: 'new source\n' } }); service.edit(id, 'new local\n') })
    expect(sourcePane.querySelector('.cm-changedLine')?.textContent).toContain('new source')
    expect(within(difference).getByRole('region', { name: en.local }).querySelector('.cm-changedLine')?.textContent).toContain('new local')
    await act(async () => { service.edit(id, 'base\n') })
    expect(within(difference).queryByRole('region', { name: en.local })).toBeNull()
    expect(within(difference).getByRole('region', { name: en.source })).toBeTruthy()
    await act(async () => { service.edit(id, 'new source\n') })
    await waitFor(() => { expect(within(difference).getByRole('region', { name: en.noDifferences }).querySelector('.cm-content')?.textContent).toContain('new source') })
    expect(screen.getByRole('button', { name: en.backToEditor })).toBeTruthy()
    expect(difference.querySelector('.cm-deletedChunk')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: en.backToEditor }))
    expect(primary.hidden).toBe(false)
    expect(primary.querySelector('.cm-editor')).toBe(originalDOM)
    await act(async () => { editor.dispatch({ changes: { from: editor.state.doc.length, insert: 'draft' }, selection: { anchor: 2 } }) })
    fireEvent.click(screen.getByRole('button', { name: en.differences }))
    fireEvent.click(screen.getByRole('button', { name: en.backToEditor }))
    expect(editor.state.selection.main.head).toBe(2)
    act(() => { expect(undo(editor)).toBe(true) })
    expect(editor.state.doc.toString()).toBe('new source\n')
  } finally {
    cleanup()
    service.dispose()
  }
})
