// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FileViewerPanel, type FileViewerPanelProps } from '../src/client/FileViewerPanel.tsx'
import type { FileViewerInstanceSnapshot } from '../src/client/service.ts'
import { FileViewerSourceId } from '../src/client/service.ts'
import { en } from '../src/client/locales.ts'

const sourceId = FileViewerSourceId('memory')
const instanceId = 'text-editor-1'
const defaults = { autoUpdate: false, autoSave: false }

function ready(
  overrides: Partial<Extract<FileViewerInstanceSnapshot, { status: 'ready' }>> = {},
): Extract<FileViewerInstanceSnapshot, { status: 'ready' }> {
  return {
    instanceId,
    ref: { sessionId: 'session' as never, sourceId, resourceId: 'one' },
    title: 'One',
    status: 'ready',
    operation: 'idle',
    activities: { updating: false, saving: false },
    text: 'local',
    localHash: 'local-hash',
    baseText: 'base',
    baseHash: 'base-hash',
    latestSourceText: 'source',
    latestSourceHash: 'source-hash',
    sourceStale: false,
    syncStatus: 'diverged',
    saveSupported: true,
    conditionalSaveSupported: true,
    watchSupported: true,
    externalOpenSupported: false,
    automation: { autoUpdate: false, autoSave: false },
    automationPaused: true,
    location: {
      label: 'Memory',
      segments: [{ label: 'One', selectionHint: { resourceId: 'one' } }],
      selectorId: 'memory-documents',
    },
    ...overrides,
  }
}

function props(snapshot: FileViewerInstanceSnapshot): FileViewerPanelProps {
  return {
    instanceId,
    snapshot: () => snapshot,
    subscribe: () => () => {},
    edit: vi.fn(),
    save: vi.fn(),
    refresh: vi.fn(),
    overwriteSource: vi.fn(),
    discardLocal: vi.fn(),
    setAutoUpdate: vi.fn(),
    setAutoSave: vi.fn(),
    automationDefaults: () => defaults,
    subscribeAutomationDefaults: () => () => {},
    setGlobalAutoUpdate: vi.fn(),
    setGlobalAutoSave: vi.fn(),
    confirm: vi.fn(() => true),
    loadEditor: async () => ({
      createFileViewerEditor: ({ parent }) => {
        parent.dataset.editor = 'mounted'
        return { setText: vi.fn(), setOriginalText: vi.fn(), captureViewState: vi.fn(), destroy: vi.fn() }
      },
    }),
    t: key => en[key],
  }
}

afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals() })

describe('FileViewerPanel', () => {
  it('presents conflicts, provider locations, and explicitly confirmed resolutions', async () => {
    const input = props(ready())
    const { container } = render(<FileViewerPanel {...input} />)
    fireEvent.focus(screen.getByTitle(en.synchronization))
    fireEvent.click(screen.getByRole('button', { name: en.more }))

    expect(screen.getByText('Conflict')).toBeTruthy()
    expect(screen.getByText('Automatic synchronization is paused until this state is resolved.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Differences' }))
    const differences = screen.getByRole('region', { name: 'Differences' })
    expect(within(differences).getByRole('region', { name: en.local })).toBeTruthy()
    expect(within(differences).getByRole('region', { name: en.source })).toBeTruthy()
    expect(differences.querySelector('pre')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Overwrite source' }))
    fireEvent.click(screen.getByRole('button', { name: 'Discard local' }))
    expect(input.confirm).toHaveBeenCalledTimes(2)
    expect(input.overwriteSource).toHaveBeenCalledWith(instanceId)
    expect(input.discardLocal).toHaveBeenCalledWith(instanceId)
    await waitFor(() => { expect(container.querySelector('[data-editor="mounted"]')).toBeTruthy() })
  })

  it('saves immediately on Ctrl+S and gates automatic controls by source capabilities', () => {
    const input = props(ready({ watchSupported: false, syncStatus: 'local-ahead', latestSourceText: 'base', latestSourceHash: 'base-hash' }))
    const { container } = render(<FileViewerPanel {...input} />)
    fireEvent.focus(screen.getByTitle(en.synchronization))
    const checkboxes = screen.getAllByRole('checkbox')
    expect(checkboxes).toHaveLength(2)
    expect((checkboxes[0] as HTMLInputElement).disabled).toBe(true)
    expect((checkboxes[1] as HTMLInputElement).disabled).toBe(false)

    fireEvent.keyDown(container.firstElementChild!, { key: 's', ctrlKey: true })
    expect(input.save).toHaveBeenCalledWith(instanceId)
  })

  it('requires confirmation before saving through a non-conditional source', () => {
    const input = props(ready({
      conditionalSaveSupported: false,
      syncStatus: 'local-ahead',
      latestSourceText: 'base',
      latestSourceHash: 'base-hash',
    }))
    render(<FileViewerPanel {...input} />)
    fireEvent.focus(screen.getByTitle(en.synchronization))
    const checkboxes = screen.getAllByRole('checkbox')
    expect((checkboxes[1] as HTMLInputElement).disabled).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(input.confirm).toHaveBeenCalledWith(en.confirmOverwrite)
    expect(input.overwriteSource).toHaveBeenCalledWith(instanceId)
    expect(input.save).not.toHaveBeenCalled()
  })

  it('keeps status visible and expands actions for hover, focus and touch until dismissal', () => {
    const { container } = render(<FileViewerPanel {...props(ready({ syncStatus: 'synced', automationPaused: false }))} />)
    const status = screen.getByTitle(en.synchronization)
    expect(within(status).getByRole('status').textContent).toBe(en.synced)
    expect(screen.queryByRole('button', { name: en.update })).toBeNull()
    fireEvent.mouseEnter(status.parentElement!)
    expect(screen.getByRole('button', { name: en.update })).toBeTruthy()
    fireEvent.focus(status)
    fireEvent.mouseLeave(status.parentElement!)
    expect(screen.getByRole('button', { name: en.update })).toBeTruthy()
    fireEvent.keyDown(status, { key: 'Escape' })
    expect(screen.queryByRole('button', { name: en.update })).toBeNull()
    fireEvent.click(status)
    fireEvent.click(screen.getByRole('button', { name: en.more }))
    expect(screen.getByRole('checkbox', { name: en.globalAutoUpdate })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: en.collapse }))
    expect(screen.getByRole('button', { name: en.more })).toBeTruthy()
    expect(screen.queryByRole('checkbox', { name: en.globalAutoUpdate })).toBeNull()
    fireEvent.pointerDown(container.querySelector('.dsh-file-viewer-editor-shell')!)
    expect(screen.queryByRole('button', { name: en.update })).toBeNull()
    expect(within(status).getByRole('status').textContent).toBe(en.synced)
  })

  it('animates concurrent activities only in the permanent status and cleans timers on completion and unmount', async () => {
    vi.useFakeTimers()
    const initial = ready({ syncStatus: 'local-ahead', activities: { updating: true, saving: true }, operation: 'saving' })
    const input = props(initial)
    const rendered = render(<FileViewerPanel {...input} />)
    await act(async () => {})
    const status = screen.getByTitle(en.synchronization)
    expect(status.textContent).toBe(`${en['local-ahead']}${en.updating}${en.saving}`)
    for (const suffix of ['.', '..', '...', '']) {
      act(() => { vi.advanceTimersByTime(400) })
      expect(status.textContent).toBe(`${en['local-ahead']}${en.updating}${suffix}${en.saving}${suffix}`)
    }
    expect(screen.queryByRole('button', { name: en.update })).toBeNull()
    expect(screen.queryByRole('button', { name: en.save })).toBeNull()
    const complete = ready({ syncStatus: 'synced' })
    rendered.rerender(<FileViewerPanel {...input} snapshot={() => complete} />)
    expect(screen.queryByText(en.saving)).toBeNull()
    expect(vi.getTimerCount()).toBe(0)
    rendered.rerender(<FileViewerPanel {...input} />)
    expect(vi.getTimerCount()).toBe(2)
    rendered.unmount()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('uses static pending text with reduced motion and responds to preference changes', async () => {
    vi.useFakeTimers()
    let changed: (() => void) | undefined
    const preference = { matches: true, addEventListener: vi.fn((_name, listener) => { changed = listener }), removeEventListener: vi.fn() }
    vi.stubGlobal('matchMedia', () => preference)
    const rendered = render(<FileViewerPanel {...props(ready({ activities: { updating: true, saving: false } }))} />)
    await act(async () => {})
    expect(screen.getByText(en.updating).textContent).toBe(en.updating)
    expect(vi.getTimerCount()).toBe(0)
    act(() => { preference.matches = false; changed?.() })
    act(() => { vi.advanceTimersByTime(400) })
    expect(screen.getByText(en.updating).textContent).toBe(`${en.updating}.`)
    act(() => { preference.matches = true; changed?.() })
    expect(screen.getByText(en.updating).textContent).toBe(en.updating)
    expect(vi.getTimerCount()).toBe(0)
    rendered.unmount()
    expect(preference.removeEventListener).toHaveBeenCalledWith('change', changed)
  })
})
