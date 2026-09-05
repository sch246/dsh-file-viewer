// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FileViewerPanel, type FileViewerPanelProps } from '../src/client/FileViewerPanel.tsx'
import type { FileViewerInstanceSnapshot } from '../src/client/service.ts'
import { FileViewerSourceId } from '../src/client/service.ts'
import { en } from '../src/client/locales.ts'

const sourceId = FileViewerSourceId('memory')
const instanceId = 'text-editor-1'

function ready(
  overrides: Partial<Extract<FileViewerInstanceSnapshot, { status: 'ready' }>> = {},
): Extract<FileViewerInstanceSnapshot, { status: 'ready' }> {
  return {
    instanceId,
    ref: { sessionId: 'session' as never, sourceId, resourceId: 'one' },
    title: 'One',
    status: 'ready',
    operation: 'idle',
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
    automationInheritance: {
      global: { autoUpdate: false, autoSave: false },
      source: {},
      resource: {},
    },
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
    confirm: vi.fn(() => true),
    loadEditor: async () => ({
      createFileViewerEditor: ({ parent }) => {
        parent.dataset.editor = 'mounted'
        return { setText: vi.fn(), captureViewState: vi.fn(), destroy: vi.fn() }
      },
    }),
    t: key => en[key],
  }
}

afterEach(cleanup)

describe('FileViewerPanel', () => {
  it('presents conflicts, provider locations, and explicitly confirmed resolutions', async () => {
    const input = props(ready())
    const { container } = render(<FileViewerPanel {...input} />)

    expect(screen.getByText('Conflict')).toBeTruthy()
    expect(screen.getByText('Automatic synchronization is paused until this state is resolved.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Differences' }))
    const differences = screen.getByRole('region', { name: 'Differences' })
    expect(within(differences).getByText('base')).toBeTruthy()
    expect(within(differences).getByText('local')).toBeTruthy()
    expect(within(differences).getByText('source')).toBeTruthy()

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
    const checkboxes = screen.getAllByRole('checkbox')
    expect(checkboxes).toHaveLength(4)
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
    const checkboxes = screen.getAllByRole('checkbox')
    expect((checkboxes[1] as HTMLInputElement).disabled).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(input.confirm).toHaveBeenCalledWith(en.confirmOverwrite)
    expect(input.overwriteSource).toHaveBeenCalledWith(instanceId)
    expect(input.save).not.toHaveBeenCalled()
  })
})
