// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FileViewerPanel } from '../src/client/FileViewerPanel.tsx'
import { FileViewerService, FileViewerSourceId, type FileViewerWatchEvent } from '../src/client/service.ts'
import { en } from '../src/client/locales.ts'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

const services: FileViewerService[] = []
afterEach(() => {
  cleanup()
  for (const service of services.splice(0)) service.dispose()
  localStorage.clear()
  vi.useRealTimers()
})

function documentService(options: ConstructorParameters<typeof FileViewerService>[0] = {}) {
  const service = new FileViewerService({ hashText: async text => text, ...options })
  services.push(service)
  return service
}

function show(service: FileViewerService, instanceId: string) {
  return render(<FileViewerPanel
    instanceId={instanceId}
    snapshot={id => service.snapshot(id)} subscribe={(id, listener) => service.subscribe(id, listener)}
    edit={(id, text) => service.edit(id, text)} save={id => { void service.save(id) }}
    refresh={id => { void service.refresh(id) }} overwriteSource={id => { void service.overwriteSource(id) }}
    discardLocal={id => service.discardLocal(id)}
    setAutoUpdate={(id, enabled) => service.setAutomation(id, 'autoUpdate', enabled)}
    setAutoSave={(id, enabled) => service.setAutomation(id, 'autoSave', enabled)}
    automationDefaults={() => service.automationDefaults()}
    subscribeAutomationDefaults={listener => service.subscribeAutomationDefaults(listener)}
    setGlobalAutoUpdate={enabled => service.setGlobalAutomation('autoUpdate', enabled)}
    setGlobalAutoSave={enabled => service.setGlobalAutomation('autoSave', enabled)}
    confirm={() => true} t={key => en[key]}
    loadEditor={async () => ({ createFileViewerEditor: () => ({
      setText: () => {}, setOriginalText: () => {}, captureViewState: () => undefined, destroy: () => {},
    }) })}
  />)
}

describe('document operation activity', () => {
  it('publishes cancelled refresh activity before a replacement source snapshot finishes hashing', async () => {
    const replacementHash = deferred<string>()
    const oldRead = deferred<{ text: string }>()
    const initialRead = deferred<{ text: string }>()
    const service = documentService({ hashText: async text => text === 'replacement' ? replacementHash.promise : text })
    const sourceId = FileViewerSourceId('watch-replacement')
    let watch!: (event: FileViewerWatchEvent) => void
    let initial = true
    let signal: AbortSignal | undefined
    service.registerSource({
      id: sourceId,
      load: async (_ref, cancellation) => {
        if (initial) { initial = false; return initialRead.promise }
        signal = cancellation
        return oldRead.promise
      },
      watch: (_ref, listener) => { watch = listener; return () => {} },
    })
    const ref = { sessionId: 's' as never, sourceId, resourceId: 'one' }
    const opening = service.open(ref)
    const id = service.find(ref)!
    expect(service.snapshot(id)).toMatchObject({ status: 'loading', activities: { updating: false, saving: false } })
    initialRead.resolve({ text: 'base' })
    await opening
    show(service, id)
    let refreshing!: Promise<void>
    act(() => { refreshing = service.refresh(id) })
    expect(screen.getByText(en.updating)).toBeTruthy()
    act(() => { watch({ kind: 'snapshot', snapshot: { text: 'replacement' } }) })
    expect(signal?.aborted).toBe(true)
    expect(service.snapshot(id)).toMatchObject({ operation: 'idle', activities: { updating: false, saving: false } })
    expect(screen.queryByText(en.updating)).toBeNull()
    expect(screen.queryByText(en.saving)).toBeNull()
    await act(async () => { replacementHash.resolve('replacement') })
    await act(async () => { oldRead.resolve({ text: 'stale' }); await refreshing })
    expect(service.snapshot(id)).toMatchObject({ latestSourceText: 'replacement', syncStatus: 'source-ahead' })
    expect(screen.queryByText(en.saving)).toBeNull()
  })

  it.each(['save-first', 'update-first'] as const)('presents independent read and save controllers through %s completion', async order => {
    const service = documentService()
    const read = deferred<{ text: string }>()
    const write = deferred<Record<string, never>>()
    let initial = true
    let readSignal: AbortSignal | undefined
    const sourceId = FileViewerSourceId('overlap')
    service.registerSource({
      id: sourceId, supportsConditionalSave: true,
      load: async (_ref, signal) => {
        if (initial) { initial = false; return { text: 'base' } }
        readSignal = signal
        return read.promise
      },
      save: async () => write.promise,
    })
    const id = await service.open({ sessionId: 's' as never, sourceId, resourceId: 'one' })
    show(service, id)
    await act(async () => { service.edit(id, 'local') })
    let saving!: Promise<void>
    let updating!: Promise<void>
    act(() => { saving = service.save(id); updating = service.refresh(id) })
    expect(service.snapshot(id).activities).toEqual({ updating: true, saving: true })
    expect(service.snapshot(id).operation).toBe('saving')
    expect(screen.getByText(en.updating)).toBeTruthy()
    expect(screen.getByText(en.saving)).toBeTruthy()
    expect(screen.getByText(en['local-ahead'])).toBeTruthy()
    expect(screen.queryByRole('button', { name: en.save })).toBeNull()
    if (order === 'update-first') {
      await act(async () => { read.resolve({ text: 'base' }); await updating })
      expect(service.snapshot(id).activities).toEqual({ updating: false, saving: true })
      expect(screen.queryByText(en.updating)).toBeNull()
      expect(screen.getByText(en.saving)).toBeTruthy()
    }
    await act(async () => { write.resolve({}); await saving })
    expect(service.snapshot(id).activities).toEqual({ updating: false, saving: false })
    expect(service.snapshot(id).operation).toBe('idle')
    expect(screen.getByText(en.synced)).toBeTruthy()
    expect(screen.queryByText(en.saving)).toBeNull()
    if (order === 'save-first') {
      expect(readSignal?.aborted).toBe(true)
      await act(async () => { read.resolve({ text: 'stale' }); await updating })
      expect(service.snapshot(id)).toMatchObject({ text: 'local', syncStatus: 'synced' })
    }
  })

  it('retains failure text during an actual retry and stops activity when it fails', async () => {
    const service = documentService()
    const sourceId = FileViewerSourceId('retry')
    let write = deferred<Record<string, never>>()
    service.registerSource({ id: sourceId, load: async () => ({ text: 'base' }), supportsConditionalSave: true, save: async () => write.promise })
    const id = await service.open({ sessionId: 's' as never, sourceId, resourceId: 'one' })
    show(service, id)
    await act(async () => { service.edit(id, 'local') })
    let saving!: Promise<void>
    act(() => { saving = service.save(id) })
    await act(async () => { write.reject(new Error('offline')); await saving })
    expect(screen.getByText(en.saveFailed)).toBeTruthy()
    expect(screen.queryByText(en.saving)).toBeNull()
    write = deferred<Record<string, never>>()
    act(() => { saving = service.save(id) })
    expect(screen.getByText(en.saveFailed)).toBeTruthy()
    expect(screen.getByText(en.saving)).toBeTruthy()
    await act(async () => { write.resolve({}); await saving })
    expect(screen.queryByText(en.saveFailed)).toBeNull()
    expect(screen.queryByText(en.saving)).toBeNull()
  })

  it.each(['hash-failure', 'source-conflict'] as const)('clears saving after preparation ends with %s', async outcome => {
    const editedHash = deferred<string>()
    const saveHash = deferred<string>()
    let localHashes = 0
    const service = documentService({ hashText: async text => text === 'local'
      ? (++localHashes === 1 ? editedHash.promise : saveHash.promise) : text })
    const sourceId = FileViewerSourceId('preparation')
    let watch!: (event: FileViewerWatchEvent) => void
    const publish = vi.fn(async () => ({}))
    service.registerSource({
      id: sourceId, load: async () => ({ text: 'base' }), supportsConditionalSave: true, save: publish,
      watch: (_ref, listener) => { watch = listener; return () => {} },
    })
    const id = await service.open({ sessionId: 's' as never, sourceId, resourceId: 'one' })
    show(service, id)
    act(() => { service.edit(id, 'local') })
    let saving!: Promise<void>
    act(() => { saving = service.save(id) })
    expect(service.snapshot(id).activities.saving).toBe(true)
    if (outcome === 'source-conflict') {
      await act(async () => { watch({ kind: 'snapshot', snapshot: { text: 'remote' } }) })
      await act(async () => { saveHash.resolve('local'); await saving })
    } else {
      await act(async () => { saveHash.reject(new Error('hash unavailable')); await saving })
    }
    expect(publish).not.toHaveBeenCalled()
    expect(service.snapshot(id)).toMatchObject({ operation: 'idle', activities: { updating: false, saving: false } })
    expect(screen.queryByText(en.saving)).toBeNull()
    expect(screen.getByText(outcome === 'source-conflict' ? en.saveConflict : en.hashFailed)).toBeTruthy()
    await act(async () => { editedHash.resolve('local') })
    fireEvent.focus(screen.getByTitle(en.synchronization))
    expect(screen.getByRole('button', { name: en.update }).hasAttribute('disabled')).toBe(false)
  })
})
