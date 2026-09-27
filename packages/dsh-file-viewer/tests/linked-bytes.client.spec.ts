import { afterEach, expect, it, vi } from 'vitest'
import type { ResourceNavigation, ResourceViewHost } from '../src/client/host.ts'
import { ResourceHandlerId, ResourceSourceId, type ResourceDescriptor, type ResourceLoadedBytes } from '../src/client/resource.ts'
import { ResourceWorkbenchRuntime } from '../src/client/workbench.ts'

const disposers: (() => void)[] = []
afterEach(() => { for (const dispose of disposers.splice(0).reverse()) dispose(); vi.unstubAllGlobals() })

function makeRuntime(): ResourceWorkbenchRuntime {
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
  return runtime
}

function fileDescriptor(resourceId: string, name: string, mediaType?: string): ResourceDescriptor {
  return { ref: { sessionId: 'session' as never, sourceId: ResourceSourceId('memory'), resourceId }, name, kind: 'file',
    ...(mediaType === undefined ? {} : { mediaType }) }
}

it('resolves and reads a document-relative link without opening another view', async () => {
  const runtime = makeRuntime()
  const bytes = new Uint8Array([137, 80, 78, 71])
  const resolved = fileDescriptor('/docs/images/x.png', 'x.png', 'image/png')
  const resolveLink = vi.fn(async () => ({ descriptor: resolved, workspacePath: resolved.ref.resourceId }))
  const readBytes = vi.fn(async (): Promise<ResourceLoadedBytes> => ({ bytes }))
  runtime.registerSource({ id: ResourceSourceId('memory'), resolveLink, readBytes })
  runtime.registerHandler({ id: ResourceHandlerId('bytes'), label: 'bytes', supports: capabilities => capabilities.bytes,
    match: () => ({ role: 'default' }), load: async () => ({ View: () => null }) })
  const document = fileDescriptor('/docs/题.md', '题.md', 'text/markdown')
  const viewId = await runtime.open(document)
  const loaded = await runtime.readLinkedBytes(viewId, 'images/x.png', new AbortController().signal)
  expect(resolveLink).toHaveBeenCalledWith(document.ref, 'images/x.png', expect.any(AbortSignal))
  expect(readBytes).toHaveBeenCalledWith(resolved.ref, expect.any(AbortSignal))
  expect(loaded.bytes).toEqual(bytes)
  expect(loaded.descriptor).toMatchObject({ name: 'x.png', kind: 'file', mediaType: 'image/png' })
})

it('reports linked byte reading as unavailable for a source without those capabilities', async () => {
  const runtime = makeRuntime()
  runtime.registerSource({ id: ResourceSourceId('memory'), readText: async () => ({ text: '# 题' }) })
  runtime.registerHandler({ id: ResourceHandlerId('textish'), label: 'textish', supports: capabilities => capabilities.text,
    match: () => ({ role: 'default' }), load: async () => ({ View: () => null }) })
  const viewId = await runtime.open(fileDescriptor('/docs/题.md', '题.md', 'text/markdown'))
  await expect(runtime.readLinkedBytes(viewId, 'images/x.png', new AbortController().signal))
    .rejects.toThrow('resource-workbench: linked byte reading is unavailable')
})
