import { SessionId } from '@deepseek-ai/dsh-session/types'
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { FileViewerService, FileViewerSourceId } from '../src/client/service.ts'
import { ResourceMissingError, ResourceSourceId, type ResourceDescriptor, type ResourceBytesWatchEvent } from '../src/client/resource.ts'
import { FilesystemResourceSource, type FilesystemSourceGateway } from '../src/client/filesystem-source.ts'
import { ResourceWorkbenchRuntime, TEXT_RESOURCE_HANDLER_ID, IMAGE_RESOURCE_HANDLER_ID, type ResourceViewHost } from '../src/client/workbench.ts'

const sessionId = SessionId('retention')
const sourceId = ResourceSourceId('filesystem')
const descriptor: ResourceDescriptor = { ref: { sessionId, sourceId, resourceId: '/file.txt' }, name: 'file.txt' }
const signal = () => new AbortController().signal
const missing = { code: 'user-files/not-found', message: 'file.txt was not found' }

afterEach(() => { vi.useRealTimers() })

function storage() {
  const values = new Map<string, string>()
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: vi.fn((key: string, value: string) => { values.set(key, value) }),
    removeItem: vi.fn((key: string) => { values.delete(key) }),
  }
}

function gateway(): FilesystemSourceGateway {
  return {
    readText: vi.fn(async (_id, path) => ({ path, text: 'base', version: 'v1' })),
    readBytes: vi.fn(async (_id, path) => ({ path, dataBase64: 'AP8=', version: 'v1' })),
    saveText: vi.fn(async () => ({ version: 'v2' })),
    saveBytes: vi.fn(async () => ({ version: 'v2' })),
  }
}

function bench(options: { storage?: ReturnType<typeof storage> } = {}) {
  let restore: Parameters<ResourceViewHost['registerRestorer']>[1] | undefined
  const host: ResourceViewHost = {
    open: vi.fn(async () => 'group'), activate: vi.fn(), update: vi.fn(), pin: vi.fn(),
    group: () => 'group', resolveTarget: () => 'group', launch: async () => {}, close: async () => {},
    registerRestorer: (_id, callback) => { restore = callback; return () => { restore = undefined } },
  }
  const runtime = new ResourceWorkbenchRuntime({ host, hashText: async text => text, ...options })
  onTestFinished(() => { runtime.dispose() })
  for (const id of [TEXT_RESOURCE_HANDLER_ID, IMAGE_RESOURCE_HANDLER_ID]) {
    runtime.registerHandler({ id, label: id, match: () => ({ role: 'available' }), load: async () => ({ View: () => null }) })
  }
  return { host, runtime, restore: () => restore! }
}

function markings(host: ResourceViewHost) {
  return vi.mocked(host.update).mock.calls.filter(call => 'resourceMissing' in call[2]).map(call => call[2].resourceMissing)
}

describe('resource absence and retained text', () => {
  it.each(['readText', 'readBytes'] as const)('maps only confirmed absence from %s and recovers a same-revision watch', async method => {
    vi.useFakeTimers()
    const remote = gateway()
    const source = new FilesystemResourceSource(remote, 10)
    const listener = vi.fn()
    await source[method](descriptor.ref, signal())
    const dispose = method === 'readText' ? source.watchText(descriptor.ref, listener) : source.watchBytes(descriptor.ref, listener)
    onTestFinished(dispose)
    vi.mocked(remote[method]).mockRejectedValueOnce(missing)
    await vi.advanceTimersByTimeAsync(10)
    expect(listener).toHaveBeenLastCalledWith({ kind: 'missing', error: expect.any(ResourceMissingError) })
    await vi.advanceTimersByTimeAsync(10)
    expect(listener).toHaveBeenLastCalledWith(expect.objectContaining({ kind: 'snapshot', snapshot: expect.objectContaining({ version: 'v1' }) }))
    const denied = { code: 'user-files/denied', message: 'not permitted' }
    vi.mocked(remote[method]).mockRejectedValueOnce(denied)
    await expect(source[method](descriptor.ref, signal())).rejects.toBe(denied)
    vi.mocked(remote[method]).mockRejectedValueOnce(missing)
    await expect(source[method](descriptor.ref, signal())).rejects.toMatchObject({ resourceMissing: true, message: missing.message })
    dispose()
    const calls = vi.mocked(remote[method]).mock.calls.length
    await vi.advanceTimersByTimeAsync(100)
    expect(vi.mocked(remote[method]).mock.calls).toHaveLength(calls)
  })

  it('retains edited text and missing marking through unrelated failures, then recovers', async () => {
    vi.useFakeTimers()
    const { runtime, host } = bench()
    const remote = gateway()
    runtime.registerSource(new FilesystemResourceSource(remote, 10))
    const view = await runtime.open(descriptor)
    runtime.editText(view, 'unsaved')
    vi.mocked(remote.readText).mockRejectedValueOnce(missing)
    await vi.advanceTimersByTimeAsync(10)
    expect(runtime.textSnapshot(view)).toMatchObject({ text: 'unsaved', resourceMissing: true, automationPaused: true })
    expect(markings(host)).toEqual([true])
    vi.mocked(remote.readText).mockRejectedValueOnce(new Error('offline'))
    await runtime.refreshText(view)
    expect(markings(host)).toEqual([true])
    await runtime.saveText(view)
    expect(markings(host)).toEqual([true])
    expect(remote.saveText).not.toHaveBeenCalled()
    await runtime.refreshText(view)
    expect(runtime.textSnapshot(view)).toMatchObject({ text: 'unsaved', resourceMissing: false, automationPaused: false })
    expect(markings(host)).toEqual([true, false])
  })

  it('publishes initial missing text only after restoration commits and leaves source unload distinct', async () => {
    const { runtime, host, restore } = bench()
    const remote = gateway()
    vi.mocked(remote.readText).mockRejectedValue(missing)
    const offSource = runtime.registerSource(new FilesystemResourceSource(remote, 10))
    runtime.registerRestorer()
    const result = await restore()({ sessionId, instanceId: 'restored', descriptor: { format: 1, ...descriptor, handlerId: TEXT_RESOURCE_HANDLER_ID } })
    expect(host.update).not.toHaveBeenCalled()
    result?.onRestored?.()
    expect(markings(host)).toEqual([true])
    expect(runtime.textSnapshot('restored')).toMatchObject({ status: 'failed', resourceMissing: true })
    offSource()
    expect(runtime.textSnapshot('restored')).toMatchObject({ failure: { code: 'source-unavailable' }, resourceMissing: true })
    expect(markings(host)).toEqual([true])
  })

  it('restores a saved draft when the source is missing without inventing a current revision', async () => {
    const browser = storage()
    const key = `dsh-file-viewer:draft:${JSON.stringify([sessionId, sourceId, descriptor.ref.resourceId])}`
    browser.values.set(key, JSON.stringify({ format: 1, baseText: 'base', localText: 'draft', automation: { autoUpdate: true, autoSave: true } }))
    const { runtime, host } = bench({ storage: browser })
    const remote = gateway()
    vi.mocked(remote.readText).mockRejectedValueOnce(missing)
    runtime.registerSource(new FilesystemResourceSource(remote, 10))
    const view = await runtime.open(descriptor)
    const snapshot = runtime.textSnapshot(view)
    expect(runtime.snapshot(view).descriptor.name).toBe(descriptor.name)
    expect(snapshot).toMatchObject({ status: 'ready', baseText: 'base', text: 'draft', resourceMissing: true, automationPaused: true, syncStatus: 'unknown' })
    expect(snapshot).not.toHaveProperty('baseVersion')
    expect(snapshot).not.toHaveProperty('latestSourceText')
    expect(snapshot).not.toHaveProperty('latestSourceVersion')
    expect(markings(host)).toEqual([true])
    expect(remote.saveText).not.toHaveBeenCalled()
    await runtime.refreshText(view)
    expect(runtime.textSnapshot(view)).toMatchObject({ text: 'draft', baseVersion: 'v1', resourceMissing: false })
    expect(markings(host)).toEqual([true, false])
  })

  it('marks byte reads and watches without changing renderer availability and ignores disposed reads', async () => {
    vi.useFakeTimers()
    const { runtime, host } = bench()
    const remote = gateway()
    runtime.registerSource(new FilesystemResourceSource(remote, 10))
    const view = await runtime.open(descriptor, { handlerId: IMAGE_RESOURCE_HANDLER_ID })
    await runtime.loadHandler(view)
    vi.mocked(remote.readBytes).mockRejectedValueOnce(missing)
    await expect(runtime.readBytes(view, signal())).rejects.toBeInstanceOf(ResourceMissingError)
    expect(markings(host)).toEqual([true])
    expect(runtime.snapshot(view).handlerStatus).toBe('ready')
    await runtime.readBytes(view, signal())
    expect(markings(host)).toEqual([true, false])
    const dispose = runtime.watchBytes(view, () => {})
    vi.mocked(remote.readBytes).mockRejectedValueOnce(missing)
    await vi.advanceTimersByTimeAsync(10)
    expect(markings(host)).toEqual([true, false, true])
    await vi.advanceTimersByTimeAsync(10)
    expect(markings(host)).toEqual([true, false, true, false])
    dispose()
    let reject!: (error: unknown) => void
    vi.mocked(remote.readBytes).mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail }))
    const pending = runtime.readBytes(view, signal())
    runtime.dispose()
    reject(missing)
    await expect(pending).rejects.toBeInstanceOf(ResourceMissingError)
    expect(markings(host)).toEqual([true, false, true, false])
  })

  it('ignores a byte watch callback after its subscription is disposed', async () => {
    const { runtime, host } = bench()
    let notify!: (event: ResourceBytesWatchEvent) => void
    runtime.registerSource({
      id: sourceId,
      readBytes: async () => ({ bytes: new Uint8Array() }),
      watchBytes: (_ref, listener) => { notify = listener; return () => {} },
    })
    const view = await runtime.open(descriptor, { handlerId: IMAGE_RESOURCE_HANDLER_ID })
    const listener = vi.fn()
    const dispose = runtime.watchBytes(view, listener)
    dispose()
    notify({ kind: 'missing', error: new ResourceMissingError() })
    expect(listener).not.toHaveBeenCalled()
    expect(markings(host)).toEqual([])
  })

  it('hashes every edit immediately, retains long drafts, and retries refused storage writes', async () => {
    const browser = storage()
    const hashText = vi.fn(async (text: string) => text)
    const service = new FileViewerService({ storage: browser, hashText, largeFileBytes: 8, hugeFileBytes: 8192 })
    onTestFinished(() => { service.dispose() })
    const id = FileViewerSourceId('memory')
    service.registerSource({ id, load: async () => ({ text: 'base', sizeBytes: 4 }) })
    const view = await service.open({ sessionId, sourceId: id, resourceId: 'one' })
    service.edit(view, '12345678')
    expect(service.snapshot(view)).toMatchObject({ sizeTier: 'normal' })
    service.edit(view, 'x'.repeat(4096))
    expect(service.snapshot(view)).toMatchObject({ sizeTier: 'normal', sizeBytes: 4 })
    expect(hashText.mock.calls.map(call => call[0])).toEqual(['base', '12345678', 'x'.repeat(4096)])
    browser.setItem.mockImplementationOnce(() => { throw new Error('quota') })
    service.flushDrafts()
    service.flushDrafts()
    expect(browser.setItem).toHaveBeenCalledTimes(2)
    service.flushDrafts()
    expect(browser.setItem).toHaveBeenCalledTimes(2)
    expect(JSON.parse([...browser.values.values()][0]!)).toMatchObject({ localText: 'x'.repeat(4096) })
    service.setAutomation(view, 'autoSave', true)
    service.flushDrafts()
    expect(browser.setItem).toHaveBeenCalledTimes(3)
    expect(browser.removeItem).not.toHaveBeenCalled()
  })
})
