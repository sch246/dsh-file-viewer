// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ResourceWorkbenchRuntime, TEXT_RESOURCE_HANDLER_ID, type ResourceViewHost } from '../src/client/workbench.ts'
import { createResourceWorkbenchClientService } from '../src/client/face.ts'
import { createTextResourceView } from '../src/client/text-handler.tsx'
import { FilesystemResourceSource, type FilesystemSourceGateway } from '../src/client/filesystem-source.ts'
import { en } from '../src/client/locales.ts'

const runtimes: ResourceWorkbenchRuntime[] = []
afterEach(() => { cleanup(); for (const runtime of runtimes.splice(0)) runtime.dispose(); vi.useRealTimers() })

function fixture(initial = 'large text') {
  const hosted = new Map<string, Parameters<ResourceViewHost['open']>[1]>()
  const host: ResourceViewHost = {
    open: async (_session, input) => { hosted.set(input.id, input); return 'group' },
    activate: () => {}, update: () => {}, pin: () => {}, group: () => 'group',
    resolveTarget: () => 'group', launch: async () => {}, registerRestorer: () => () => {},
    close: async (_session, id) => {
      const input = hosted.get(id)
      if (input?.onClose && !await input.onClose()) return
      hosted.delete(id)
      input?.onClosed?.()
    },
  }
  const storage = { getItem: vi.fn((_key: string): string | null => null), setItem: vi.fn(), removeItem: vi.fn() }
  const hashText = vi.fn(async (text: string) => text)
  const runtime = new ResourceWorkbenchRuntime({ host, storage, hashText, confirmDiscard: () => true })
  runtimes.push(runtime)
  let disk = initial
  let revision = 'v1'
  const contentRead = vi.fn()
  const gate = (size: number, allowed?: boolean) => {
    if (size > 4 && !allowed) throw {
      code: 'user-files/confirmation-required',
      details: { path: '/file.txt', sizeBytes: size, thresholdBytes: 4 },
    }
  }
  const gateway: FilesystemSourceGateway = {
    readText: vi.fn(async (_session, path, signal, access) => {
      signal.throwIfAborted()
      gate(disk.length, access?.allowLargeFile)
      contentRead()
      return { path, text: disk, version: revision }
    }),
    saveText: vi.fn(async (_session, _path, text, version, signal, access) => {
      signal.throwIfAborted()
      gate(disk.length, access?.allowLargeFile)
      if (version !== revision) throw new Error('conflict')
      disk = text
      revision += 's'
      return { version: revision }
    }),
    readBytes: vi.fn(), saveBytes: vi.fn(),
  }
  const source = new FilesystemResourceSource(gateway, 50)
  const offSource = runtime.registerSource(source)
  runtime.registerHandler({ id: TEXT_RESOURCE_HANDLER_ID, label: 'text', match: () => ({ role: 'default' }), load: async () => ({ View: () => null }) })
  const service = createResourceWorkbenchClientService(runtime)
  const descriptor = { ref: { sourceId: source.id, sessionId: 'session' as never, resourceId: '/file.txt' }, name: 'file.txt' }
  const createEditor = vi.fn(({ parent, text }: { parent: HTMLElement; text: string }) => {
    parent.textContent = text
    return { setText: (next: string) => { parent.textContent = next }, setComparison: vi.fn(), setLineNumbers: vi.fn(), captureViewState: vi.fn(), destroy: vi.fn() }
  })
  const loadEditor = vi.fn(async () => ({ createFileViewerEditor: createEditor }))
  const View = createTextResourceView({ loadEditor, confirm: () => true, t: key => en[key] })
  return { runtime, service, descriptor, gateway, source, offSource, contentRead, hashText, storage, createEditor, loadEditor, View,
    grow: (text: string) => { disk = text; revision += 'g' } }
}

it('shows a neutral size prompt and only fetches, hashes, creates an editor and retains a draft after Load file', async () => {
  vi.useFakeTimers()
  const f = fixture()
  const viewId = await f.service.open(f.descriptor)
  render(<f.View viewId={viewId} handlerId={TEXT_RESOURCE_HANDLER_ID} service={f.service} />)
  expect(screen.getByText('File size: 10 bytes')).toBeTruthy()
  expect(screen.queryByRole('alert')).toBeNull()
  expect(f.contentRead).not.toHaveBeenCalled()
  expect(f.hashText).not.toHaveBeenCalled()
  expect(f.loadEditor).not.toHaveBeenCalled()
  f.runtime.flushDrafts()
  expect(f.storage.setItem).not.toHaveBeenCalled()
  await f.service.refreshText(viewId)
  expect(f.gateway.readText).toHaveBeenCalledTimes(1)
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: en.loadFile })) })
  expect(f.createEditor).toHaveBeenCalledTimes(1)
  expect(f.contentRead).toHaveBeenCalledTimes(1)
  expect(f.service.textSnapshot(viewId)).toMatchObject({ status: 'ready', text: 'large text', saveSupported: true })
  f.runtime.flushDrafts()
  expect(f.storage.setItem).toHaveBeenCalledTimes(1)
  await act(async () => { f.service.editText(viewId, 'edited large text') })
  await act(async () => { await f.service.saveText(viewId) })
  expect(f.gateway.saveText).toHaveBeenCalledWith('session', '/file.txt', 'edited large text', 'v1', expect.any(AbortSignal), { allowLargeFile: true })
  expect(f.service.textSnapshot(viewId)).toMatchObject({ syncStatus: 'synced', text: 'edited large text' })
})

it('shares one decision across views, forgets it after the last close, and leaves an unapproved restored draft untouched', async () => {
  vi.useFakeTimers()
  const f = fixture()
  const draft = JSON.stringify({ format: 1, baseText: 'base', localText: 'retained edits', automation: { autoUpdate: false, autoSave: false } })
  f.storage.getItem.mockImplementation(key => key.startsWith('dsh-file-viewer:draft:') ? draft : null)
  const first = await f.service.open(f.descriptor)
  const second = await f.service.open(f.descriptor, { sideBySide: true })
  await vi.advanceTimersByTimeAsync(1000)
  expect(f.gateway.readText).toHaveBeenCalledTimes(1)
  expect(f.hashText).not.toHaveBeenCalled()
  f.runtime.flushDrafts()
  expect(f.storage.setItem).not.toHaveBeenCalled()
  await f.service.confirmTextLoad(first)
  expect(f.service.textSnapshot(second)).toMatchObject({ text: 'retained edits', baseText: 'base' })
  await f.service.close(first)
  await f.service.refreshText(second)
  expect(f.contentRead).toHaveBeenCalledTimes(2)
  await f.service.close(second)
  const reopened = await f.service.open(f.descriptor)
  expect(f.service.textSnapshot(reopened).status).toBe('confirmation-required')
  expect(f.contentRead).toHaveBeenCalledTimes(2)
})

it('pauses polls on growth, retains local text, and resumes authorized polling and saving after confirmation', async () => {
  vi.useFakeTimers()
  const f = fixture('base')
  const view = await f.service.open(f.descriptor)
  await act(async () => { render(<f.View viewId={view} handlerId={TEXT_RESOURCE_HANDLER_ID} service={f.service} />) })
  await act(async () => { f.service.editText(view, 'local edit') })
  f.grow('external growth')
  await act(async () => { await vi.advanceTimersByTimeAsync(50) })
  expect(screen.getByRole('button', { name: en.loadFile })).toBeTruthy()
  expect(screen.getByText('local edit')).toBeTruthy()
  expect(f.createEditor).toHaveBeenCalledTimes(1)
  expect(f.service.textSnapshot(view)).toMatchObject({ status: 'ready', text: 'local edit', loadConfirmation: { sizeBytes: 15 }, automationPaused: true })
  expect(f.contentRead).toHaveBeenCalledTimes(1)
  expect(f.hashText).not.toHaveBeenCalledWith('external growth')
  const calls = vi.mocked(f.gateway.readText).mock.calls.length
  await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
  await act(async () => { await f.service.saveText(view) })
  expect(f.gateway.readText).toHaveBeenCalledTimes(calls)
  expect(f.gateway.saveText).not.toHaveBeenCalled()
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: en.loadFile })) })
  expect(f.createEditor).toHaveBeenCalledTimes(1)
  expect(f.service.textSnapshot(view)).toMatchObject({ status: 'ready', text: 'local edit', latestSourceText: 'external growth', syncStatus: 'diverged' })
  await act(async () => { await f.service.overwriteSourceText(view) })
  expect(f.service.textSnapshot(view)).toMatchObject({ syncStatus: 'synced', text: 'local edit' })
  await act(async () => { await vi.advanceTimersByTimeAsync(50) })
  expect(vi.mocked(f.gateway.readText).mock.calls.at(-1)?.[3]).toEqual({ allowLargeFile: true })
})

it('saves already-local growth without a loading prompt or content reload', async () => {
  vi.useFakeTimers()
  const f = fixture('base')
  const view = await f.service.open(f.descriptor)
  f.service.editText(view, 'long local edits')
  await Promise.resolve()
  await f.service.saveText(view)
  expect(f.service.textSnapshot(view)).toMatchObject({ text: 'long local edits', syncStatus: 'synced' })
  expect(f.service.textSnapshot(view).loadConfirmation).toBeUndefined()
  expect(f.contentRead).toHaveBeenCalledTimes(1)
  expect(f.gateway.saveText).toHaveBeenCalledTimes(1)
})

it('aborts an approved in-flight read when its last view closes and ignores a source that completes late', async () => {
  const f = fixture()
  const viewId = await f.service.open(f.descriptor)
  const documentId = f.service.textDocumentId(viewId)!
  let finish!: (value: { path: string; text: string; version: string }) => void
  vi.mocked(f.gateway.readText).mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  const pending = f.service.confirmTextLoad(viewId)
  const signal = vi.mocked(f.gateway.readText).mock.calls.at(-1)![2]
  await f.service.close(viewId)
  expect(signal.aborted).toBe(true)
  finish({ path: '/file.txt', text: 'late file', version: 'late' })
  await pending
  expect(f.hashText).not.toHaveBeenCalled()
  expect(f.storage.setItem).not.toHaveBeenCalled()
  expect(() => f.runtime.documents.snapshot(documentId)).toThrow('unknown instance')
})

it('restores a pending confirmation after its source reconnects without reading content', async () => {
  const f = fixture()
  const view = await f.service.open(f.descriptor)
  f.offSource()
  expect(f.service.textSnapshot(view)).toMatchObject({ status: 'failed', failure: { code: 'source-unavailable' } })
  f.runtime.registerSource(f.source)
  expect(f.service.textSnapshot(view).status).toBe('confirmation-required')
  expect(f.service.textSnapshot(view).failure).toBeUndefined()
  expect(f.contentRead).not.toHaveBeenCalled()
  await f.service.confirmTextLoad(view)
  expect(f.service.textSnapshot(view)).toMatchObject({ status: 'ready', text: 'large text' })
})
