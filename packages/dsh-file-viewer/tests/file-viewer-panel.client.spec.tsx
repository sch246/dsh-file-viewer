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
    resourceMissing: false,
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
    sizeTier: 'normal', largeDefaultsApplied: false, draftPersistence: true,
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
    confirmLoad: vi.fn(), cancelLoad: vi.fn(),
    setDraftPersistence: vi.fn(),
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
        return { appendText: () => {}, setReadOnly: () => {}, setText: vi.fn(), setComparison: vi.fn(), setLineNumbers: vi.fn(), captureViewState: vi.fn(), destroy: vi.fn() }
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

    expect(screen.getByText('Conflict')).toBeTruthy()
    expect(screen.getByText('Automatic synchronization is paused until this state is resolved.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Differences' }))
    expect(screen.getByRole('button', { name: en.backToEditor })).toBeTruthy()
    expect(container.querySelector('pre')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Overwrite source' }))
    fireEvent.click(screen.getByRole('button', { name: 'Discard local' }))
    expect(input.confirm).toHaveBeenCalledTimes(2)
    expect(input.overwriteSource).toHaveBeenCalledWith(instanceId)
    expect(input.discardLocal).toHaveBeenCalledWith(instanceId)
    await waitFor(() => { expect(container.querySelector('[data-editor="mounted"]')).toBeTruthy() })
  })

  it('permits guarded manual saves across source relationships and keeps synchronization age beside status', async () => {
    vi.useFakeTimers(); vi.setSystemTime(11_000)
    for (const syncStatus of ['source-ahead', 'diverged', 'unknown'] as const) {
      const input = props(ready({ syncStatus, deltaSaveSupported: true, lastSyncedAt: 1000,
        savedWithOtherChanges: syncStatus === 'unknown', sourceStale: syncStatus === 'unknown' }))
      const view = render(<FileViewerPanel {...input} />)
      await act(async () => { await Promise.resolve() })
      fireEvent.focus(screen.getByTitle(en.synchronization))
      expect(screen.getByText('Synced 10s ago')).toBeTruthy()
      expect(screen.getByText(en[syncStatus])).toBeTruthy()
      const save = screen.getByRole('button', { name: en.save }) as HTMLButtonElement
      expect(save.disabled).toBe(false)
      fireEvent.click(save)
      expect(input.save).toHaveBeenCalledWith(instanceId)
      if (syncStatus === 'unknown') expect(screen.getByText(en.savedOtherChanges)).toBeTruthy()
      view.unmount()
    }
  })

  it('marks a long document in the permanent status without withholding any control', async () => {
    const comparisons: unknown[] = []
    const base = props(ready({
      sizeTier: 'large', largeDefaultsApplied: true,
      syncStatus: 'local-ahead',
      automationPaused: false,
      failure: { code: 'load-failed', message: 'path "/root/bot/app.log" exceeds the configured resource limit' },
    }))
    const input: typeof base = {
      ...base,
      loadEditor: async () => ({
        createFileViewerEditor: ({ parent, comparison }) => {
          parent.dataset.editor = 'mounted'
          comparisons.push(comparison)
          return { appendText: () => {}, setReadOnly: () => {}, setText: vi.fn(), setComparison: value => { comparisons.push(value) }, setLineNumbers: vi.fn(), captureViewState: vi.fn(), destroy: vi.fn() }
        },
      }),
    }
    const { container } = render(<FileViewerPanel {...input} />)

    // One mark inside the permanent status, with its detail on hover; no notice occupies the editor.
    const warning = container.querySelector('.dsh-file-viewer-warning')!
    expect(warning.closest('.dsh-file-viewer-status')).not.toBeNull()
    expect(warning.getAttribute('title')).toBe(en.largeDocument)
    expect(warning.getAttribute('aria-label')).toBe(en.largeDocument)
    expect(screen.queryByText(en.largeDocument)).toBeNull()
    expect(screen.getByText('path "/root/bot/app.log" exceeds the configured resource limit')).toBeTruthy()

    await waitFor(() => { expect(container.querySelector('[data-editor="mounted"]')).toBeTruthy() })
    fireEvent.focus(screen.getByTitle(en.synchronization))
    const differences = screen.getByRole('button', { name: en.differences }) as HTMLButtonElement
    expect(differences.disabled).toBe(false)
    fireEvent.click(differences)
    expect(screen.getByRole('button', { name: en.backToEditor })).toBeTruthy()
    expect(comparisons.at(-1)).toMatchObject({ baseText: 'base', sourceText: 'source' })

    const unmarked = render(<FileViewerPanel {...props(ready({ sizeTier: 'normal' }))} />)
    expect(unmarked.container.querySelector('.dsh-file-viewer-warning')).toBeNull()
  })

  it('reports the source diagnostic of a failed load', () => {
    const failed: FileViewerInstanceSnapshot = {
      instanceId,
      resourceMissing: false,
      ref: { sessionId: 'session' as never, sourceId, resourceId: 'one' },
      title: 'One',
      status: 'failed',
      operation: 'idle',
      activities: { updating: false, saving: false },
      automation: defaults,
      failure: { code: 'load-failed', message: 'the file is not UTF-8 text' },
    }
    const view = render(<FileViewerPanel {...props(failed)} />)
    expect(screen.getByRole('alert').textContent).toBe(`${en.loadFailed}the file is not UTF-8 text`)

    // A deleted resource is a distinct state, not a generic load failure.
    const missing: FileViewerInstanceSnapshot = {
      ...failed,
      failure: { code: 'resource-missing', message: 'path "/root/bot/test.txt" was not found' },
    }
    view.rerender(<FileViewerPanel {...props(missing)} />)
    expect(screen.getByRole('alert').textContent)
      .toBe(`${en.resourceMissing}path "/root/bot/test.txt" was not found`)
  })

  it('saves immediately on Ctrl+S and gates automatic controls by source capabilities', () => {
    const input = props(ready({ watchSupported: false, syncStatus: 'local-ahead', latestSourceText: 'base', latestSourceHash: 'base-hash' }))
    const { container } = render(<FileViewerPanel {...input} />)
    fireEvent.focus(screen.getByTitle(en.synchronization))
    expect((screen.getByRole('checkbox', { name: en.autoUpdateUnsupported }) as HTMLInputElement).disabled).toBe(true)
    expect((screen.getByRole('checkbox', { name: en.autoSave }) as HTMLInputElement).disabled).toBe(false)

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
    expect((screen.getByRole('checkbox', { name: en.autoSaveUnsupported }) as HTMLInputElement).disabled).toBe(true)

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
    fireEvent.mouseLeave(status.parentElement!)
    expect(screen.getByRole('button', { name: en.update })).toBeTruthy()
    fireEvent.keyDown(status, { key: 'Escape' })
    expect(screen.queryByRole('button', { name: en.update })).toBeNull()
    fireEvent.click(status)
    expect(screen.getByRole('checkbox', { name: en.globalAutoUpdate })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'More' })).toBeNull()
    const numbers = screen.getByRole('checkbox', { name: en.lineNumbers }) as HTMLInputElement
    const initial = numbers.checked
    fireEvent.click(screen.getByRole('button', { name: en.lineNumbers }))
    expect(numbers.checked).toBe(!initial)
    fireEvent.click(numbers)
    expect(numbers.checked).toBe(initial)
    fireEvent.pointerDown(container.querySelector('.dsh-file-viewer-editor-shell')!)
    expect(screen.queryByRole('button', { name: en.update })).toBeNull()
    expect(within(status).getByRole('status').textContent).toBe(en.synced)
  })

  it('keeps current line numbers and toolbar expansion across remounts while defaults affect only new views', async () => {
    let retained: unknown
    const input = { ...props(ready()), getViewState: () => retained, setViewState: (_id: string, value: unknown) => { retained = value } }
    let rendered = render(<FileViewerPanel {...input} />)
    fireEvent.mouseEnter(screen.getByTitle(en.synchronization).parentElement!)
    const defaultBox = screen.getByRole('checkbox', { name: en.defaultLineNumbers }) as HTMLInputElement
    const initialDefault = defaultBox.checked
    const current = screen.getByRole('checkbox', { name: en.lineNumbers }) as HTMLInputElement
    fireEvent.click(defaultBox)
    expect(current.checked).toBe(initialDefault)
    fireEvent.click(screen.getByRole('button', { name: en.lineNumbers }))
    rendered.unmount()
    rendered = render(<FileViewerPanel {...input} />)
    expect((screen.getByRole('checkbox', { name: en.lineNumbers }) as HTMLInputElement).checked).toBe(!initialDefault)
    expect(screen.getByRole('button', { name: en.update })).toBeTruthy()
    rendered.unmount()
    const fresh = render(<FileViewerPanel {...props(ready())} />)
    fireEvent.mouseEnter(screen.getByTitle(en.synchronization).parentElement!)
    expect((screen.getByRole('checkbox', { name: en.lineNumbers }) as HTMLInputElement).checked).toBe(!initialDefault)
    fireEvent.click(screen.getByRole('checkbox', { name: en.defaultLineNumbers }))
    fresh.unmount()
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
