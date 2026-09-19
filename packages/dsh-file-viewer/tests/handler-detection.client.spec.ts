import type { Context } from '@deepseek-ai/cordis'
import { afterEach, expect, it, vi } from 'vitest'
import { registerStreamHandlers } from '../src/client/stream-handlers.ts'
import { ResourceWorkbenchRuntime, TEXT_RESOURCE_HANDLER_ID } from '../src/client/workbench.ts'
import { ResourceHandlerId, ResourceSourceId, type ResourceHandler, type ResourceWorkbenchClientService } from '../src/client/resource.ts'
import type { ResourceNavigation, ResourceViewHost } from '../src/client/host.ts'

const disposers: (() => void)[] = []
afterEach(() => { for (const dispose of disposers.splice(0).reverse()) dispose(); vi.unstubAllGlobals() })
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(yes => { resolve = yes })
  return { promise, resolve }
}
function setup() {
  const controller = new AbortController()
  const navigation: ResourceNavigation = {
    signal: controller.signal, current: () => !controller.signal.aborted,
    cancel: reason => { controller.abort(reason) }, claim: () => !controller.signal.aborted,
    commit: (_id, _destination, apply) => { if (controller.signal.aborted) return false; apply?.(); return true },
  }
  const host: ResourceViewHost = {
    beginNavigation: () => navigation, open: vi.fn(async () => 'pane'), update: vi.fn(), pin: vi.fn(),
    group: () => 'pane', resolveTarget: () => 'pane', launch: vi.fn(), close: vi.fn(),
    openWorkspaceFile: vi.fn(), registerRestorer: vi.fn(() => () => {}),
  }
  const runtime = new ResourceWorkbenchRuntime({ host })
  disposers.push(() => runtime.dispose())
  const handlers: ResourceHandler[] = []
  vi.stubGlobal('document', { createElement: () => ({ remove() {} }), head: { appendChild() {} } })
  // Only locale/effect registration is needed to capture the actual built-in handlers.
  registerStreamHandlers({ effect: (effect: () => () => void) => { const dispose = effect(); disposers.push(dispose); return dispose },
    locale: { register: () => () => {}, bind: () => (key: string) => key } } as unknown as Context,
  { registerHandler: (handler: ResourceHandler) => { handlers.push(handler); return runtime.registerHandler(handler) } } as ResourceWorkbenchClientService)
  runtime.registerHandler({ id: TEXT_RESOURCE_HANDLER_ID, label: 'text', supports: c => c.text,
    match: () => ({ role: 'available' }), load: async () => ({ View: () => null }) })
  const readPrefix = vi.fn(async () => new TextEncoder().encode('export const value = 1'))
  const offSource = runtime.registerSource({ id: ResourceSourceId('memory'), readPrefix,
    readText: async () => ({ text: 'export const value = 1' }), getStream: vi.fn() })
  const descriptor = { ref: { sessionId: 'session' as never, sourceId: ResourceSourceId('memory'), resourceId: 'one' },
    name: 'source.ts', kind: 'file', mediaType: 'video/mp2t', size: 600 }
  return { runtime, host, navigation, descriptor, handlers, readPrefix, offSource }
}

it.each([[0, 188], [4, 192]])('recognizes transport packets at offset %i and stride %i without filename exceptions', async (offset, stride) => {
  const f = setup()
  const bytes = new Uint8Array(389)
  for (let index = 0; index < 3; index++) bytes[offset + stride * index] = 0x47
  f.readPrefix.mockResolvedValue(bytes)
  const id = await f.runtime.open(f.descriptor)
  expect(f.runtime.snapshot(id).handlerId).toBe('video')
  expect(f.readPrefix).toHaveBeenCalledWith(f.descriptor.ref, 389, expect.any(AbortSignal))
})

it('falls back to text for source bytes while explicit and resource associations bypass detection', async () => {
  const f = setup()
  const id = await f.runtime.open(f.descriptor)
  expect(f.runtime.snapshot(id).handlerId).toBe('text')
  f.runtime.setAssociation(f.descriptor, ResourceHandlerId('video'), 'resource')
  f.readPrefix.mockClear()
  const associated = await f.runtime.open(f.descriptor)
  expect(f.runtime.snapshot(associated).handlerId).toBe('video')
  expect(f.readPrefix).not.toHaveBeenCalled()
  expect(f.runtime.listOpenWith({ ...f.descriptor, mediaType: 'text/plain' }).find(row => row.id === 'video'))
    .toMatchObject({ recommended: false, resourceAssociated: true })
})

it('propagates detection I/O errors without opening a tab', async () => {
  const f = setup()
  f.readPrefix.mockRejectedValue(new Error('access denied'))
  await expect(f.runtime.open(f.descriptor)).rejects.toThrow('access denied')
  expect(f.host.open).not.toHaveBeenCalled()
})

it('cancels the owned navigation when a source unloads during a pending preview guard', async () => {
  const f = setup()
  const guard = deferred<void>()
  vi.mocked(f.host.open).mockImplementation(async () => {
    await guard.promise
    f.navigation.signal.throwIfAborted()
    return 'pane'
  })
  const opening = f.runtime.open(f.descriptor).catch(error => error)
  await vi.waitFor(() => expect(f.host.open).toHaveBeenCalledOnce())
  f.offSource()
  expect(f.navigation.signal.aborted).toBe(true)
  guard.resolve()
  expect(await opening).toMatchObject({ message: 'resource source unloaded' })
})

it('releases an unmounted restoration and aborts its pending text read', async () => {
  const f = setup()
  const started = deferred<AbortSignal>()
  const sourceId = ResourceSourceId('restoring')
  f.runtime.registerSource({ id: sourceId, readText: async (_ref, signal) => {
    started.resolve(signal)
    await new Promise<void>((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }))
    return { text: 'late' }
  } })
  f.runtime.registerRestorer()
  const restore = vi.mocked(f.host.registerRestorer).mock.calls[0]![1]
  const controller = new AbortController()
  const restored = restore({ sessionId: f.descriptor.ref.sessionId, instanceId: 'restoring-view',
    descriptor: { ...f.descriptor, ref: { ...f.descriptor.ref, sourceId }, format: 1, handlerId: 'text' }, signal: controller.signal })
  const rejected = Promise.resolve(restored).catch(error => error)
  const readSignal = await started.promise
  const reason = new Error('restoration removed')
  controller.abort(reason)
  expect(readSignal.aborted).toBe(true)
  expect(await rejected).toBe(reason)
  expect(() => f.runtime.snapshot('restoring-view')).toThrow()
})

it('keeps restoration cancellable until the sidebar publishes it', async () => {
  const f = setup()
  f.runtime.registerRestorer()
  const restore = vi.mocked(f.host.registerRestorer).mock.calls[0]![1]
  const controller = new AbortController()
  await restore({ sessionId: f.descriptor.ref.sessionId, instanceId: 'prepared-view',
    descriptor: { ...f.descriptor, format: 1, handlerId: 'text' }, signal: controller.signal })
  controller.abort(new Error('stale prepared occurrence'))
  expect(() => f.runtime.snapshot('prepared-view')).toThrow()
})

it('retains a shared document when another prepared restoration is cancelled', async () => {
  const f = setup()
  f.runtime.registerRestorer()
  const restore = vi.mocked(f.host.registerRestorer).mock.calls[0]![1]
  const descriptor = { ...f.descriptor, format: 1, handlerId: 'text' }
  const first = new AbortController()
  const second = new AbortController()
  await restore({ sessionId: f.descriptor.ref.sessionId, instanceId: 'first', descriptor, signal: first.signal })
  await restore({ sessionId: f.descriptor.ref.sessionId, instanceId: 'second', descriptor, signal: second.signal })
  first.abort()
  expect(f.runtime.snapshot('second').handlerId).toBe('text')
  expect(f.runtime.textSnapshot('second')).toMatchObject({ status: 'ready', text: 'export const value = 1' })
})
