// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { webcrypto } from 'node:crypto'
import { pollPolicy } from './poll-policy.ts'
import { hashFileViewerText } from '../src/client/service.ts'
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { ResourceWorkbenchPanel } from '../src/client/ResourceWorkbenchPanel.tsx'
import { formatFileSize } from '../src/client/file-size.ts'
import type { ResourceTextAccess } from '../src/client/resource.ts'
import { ResourceWorkbenchRuntime, TEXT_RESOURCE_HANDLER_ID, type ResourceViewHost } from '../src/client/workbench.ts'
import { createResourceWorkbenchClientService } from '../src/client/face.ts'
import { createTextResourceView } from '../src/client/text-handler.tsx'
import { FilesystemResourceSource, type FilesystemSourceGateway } from '../src/client/filesystem-source.ts'
import { en } from '../src/client/locales.ts'

const runtimes: ResourceWorkbenchRuntime[] = []
beforeEach(() => { vi.stubGlobal('crypto', webcrypto) })
afterEach(() => { cleanup(); for (const runtime of runtimes.splice(0)) runtime.dispose(); vi.useRealTimers(); vi.unstubAllGlobals() })

function fixture(initial = 'large text', tiers: { largeFileBytes?: number; hugeFileBytes?: number } = {}, initialSize = initial.length, streamText?: FilesystemSourceGateway['streamText']) {
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
  const runtime = new ResourceWorkbenchRuntime({ host, storage, hashText, confirmDiscard: () => true, ...tiers })
  runtimes.push(runtime)
  let disk = initial
  let diskSize = initialSize
  let revision = 'v1'
  const contentRead = vi.fn()
  const gate = (size: number, access?: ResourceTextAccess) => {
    const limit = access?.allowLargeFile ? access.maxConfirmedBytes : Math.min(4, access?.maxConfirmedBytes ?? Infinity)
    if (limit !== undefined && size > limit) throw {
      code: 'user-files/confirmation-required',
      details: { path: '/file.txt', sizeBytes: size, thresholdBytes: limit },
    }
  }
  const gateway: FilesystemSourceGateway = {
    ...(streamText === undefined ? {} : { streamText }),
    deltaText: vi.fn(async (_session, _path, baseHash, _background, _max, signal, access) => {
      signal.throwIfAborted(); gate(diskSize, access)
      return baseHash === disk ? { kind: 'unchanged' as const, canonicalHash: disk, version: revision, sizeBytes: diskSize }
        : { kind: 'manual-required' as const, reason: 'base-missing' as const }
    }),
    readText: vi.fn(async (_session, path, signal, access) => {
      signal.throwIfAborted()
      gate(diskSize, access)
      contentRead()
      return { path, text: disk, version: revision, sizeBytes: diskSize }
    }),
    patchText: vi.fn(async (_session, _path, ranges, signal, access) => {
      const lines = disk.match(/[^\n]*\n|[^\n]+$/g) ?? []
      let text = '', end = 0
      for (const range of ranges) {
        if (await hashFileViewerText(lines.slice(range.startLine, range.startLine + range.lineCount).join('')) !== range.expectedHash) throw new Error('conflict')
        text += lines.slice(end, range.startLine).join('') + range.replacement
        end = range.startLine + range.lineCount
      }
      text += lines.slice(end).join('')
      signal.throwIfAborted()
      gate(diskSize, access)
      disk = text
      diskSize = text.length
      revision += 's'
      return { version: revision, sizeBytes: diskSize, canonicalHash: disk }
    }),
    readBytes: vi.fn(), saveBytes: vi.fn(),
  }
  const source = new FilesystemResourceSource(gateway, pollPolicy(50))
  const offSource = runtime.registerSource(source)
  runtime.registerHandler({ id: TEXT_RESOURCE_HANDLER_ID, label: 'text', match: () => ({ role: 'default' }), load: async () => ({ View: () => null }) })
  const service = createResourceWorkbenchClientService(runtime)
  const descriptor = { ref: { sourceId: source.id, sessionId: 'session' as never, resourceId: '/file.txt' }, name: 'file.txt', size: initialSize }
  const createEditor = vi.fn(({ parent, text }: { parent: HTMLElement; text: string }) => {
    parent.textContent = text
    return { appendText: vi.fn((next: string) => { parent.textContent += next }), setReadOnly: vi.fn(), setText: (next: string) => { parent.textContent = next }, setComparison: vi.fn(), setLineNumbers: vi.fn(), captureViewState: vi.fn(), destroy: vi.fn() }
  })
  const loadEditor = vi.fn(async () => ({ createFileViewerEditor: createEditor }))
  const View = createTextResourceView({ loadEditor, confirm: () => true, t: key => en[key] })
  return { runtime, service, descriptor, gateway, source, offSource, contentRead, hashText, storage, createEditor, loadEditor, View,
    grow: (text: string, size = text.length) => { disk = text; diskSize = size; revision += 'g' } }
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
  expect(f.gateway.patchText).toHaveBeenCalledWith('session', '/file.txt', [expect.objectContaining({ replacement: 'edited large text', expectedHash: expect.stringMatching(/^[a-f0-9]{64}$/) })], expect.any(AbortSignal), { allowLargeFile: true })
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
  expect(f.contentRead).toHaveBeenCalledTimes(1)
  await f.service.close(second)
  const reopened = await f.service.open(f.descriptor)
  expect(f.service.textSnapshot(reopened).status).toBe('confirmation-required')
  expect(f.contentRead).toHaveBeenCalledTimes(1)
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
  expect(f.gateway.patchText).not.toHaveBeenCalled()
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
  const f = fixture('base', { largeFileBytes: 10, hugeFileBytes: 100 })
  const view = await f.service.open(f.descriptor)
  f.service.editText(view, 'long local edits')
  await Promise.resolve()
  await f.service.saveText(view)
  expect(f.service.textSnapshot(view)).toMatchObject({ text: 'long local edits', syncStatus: 'synced', sizeBytes: 16, draftPersistence: false })
  expect(f.service.textSnapshot(view).loadConfirmation).toBeUndefined()
  expect(f.contentRead).toHaveBeenCalledTimes(1)
  expect(f.gateway.patchText).toHaveBeenCalledTimes(1)
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

it('scales source sizes with IEC units', () => {
  expect(formatFileSize(0, 'bytes')).toBe('0 bytes')
  expect(formatFileSize(1023, 'bytes')).toBe('1,023 bytes')
  expect(formatFileSize(1024, 'bytes')).toBe('1 KiB')
  expect(formatFileSize(1.5 * 1024 ** 2, 'bytes')).toBe('1.5 MiB')
  expect(formatFileSize(1024 ** 3, 'bytes')).toBe('1 GiB')
})

it('applies large defaults before draft writes and polling, retains old drafts, and permits individual reenablement', async () => {
  vi.useFakeTimers()
  const f = fixture('large text', { largeFileBytes: 10, hugeFileBytes: 100 }, 11)
  const draft = JSON.stringify({ format: 1, baseText: 'base', localText: 'retained local', automation: { autoUpdate: true, autoSave: true } })
  f.storage.getItem.mockImplementation(key => key.startsWith('dsh-file-viewer:draft:') ? draft : null)
  const view = await f.service.open(f.descriptor)
  expect(f.service.textSnapshot(view)).toMatchObject({ sizeBytes: 11, sizeTier: 'large', draftPersistence: false, automation: { autoUpdate: false, autoSave: false } })
  await f.service.confirmTextLoad(view)
  await act(async () => { render(<f.View viewId={view} handlerId={TEXT_RESOURCE_HANDLER_ID} service={f.service} />) })
  expect(f.service.textSnapshot(view)).toMatchObject({ text: 'retained local', baseText: 'base' })
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); f.runtime.flushDrafts() })
  expect(f.contentRead).toHaveBeenCalledTimes(1)
  expect(f.storage.setItem).not.toHaveBeenCalled()
  expect(f.storage.removeItem).not.toHaveBeenCalled()
  fireEvent.focus(screen.getByTitle(en.synchronization))
  expect((screen.getByRole('checkbox', { name: en.draftPersistence }) as HTMLInputElement).checked).toBe(false)
  expect((screen.getByRole('button', { name: en.differences }) as HTMLButtonElement).getAttribute('aria-pressed')).toBe('false')
  fireEvent.click(screen.getByRole('checkbox', { name: en.draftPersistence }))
  fireEvent.click(screen.getByRole('button', { name: en.differences }))
  expect(f.service.textSnapshot(view).draftPersistence).toBe(true)
  await act(async () => { f.runtime.flushDrafts() })
  expect(f.storage.setItem).toHaveBeenCalledTimes(1)
  fireEvent.click(screen.getByRole('checkbox', { name: en.autoUpdate }))
  await act(async () => { await vi.advanceTimersByTimeAsync(50) })
  expect(f.contentRead).toHaveBeenCalledTimes(1)
  expect(f.service.textSnapshot(view)).toMatchObject({ draftPersistence: true, automation: { autoUpdate: true } })
  expect(screen.getByRole('button', { name: en.backToEditor })).toBeTruthy()
  fireEvent.click(screen.getByRole('checkbox', { name: en.autoUpdate }))
  await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
  expect(f.contentRead).toHaveBeenCalledTimes(1)
  await act(async () => { await f.service.refreshText(view) })
  expect(f.contentRead).toHaveBeenCalledTimes(1)
  expect(f.service.textSnapshot(view).draftPersistence).toBe(true)
})

it('requires a stronger action before a previously approved file grows beyond the huge tier', async () => {
  vi.useFakeTimers()
  const f = fixture('base text', { largeFileBytes: 10, hugeFileBytes: 100 }, 10)
  const view = await f.service.open(f.descriptor)
  await f.service.confirmTextLoad(view)
  expect(f.service.textSnapshot(view)).toMatchObject({ sizeTier: 'normal', draftPersistence: true })
  await act(async () => { render(<f.View viewId={view} handlerId={TEXT_RESOURCE_HANDLER_ID} service={f.service} />) })
  fireEvent.focus(screen.getByTitle(en.synchronization))
  fireEvent.click(screen.getByRole('button', { name: en.differences }))
  await act(async () => { f.service.editText(view, 'local edits') })
  f.grow('huge source', 101)
  await act(async () => { await vi.advanceTimersByTimeAsync(50) })
  expect(f.contentRead).toHaveBeenCalledTimes(1)
  expect(screen.getByText(en.hugeFilePrompt)).toBeTruthy()
  expect(screen.getByRole('button', { name: en.continueLoading })).toBeTruthy()
  expect(f.service.textSnapshot(view)).toMatchObject({ text: 'local edits', sizeTier: 'huge', draftPersistence: false })
  expect(screen.getByRole('button', { name: en.differences }).getAttribute('aria-pressed')).toBe('false')
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: en.continueLoading })) })
  expect(f.contentRead).toHaveBeenCalledTimes(2)
  expect(vi.mocked(f.gateway.readText).mock.calls.at(-1)?.[3]).toEqual({ allowLargeFile: true })
  expect(f.service.textSnapshot(view)).toMatchObject({ text: 'local edits', latestSourceText: 'huge source' })
  expect(f.createEditor).toHaveBeenCalledTimes(1)
  fireEvent.click(screen.getByRole('button', { name: en.differences }))
  expect(screen.getByRole('button', { name: en.backToEditor })).toBeTruthy()
})

it('shows the exact source size in the workbench bar using an automatic unit', async () => {
  vi.useFakeTimers()
  const f = fixture('file', { largeFileBytes: 10 * 1024 ** 2, hugeFileBytes: 100 * 1024 ** 2 }, 1536)
  const view = await f.service.open(f.descriptor)
  await act(async () => { render(<ResourceWorkbenchPanel instanceId={view} service={f.service} t={key => en[key]} />) })
  expect(screen.getByTitle(en.fileSize).textContent).toContain('1.5 KiB')
  expect(f.contentRead).not.toHaveBeenCalled()
})

it('uses current file bytes instead of a stale restored size to initialize defaults', async () => {
  const f = fixture('base', { largeFileBytes: 10, hugeFileBytes: 100 })
  const view = await f.service.open({ ...f.descriptor, size: 101 })
  expect(f.service.textSnapshot(view)).toMatchObject({ sizeBytes: 4, sizeTier: 'normal', draftPersistence: true, largeDefaultsApplied: false })
})

it('pauses large-tier draft writes and further polls while an observed source hash is still pending', async () => {
  vi.useFakeTimers()
  const f = fixture('base text', { largeFileBytes: 10, hugeFileBytes: 100 })
  let watch!: (event: import('../src/client/resource.ts').ResourceTextWatchEvent) => void | Promise<void>
  vi.spyOn(f.source, 'watchText').mockImplementation((_ref, listener) => { watch = listener; return () => {} })
  const view = await f.service.open(f.descriptor)
  await f.service.confirmTextLoad(view)
  f.service.editText(view, 'local')
  await Promise.resolve()
  let finish!: (hash: string) => void
  f.hashText.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  const applying = watch({ kind: 'snapshot', snapshot: { text: 'source text', version: 'v2', descriptor: { size: 11 } } })
  expect(f.service.textSnapshot(view)).toMatchObject({ sizeTier: 'large', draftPersistence: false })
  await vi.advanceTimersByTimeAsync(1000)
  f.runtime.flushDrafts()
  expect(f.contentRead).toHaveBeenCalledTimes(1)
  expect(f.storage.setItem).not.toHaveBeenCalled()
  finish('source text')
  await applying
  expect(f.service.textSnapshot(view)).toMatchObject({ text: 'local', latestSourceText: 'source text' })
})

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>(done => { resolve = done })
  return { promise, resolve }
}

it('shows the first stream chunk immediately, coalesces appends, and only enables editing after validated completion', async () => {
  vi.useFakeTimers()
  const middle = deferred(), end = deferred()
  const stream = vi.fn<NonNullable<FilesystemSourceGateway['streamText']>>(async function* () {
    yield { kind: 'start' as const, path: '/file.txt', sizeBytes: 10 }
    yield { kind: 'chunk' as const, text: 'first', bytesRead: 5 }
    await middle.promise
    yield { kind: 'chunk' as const, text: ' la', bytesRead: 8 }
    await end.promise
    yield { kind: 'chunk' as const, text: 'st', bytesRead: 10 }
    yield { kind: 'complete' as const, version: 'v1' as never, sizeBytes: 10 }
  })
  const f = fixture('first last', {}, 10, stream)
  const view = await f.service.open(f.descriptor)
  render(<f.View viewId={view} handlerId={TEXT_RESOURCE_HANDLER_ID} service={f.service} />)
  expect(stream).not.toHaveBeenCalled()
  let loading!: Promise<void>
  await act(async () => { loading = f.service.confirmTextLoad(view); await vi.advanceTimersByTimeAsync(0) })
  expect(f.service.textSnapshot(view)).toMatchObject({ status: 'partial', text: 'first' })
  expect(screen.getByText(en.incompleteFile)).toBeTruthy()
  expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('50')
  expect(f.createEditor).toHaveBeenCalledTimes(1)
  expect(f.createEditor.mock.calls[0]![0]).toMatchObject({ readOnly: true })
  await act(async () => { middle.resolve(); await vi.advanceTimersByTimeAsync(299) })
  expect(f.service.textSnapshot(view)).toMatchObject({ text: 'first' })
  await act(async () => { await vi.advanceTimersByTimeAsync(1) })
  expect(f.service.textSnapshot(view)).toMatchObject({ text: 'first la' })
  expect(f.createEditor.mock.results[0]!.value.appendText).toHaveBeenCalledWith(' la')
  f.runtime.flushDrafts()
  f.service.editText(view, 'cannot edit')
  await f.service.saveText(view)
  await f.service.overwriteSourceText(view)
  expect(f.hashText).not.toHaveBeenCalled()
  expect(f.storage.setItem).not.toHaveBeenCalled()
  expect(f.gateway.patchText).not.toHaveBeenCalled()
  await act(async () => { end.resolve(); await loading })
  expect(f.service.textSnapshot(view)).toMatchObject({ status: 'ready', text: 'first last', baseVersion: 'v1' })
  expect(f.hashText).toHaveBeenCalledTimes(1)
  expect(f.createEditor).toHaveBeenCalledTimes(1)
  expect(f.createEditor.mock.results[0]!.value.setReadOnly).toHaveBeenCalledWith(false)
  expect(f.createEditor.mock.results[0]!.value.appendText).toHaveBeenLastCalledWith('st')
  expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('100')
})

it('keeps stopped or failed partial text read-only, retries from the start and preserves a saved draft until completion', async () => {
  vi.useFakeTimers()
  const end = deferred()
  let attempt = 0
  const stream = vi.fn<NonNullable<FilesystemSourceGateway['streamText']>>(async function* (_session, _path, signal) {
    attempt += 1
    yield { kind: 'start' as const, path: '/file.txt', sizeBytes: 10 }
    yield { kind: 'chunk' as const, text: 'first', bytesRead: 5 }
    if (attempt === 1) { await end.promise; signal.throwIfAborted() }
    if (attempt === 2) throw new Error('connection lost')
    yield { kind: 'chunk' as const, text: ' last', bytesRead: 10 }
    yield { kind: 'complete' as const, version: 'v1' as never, sizeBytes: 10 }
  })
  const f = fixture('first last', {}, 10, stream)
  const draft = JSON.stringify({ format: 1, baseText: 'old', localText: 'saved edits' })
  f.storage.getItem.mockImplementation(key => key.startsWith('dsh-file-viewer:draft:') ? draft : null)
  const view = await f.service.open(f.descriptor)
  render(<f.View viewId={view} handlerId={TEXT_RESOURCE_HANDLER_ID} service={f.service} />)
  let loading!: Promise<void>
  await act(async () => { loading = f.service.confirmTextLoad(view); await vi.advanceTimersByTimeAsync(0) })
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: en.stopLoading })) })
  expect(stream.mock.calls[0]![2].aborted).toBe(true)
  expect(f.service.textSnapshot(view)).toMatchObject({ status: 'partial', text: 'first', operation: 'idle' })
  expect(screen.getByRole('button', { name: en.retryLoading })).toBeTruthy()
  await act(async () => { end.resolve(); await loading; await f.service.refreshText(view) })
  expect(f.service.textSnapshot(view)).toMatchObject({ status: 'partial', text: 'first', failure: { code: 'load-failed' } })
  f.runtime.flushDrafts()
  expect(f.storage.setItem).not.toHaveBeenCalled()
  expect(f.storage.removeItem).not.toHaveBeenCalled()
  await act(async () => { await f.service.refreshText(view) })
  expect(f.service.textSnapshot(view)).toMatchObject({ status: 'ready', text: 'saved edits', latestSourceText: 'first last' })
  expect(f.gateway.patchText).not.toHaveBeenCalled()
})
