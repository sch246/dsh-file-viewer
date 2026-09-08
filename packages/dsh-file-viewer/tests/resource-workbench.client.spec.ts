import { SessionId } from '@deepseek-ai/dsh-session/types'
import { describe, expect, it, vi } from 'vitest'
import {
  IMAGE_RESOURCE_HANDLER_ID,
  RESOURCE_WORKBENCH_VIEW_ID,
  ResourceWorkbenchRuntime,
  TEXT_RESOURCE_HANDLER_ID,
  type ResourceViewHost,
} from '../src/client/workbench.ts'
import {
  ResourceHandlerId,
  ResourceSourceId,
  type ResourceDescriptor,
  type ResourceHandler,
  type ResourceSource,
} from '../src/client/resource.ts'

interface Hosted {
  readonly sessionId: SessionId
  readonly input: Parameters<ResourceViewHost['open']>[1]
  groupId: string
  revision: number
  closeGeneration: number
}

function hostFixture(): ResourceViewHost & {
  hosted: Map<string, Hosted>
  pinned: string[]
  restorers: Map<string, Parameters<ResourceViewHost['registerRestorer']>[1]>
} {
  const hosted = new Map<string, Hosted>()
  const pinned: string[] = []
  const restorers = new Map<string, Parameters<ResourceViewHost['registerRestorer']>[1]>()
  return {
    hosted,
    pinned,
    restorers,
    open: vi.fn(async (sessionId, input, options) => {
      const groupId = options?.target !== undefined && 'groupId' in options.target
        ? options.target.groupId
        : options?.target !== undefined ? 'right-of-tree' : 'active'
      hosted.set(input.id, { sessionId, input, groupId, revision: 0, closeGeneration: 0 })
      return groupId
    }),
    activate: vi.fn(),
    update: vi.fn((_sessionId, viewId) => {
      const row = hosted.get(viewId)
      if (row !== undefined) row.revision += 1
    }),
    pin: vi.fn((_sessionId, viewId) => {
      pinned.push(viewId)
      const row = hosted.get(viewId)
      if (row !== undefined) row.revision += 1
    }),
    group: (_sessionId, viewId) => hosted.get(viewId)?.groupId ?? 'active',
    resolveTarget: (_sessionId, target) => 'groupId' in target ? target.groupId : 'right-of-tree',
    launch: vi.fn(async () => {}),
    registerRestorer: vi.fn((viewId, restore) => {
      restorers.set(viewId, restore)
      return () => { restorers.delete(viewId) }
    }),
    close: vi.fn(async (_sessionId, viewId) => {
      const row = hosted.get(viewId)
      if (row === undefined) return
      const revision = row.revision
      const closeGeneration = ++row.closeGeneration
      if (row?.input.onClose !== undefined && !await row.input.onClose()) return
      if (hosted.get(viewId) !== row || row.revision !== revision || row.closeGeneration !== closeGeneration) return
      hosted.delete(viewId)
      row.input.onClosed?.()
    }),
  }
}

function handler(id: ReturnType<typeof ResourceHandlerId>, role: 'default' | 'available'): ResourceHandler {
  return {
    id,
    label: id,
    match: () => ({ role }),
    load: async () => ({ View: () => null }),
  }
}

function descriptor(sourceId: ReturnType<typeof ResourceSourceId>, mediaType = 'text/plain'): ResourceDescriptor {
  return {
    ref: { sessionId: SessionId('session'), sourceId, resourceId: 'one' },
    name: mediaType === 'image/svg+xml' ? 'one.svg' : 'one.txt',
    mediaType,
  }
}

describe('ResourceWorkbenchRuntime', () => {
  it('previews shared unsaved Markdown without rereading, discarding editor state or pausing automation', async () => {
    const host = hostFixture()
    const confirmHandlerSwitch = vi.fn(() => false)
    const runtime = new ResourceWorkbenchRuntime({ host, hashText: async text => text, confirmHandlerSwitch })
    runtime.registerHandler(handler(TEXT_RESOURCE_HANDLER_ID, 'default'))
    const markdown: ResourceHandler = {
      ...handler(ResourceHandlerId('markdown'), 'available'),
      document: 'text',
      match: resource => resource.mediaType === 'text/markdown' ? { role: 'available' } : false,
    }
    runtime.registerHandler(markdown)
    const sourceId = ResourceSourceId('markdown')
    const readText = vi.fn(async () => ({ text: '# Source' }))
    runtime.registerSource({ id: sourceId, readText })
    const resource = { ...descriptor(sourceId, 'text/markdown'), name: 'README.md' }
    const viewId = await runtime.open(resource)
    expect(runtime.snapshot(viewId).handlerId).toBe(TEXT_RESOURCE_HANDLER_ID)
    expect(runtime.listOpenWith(resource)).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: markdown.id, role: 'available' }),
    ]))
    expect(runtime.listOpenWith(descriptor(sourceId)).some(choice => choice.id === markdown.id)).toBe(false)
    const documentId = runtime.textDocumentId(viewId)
    const editorState = { undo: ['# Source'], selection: 4 }
    runtime.setViewState(viewId, TEXT_RESOURCE_HANDLER_ID, editorState)
    runtime.editText(viewId, '# Unsaved Local')
    await Promise.resolve()
    const automation = runtime.textSnapshot(viewId).automation

    await runtime.switchHandler(viewId, markdown.id)

    expect(runtime.textDocumentId(viewId)).toBe(documentId)
    expect(runtime.textSnapshot(viewId)).toMatchObject({ text: '# Unsaved Local', automation, automationPaused: false })
    await runtime.switchHandler(viewId, TEXT_RESOURCE_HANDLER_ID)
    expect(runtime.getViewState(viewId, TEXT_RESOURCE_HANDLER_ID)).toBe(editorState)
    const second = await runtime.open(resource, { handlerId: markdown.id, sideBySide: true })
    expect(runtime.textDocumentId(second)).toBe(documentId)
    await runtime.close(viewId)
    expect(runtime.textSnapshot(second)).toMatchObject({ automationPaused: false })
    await runtime.switchHandler(second, TEXT_RESOURCE_HANDLER_ID)
    expect(runtime.textSnapshot(second)).toMatchObject({ text: '# Unsaved Local', automationPaused: false })
    expect(readText).toHaveBeenCalledOnce()
    expect(confirmHandlerSwitch).not.toHaveBeenCalled()
    runtime.dispose()
  })

  it('shares exact text documents across independent views and pins first edit-back', async () => {
    const host = hostFixture()
    const runtime = new ResourceWorkbenchRuntime({ host, hashText: async text => text })
    runtime.registerHandler(handler(TEXT_RESOURCE_HANDLER_ID, 'default'))
    const sourceId = ResourceSourceId('memory')
    runtime.registerSource({ id: sourceId, readText: async () => ({ text: 'base' }) })
    const resource = descriptor(sourceId)

    const first = await runtime.open(resource, { target: { groupId: 'left' } })
    const second = await runtime.open(resource, { target: { groupId: 'right' }, sideBySide: true })

    expect(first).not.toBe(second)
    expect(runtime.textDocumentId(first)).toBe(runtime.textDocumentId(second))
    runtime.editText(first, 'changed')
    runtime.editText(first, 'base')
    await Promise.resolve()
    expect(runtime.textSnapshot(second)).toMatchObject({ text: 'base' })
    expect(host.pinned).toEqual([first])

    await runtime.close(first)
    expect(host.hosted.has(first)).toBe(false)
    expect(runtime.textSnapshot(second).status).toBe('ready')
    const documentId = runtime.textDocumentId(second)!
    await runtime.close(second)
    expect(() => runtime.documents.snapshot(documentId)).toThrow('unknown instance')
    runtime.dispose()
  })

  it('retains a shared document but pauses it when only a non-text view remains', async () => {
    const host = hostFixture()
    const runtime = new ResourceWorkbenchRuntime({ host, hashText: async text => text })
    runtime.registerHandler(handler(TEXT_RESOURCE_HANDLER_ID, 'default'))
    runtime.registerHandler(handler(IMAGE_RESOURCE_HANDLER_ID, 'available'))
    const sourceId = ResourceSourceId('shared-hidden')
    runtime.registerSource({
      id: sourceId,
      readText: async () => ({ text: 'base' }),
      readBytes: async () => ({ bytes: new Uint8Array([1]) }),
    })
    const resource = descriptor(sourceId)
    const textView = await runtime.open(resource, { target: { groupId: 'left' } })
    const imageView = await runtime.open(resource, { target: { groupId: 'right' }, sideBySide: true })
    const documentId = runtime.textDocumentId(textView)!
    await runtime.switchHandler(imageView, IMAGE_RESOURCE_HANDLER_ID)

    await runtime.close(textView)

    expect(runtime.textDocumentId(imageView)).toBe(documentId)
    expect(runtime.textSnapshot(imageView)).toMatchObject({ status: 'ready', automationPaused: true })
    await runtime.close(imageView)
    expect(() => runtime.documents.snapshot(documentId)).toThrow('unknown instance')
    runtime.dispose()
  })

  it('does not deduplicate into the wrong group when an explicit relative target is unresolved', async () => {
    const host = hostFixture()
    const runtime = new ResourceWorkbenchRuntime({ host, hashText: async text => text })
    runtime.registerHandler(handler(TEXT_RESOURCE_HANDLER_ID, 'default'))
    const sourceId = ResourceSourceId('targeting')
    runtime.registerSource({ id: sourceId, readText: async () => ({ text: 'base' }) })
    const resource = descriptor(sourceId)
    const existing = await runtime.open(resource, { target: { groupId: 'tree-group' } })
    host.resolveTarget = vi.fn(() => undefined)

    const opened = await runtime.open(resource, {
      target: { fromInstanceId: 'files', direction: 'right' },
      preview: true,
    })

    expect(opened).not.toBe(existing)
    expect(host.open).toHaveBeenLastCalledWith(
      resource.ref.sessionId,
      expect.objectContaining({ id: opened }),
      expect.objectContaining({ target: { fromInstanceId: 'files', direction: 'right' } }),
    )
    runtime.dispose()
  })

  it('reobserves a replacement source once per shared document without losing local text', async () => {
    const host = hostFixture()
    const runtime = new ResourceWorkbenchRuntime({ host, hashText: async text => text })
    runtime.registerHandler(handler(TEXT_RESOURCE_HANDLER_ID, 'default'))
    const sourceId = ResourceSourceId('replacement')
    const unload = runtime.registerSource({ id: sourceId, readText: async () => ({ text: 'base', version: 1 }) })
    const resource = descriptor(sourceId)
    const first = await runtime.open(resource, { target: { groupId: 'left' } })
    await runtime.open(resource, { target: { groupId: 'right' }, sideBySide: true })
    runtime.editText(first, 'local')
    await Promise.resolve()
    unload()
    const replacementRead = vi.fn(async () => ({ text: 'remote', version: 2 }))

    runtime.registerSource({ id: sourceId, readText: replacementRead })
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()

    expect(replacementRead).toHaveBeenCalledOnce()
    expect(runtime.textSnapshot(first)).toMatchObject({
      status: 'ready',
      text: 'local',
      latestSourceText: 'remote',
      syncStatus: 'diverged',
    })
    runtime.dispose()
  })

  it('retains caller metadata until a text source explicitly replaces it', async () => {
    const host = hostFixture()
    const runtime = new ResourceWorkbenchRuntime({ host, hashText: async text => text })
    runtime.registerHandler(handler(TEXT_RESOURCE_HANDLER_ID, 'default'))
    const sourceId = ResourceSourceId('metadata')
    let publish: Parameters<NonNullable<ResourceSource['watchText']>>[1] | undefined
    runtime.registerSource({
      id: sourceId,
      readText: async () => ({ text: 'Read-only projection' }),
      watchText: (_ref, listener) => {
        publish = listener
        return () => {}
      },
    })
    const viewId = await runtime.open({
      ref: { sessionId: SessionId('session'), sourceId, resourceId: 'projection' },
      name: 'Readonly memory',
      mediaType: 'text/plain',
    })

    expect(runtime.snapshot(viewId).descriptor.name).toBe('Readonly memory')
    expect(runtime.textSnapshot(viewId)).toMatchObject({ title: 'Readonly memory' })
    expect(host.update).not.toHaveBeenCalled()
    expect(publish).toBeDefined()

    publish!({ kind: 'snapshot', snapshot: { text: 'Updated projection' } })
    await vi.waitFor(() => {
      expect(runtime.textSnapshot(viewId)).toMatchObject({
        title: 'Readonly memory',
        latestSourceText: 'Updated projection',
      })
    })
    publish!({
      kind: 'snapshot',
      snapshot: { text: 'Renamed projection', descriptor: { name: 'Explicit source name' } },
    })
    await vi.waitFor(() => {
      expect(runtime.snapshot(viewId).descriptor.name).toBe('Explicit source name')
      expect(runtime.textSnapshot(viewId)).toMatchObject({ title: 'Explicit source name' })
    })
    expect(host.update).toHaveBeenLastCalledWith(
      SessionId('session'),
      viewId,
      expect.objectContaining({ title: 'Explicit source name' }),
    )
    runtime.dispose()
  })

  it('defaults SVG to bytes, offers text open-with, and never decodes image bytes', async () => {
    const host = hostFixture()
    const confirmHandlerSwitch = vi.fn(() => false)
    const runtime = new ResourceWorkbenchRuntime({ host, confirmHandlerSwitch })
    runtime.registerHandler({
      ...handler(IMAGE_RESOURCE_HANDLER_ID, 'default'),
      match: (value, capabilities) => value.mediaType === 'image/svg+xml' && capabilities.bytes
        ? { role: 'default' }
        : false,
    })
    runtime.registerHandler({
      ...handler(TEXT_RESOURCE_HANDLER_ID, 'available'),
      match: (_value, capabilities) => capabilities.text ? { role: 'available' } : false,
    })
    const sourceId = ResourceSourceId('svg-memory')
    const readText = vi.fn(async () => ({ text: '<svg />' }))
    runtime.registerSource({
      id: sourceId,
      readText,
      readBytes: async () => ({
        bytes: new TextEncoder().encode('<svg />'),
        version: 1,
        descriptor: {
          location: { label: 'Memory', selectorId: 'memory-resources', segments: [{ label: 'one.svg' }] },
        },
      }),
    })

    const viewId = await runtime.open(descriptor(sourceId, 'image/svg+xml'))
    expect(runtime.snapshot(viewId).handlerId).toBe(IMAGE_RESOURCE_HANDLER_ID)
    expect(runtime.snapshot(viewId).openWith.map(row => row.id)).toEqual([
      IMAGE_RESOURCE_HANDLER_ID,
      TEXT_RESOURCE_HANDLER_ID,
    ])
    const loaded = await runtime.readBytes(viewId, new AbortController().signal)
    expect(loaded.bytes).toBeInstanceOf(Uint8Array)
    expect(runtime.snapshot(viewId).descriptor.location).toMatchObject({
      label: 'Memory',
      selectorId: 'memory-resources',
    })
    expect(host.update).toHaveBeenCalledWith(SessionId('session'), viewId, expect.objectContaining({
      restoreDescriptor: expect.objectContaining({ location: expect.objectContaining({ label: 'Memory' }) }),
    }))
    expect(readText).not.toHaveBeenCalled()

    await runtime.switchHandler(viewId, TEXT_RESOURCE_HANDLER_ID)
    expect(readText).toHaveBeenCalledOnce()
    expect(host.update).toHaveBeenCalledWith(SessionId('session'), viewId, expect.objectContaining({
      restoreDescriptor: expect.objectContaining({ handlerId: TEXT_RESOURCE_HANDLER_ID }),
    }))
    runtime.editText(viewId, '<svg>local</svg>')
    await Promise.resolve()
    await runtime.switchHandler(viewId, IMAGE_RESOURCE_HANDLER_ID)
    expect(confirmHandlerSwitch).toHaveBeenCalledOnce()
    expect(runtime.snapshot(viewId).handlerId).toBe(TEXT_RESOURCE_HANDLER_ID)
    expect(runtime.textSnapshot(viewId)).toMatchObject({ text: '<svg>local</svg>' })
    confirmHandlerSwitch.mockReturnValue(true)
    await runtime.switchHandler(viewId, IMAGE_RESOURCE_HANDLER_ID)
    expect(runtime.snapshot(viewId).handlerId).toBe(IMAGE_RESOURCE_HANDLER_ID)
    expect(runtime.textSnapshot(viewId)).toMatchObject({
      text: '<svg>local</svg>',
      automationPaused: true,
    })
    runtime.discardLocalText(viewId)
    expect(runtime.textSnapshot(viewId)).toMatchObject({ text: '<svg />', automationPaused: true })
    runtime.dispose()
  })

  it('exposes equal defaults as a choice independent of registration order', async () => {
    const host = hostFixture()
    const runtime = new ResourceWorkbenchRuntime({ host })
    const sourceId = ResourceSourceId('ambiguous')
    runtime.registerSource({ id: sourceId, readBytes: async () => ({ bytes: new Uint8Array() }) })
    runtime.registerHandler(handler(ResourceHandlerId('zeta'), 'default'))
    runtime.registerHandler(handler(ResourceHandlerId('alpha'), 'default'))

    const viewId = await runtime.open(descriptor(sourceId, 'application/example'))
    expect(runtime.snapshot(viewId).handlerStatus).toBe('choice')
    expect(runtime.snapshot(viewId).handlerId).toBeUndefined()
    expect(runtime.snapshot(viewId).openWith.map(row => row.id)).toEqual(['alpha', 'zeta'])
    runtime.dispose()
  })

  it('retains a byte handler guard across presentation absence and rejects stale writes after unload', async () => {
    const host = hostFixture()
    const runtime = new ResourceWorkbenchRuntime({ host })
    const byteHandlerId = ResourceHandlerId('byte-editor')
    runtime.registerHandler(handler(byteHandlerId, 'default'))
    const sourceId = ResourceSourceId('bytes')
    let finishWrite: ((value: { version: number }) => void) | undefined
    const source: ResourceSource = {
      id: sourceId,
      readBytes: async () => ({ bytes: new Uint8Array([1]), version: 1 }),
      saveBytes: async () => new Promise(resolve => { finishWrite = resolve }),
      supportsConditionalByteSave: true,
    }
    const unload = runtime.registerSource(source)
    const viewId = await runtime.open(descriptor(sourceId, 'application/example'))
    runtime.markEdited(viewId)
    const guard = vi.fn(() => false)
    runtime.registerCloseGuard(viewId, guard)

    await runtime.close(viewId)
    expect(host.hosted.has(viewId)).toBe(true)
    expect(guard).toHaveBeenCalledOnce()
    const writing = runtime.writeBytes(viewId, new Uint8Array([2]), 1, new AbortController().signal)
    unload()
    finishWrite?.({ version: 2 })
    await expect(writing).rejects.toThrow(/stale byte operation|aborted|unloaded/)
    expect(host.pinned).toEqual([viewId])
    runtime.dispose()
  })

  it('refuses byte publication when the source does not declare a guarded write', async () => {
    const host = hostFixture()
    const runtime = new ResourceWorkbenchRuntime({ host })
    const byteHandlerId = ResourceHandlerId('byte-editor')
    runtime.registerHandler(handler(byteHandlerId, 'default'))
    const sourceId = ResourceSourceId('unguarded-bytes')
    const saveBytes = vi.fn(async () => ({ version: 2 }))
    runtime.registerSource({
      id: sourceId,
      readBytes: async () => ({ bytes: new Uint8Array([1]), version: 1 }),
      saveBytes,
    })
    const viewId = await runtime.open(descriptor(sourceId, 'application/example'))

    await expect(runtime.writeBytes(
      viewId,
      new Uint8Array([2]),
      1,
      new AbortController().signal,
    )).rejects.toThrow('guarded byte writing is unavailable')
    expect(saveBytes).not.toHaveBeenCalled()
    runtime.dispose()
  })

  it.each(['pin', 'update', 'superseded'] as const)(
    'retains a dirty view when an accepted asynchronous close is invalidated by %s',
    async invalidation => {
      const host = hostFixture()
      let resolveFirst: ((accepted: boolean) => void) | undefined
      let calls = 0
      const runtime = new ResourceWorkbenchRuntime({
        host,
        hashText: async text => text,
        confirmDiscard: () => {
          calls += 1
          if (calls === 1) return new Promise<boolean>(resolve => { resolveFirst = resolve })
          return false
        },
      })
      runtime.registerHandler(handler(TEXT_RESOURCE_HANDLER_ID, 'default'))
      const sourceId = ResourceSourceId(`close-${invalidation}`)
      runtime.registerSource({ id: sourceId, readText: async () => ({ text: 'base' }) })
      const viewId = await runtime.open(descriptor(sourceId), { preview: true })
      runtime.editText(viewId, 'local')
      await Promise.resolve()

      const closing = runtime.close(viewId)
      await Promise.resolve()
      let invalidatingClose: Promise<void> | undefined
      if (invalidation === 'pin') {
        host.pin(SessionId('session'), viewId)
      } else if (invalidation === 'update') {
        host.update(SessionId('session'), viewId, { title: 'updated' })
      } else {
        invalidatingClose = runtime.close(viewId)
      }
      resolveFirst?.(true)
      await closing
      await invalidatingClose

      expect(host.hosted.has(viewId)).toBe(true)
      expect(runtime.textSnapshot(viewId)).toMatchObject({ text: 'local', syncStatus: 'local-ahead' })
      runtime.dispose()
    },
  )

  it('lets a newer handler switch supersede a switch waiting on a retained guard', async () => {
    const host = hostFixture()
    const runtime = new ResourceWorkbenchRuntime({ host })
    const current = ResourceHandlerId('current')
    const slowTarget = ResourceHandlerId('slow-target')
    const winningTarget = ResourceHandlerId('winning-target')
    runtime.registerHandler(handler(current, 'default'))
    runtime.registerHandler(handler(slowTarget, 'available'))
    runtime.registerHandler(handler(winningTarget, 'available'))
    const sourceId = ResourceSourceId('switch-race')
    runtime.registerSource({ id: sourceId, readBytes: async () => ({ bytes: new Uint8Array([1]) }) })
    const viewId = await runtime.open(descriptor(sourceId, 'application/example'))
    let releaseGuard: ((accepted: boolean) => void) | undefined
    let guardCalls = 0
    runtime.registerCloseGuard(viewId, () => {
      guardCalls += 1
      return guardCalls === 1
        ? new Promise<boolean>(resolve => { releaseGuard = resolve })
        : true
    })

    const slowSwitch = runtime.switchHandler(viewId, slowTarget)
    await Promise.resolve()
    await runtime.switchHandler(viewId, winningTarget)
    releaseGuard?.(true)
    await slowSwitch

    expect(runtime.snapshot(viewId).handlerId).toBe(winningTarget)
    expect(host.update).toHaveBeenCalledOnce()
    runtime.dispose()
  })

  it('retains opaque renderer state independently for each handler in one view', async () => {
    const host = hostFixture()
    const runtime = new ResourceWorkbenchRuntime({ host })
    const first = ResourceHandlerId('first-state')
    const second = ResourceHandlerId('second-state')
    runtime.registerHandler(handler(first, 'default'))
    runtime.registerHandler(handler(second, 'available'))
    const sourceId = ResourceSourceId('handler-states')
    runtime.registerSource({ id: sourceId, readBytes: async () => ({ bytes: new Uint8Array([1]) }) })
    const viewId = await runtime.open(descriptor(sourceId, 'application/example'))

    runtime.setViewState(viewId, first, { selection: 'first' })
    await runtime.switchHandler(viewId, second)
    expect(runtime.getViewState(viewId, second)).toBeUndefined()
    runtime.setViewState(viewId, second, { selection: 'second' })
    await runtime.switchHandler(viewId, first)

    expect(runtime.getViewState(viewId, first)).toEqual({ selection: 'first' })
    runtime.dispose()
  })

  it('does not let a switch waiting on a guard mutate a view after committed close', async () => {
    const host = hostFixture()
    const runtime = new ResourceWorkbenchRuntime({ host })
    const current = ResourceHandlerId('current')
    const target = ResourceHandlerId('target')
    runtime.registerHandler(handler(current, 'default'))
    runtime.registerHandler(handler(target, 'available'))
    const sourceId = ResourceSourceId('switch-close-race')
    runtime.registerSource({ id: sourceId, readBytes: async () => ({ bytes: new Uint8Array([1]) }) })
    const viewId = await runtime.open(descriptor(sourceId, 'application/example'))
    let releaseGuard: ((accepted: boolean) => void) | undefined
    let guardCalls = 0
    runtime.registerCloseGuard(viewId, () => {
      guardCalls += 1
      return guardCalls === 1
        ? new Promise<boolean>(resolve => { releaseGuard = resolve })
        : true
    })

    const switching = runtime.switchHandler(viewId, target)
    await Promise.resolve()
    await runtime.close(viewId)
    releaseGuard?.(true)
    await switching

    expect(host.hosted.has(viewId)).toBe(false)
    expect(() => runtime.snapshot(viewId)).toThrow('unknown view')
    expect(host.update).not.toHaveBeenCalled()
    runtime.dispose()
  })

  it('publishes selector, external-open and stale handler action failures without closing the view', async () => {
    const host = hostFixture()
    const runtime = new ResourceWorkbenchRuntime({ host, hashText: async text => text })
    runtime.registerHandler(handler(TEXT_RESOURCE_HANDLER_ID, 'default'))
    const byteHandlerId = ResourceHandlerId('bytes-only')
    runtime.registerHandler({
      ...handler(byteHandlerId, 'available'),
      match: (_value, capabilities) => capabilities.bytes ? { role: 'available' } : false,
    })
    const sourceId = ResourceSourceId('action-failures')
    const unload = runtime.registerSource({
      id: sourceId,
      readText: async () => ({ text: 'base' }),
      readBytes: async () => ({ bytes: new Uint8Array([1]) }),
      openExternal: async () => {},
    })
    const resource = {
      ...descriptor(sourceId),
      location: { label: 'Memory', selectorId: 'broken-selector' },
    }
    const viewId = await runtime.open(resource)
    vi.mocked(host.launch).mockRejectedValueOnce(new Error('selector unavailable'))

    await expect(runtime.selectLocation(viewId)).resolves.toBeUndefined()
    expect(runtime.snapshot(viewId).failure).toBe('selector unavailable')
    unload()
    await expect(runtime.openExternal(viewId)).resolves.toBeUndefined()
    expect(runtime.snapshot(viewId).failure).toBe('External opening is unavailable.')
    await expect(runtime.switchHandler(viewId, byteHandlerId)).resolves.toBeUndefined()
    expect(runtime.snapshot(viewId)).toMatchObject({
      handlerId: TEXT_RESOURCE_HANDLER_ID,
      failure: `Handler "${byteHandlerId}" does not support this resource.`,
    })
    expect(host.hosted.has(viewId)).toBe(true)
    runtime.dispose()
  })

  it('persists handler associations and JSON-safe restore descriptors', async () => {
    const host = hostFixture()
    const values = new Map<string, string>()
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value) },
      removeItem: (key: string) => { values.delete(key) },
    }
    const runtime = new ResourceWorkbenchRuntime({ host, storage })
    const firstHandler = ResourceHandlerId('first')
    const secondHandler = ResourceHandlerId('second')
    runtime.registerHandler(handler(firstHandler, 'available'))
    runtime.registerHandler(handler(secondHandler, 'available'))
    const sourceId = ResourceSourceId('association')
    runtime.registerSource({ id: sourceId, readText: async () => ({ text: 'x' }) })
    const resource = descriptor(sourceId)
    runtime.setAssociation(resource, secondHandler)
    expect(runtime.listOpenWith({ ...resource }).every(choice => !choice.selected)).toBe(true)

    const viewId = await runtime.open(resource)
    expect(runtime.snapshot(viewId).handlerId).toBe(secondHandler)
    expect(host.hosted.get(viewId)?.input).toMatchObject({
      viewId: RESOURCE_WORKBENCH_VIEW_ID,
      restoreDescriptor: { format: 1, name: 'one.txt', handlerId: secondHandler },
    })
    expect(() => JSON.stringify(host.hosted.get(viewId)?.input.restoreDescriptor)).not.toThrow()
    runtime.dispose()
  })

  it('restores reserved view ids without colliding with later opens and rejects invalid descriptors', async () => {
    const host = hostFixture()
    const runtime = new ResourceWorkbenchRuntime({ host, hashText: async text => text })
    runtime.registerHandler(handler(TEXT_RESOURCE_HANDLER_ID, 'default'))
    const sourceId = ResourceSourceId('restore')
    runtime.registerSource({ id: sourceId, readText: async ref => ({ text: ref.resourceId }) })
    runtime.registerRestorer()
    const restore = host.restorers.get(RESOURCE_WORKBENCH_VIEW_ID)
    expect(restore).toBeDefined()
    const sessionId = SessionId('restored-session')
    await restore!({
      sessionId,
      instanceId: 'resource-view-saved',
      descriptor: {
        format: 1,
        ref: { sessionId, sourceId, resourceId: 'saved' },
        name: 'saved.txt',
        mediaType: 'text/plain',
        handlerId: TEXT_RESOURCE_HANDLER_ID,
      },
    })
    const opened = await runtime.open({
      ref: { sessionId, sourceId, resourceId: 'new' },
      name: 'new.txt',
      mediaType: 'text/plain',
    })

    expect(opened).not.toBe('resource-view-saved')
    expect(runtime.textSnapshot('resource-view-saved')).toMatchObject({ text: 'saved' })
    await expect(restore!({
      sessionId: SessionId('other-session'),
      instanceId: 'resource-view-saved',
      descriptor: {
        format: 1,
        ref: { sessionId: SessionId('other-session'), sourceId, resourceId: 'other' },
        name: 'other.txt',
        handlerId: TEXT_RESOURCE_HANDLER_ID,
      },
    })).rejects.toThrow('duplicate restored view')
    await expect(restore!({ sessionId, instanceId: 'invalid', descriptor: {} })).rejects.toThrow('invalid persisted')
    await expect(restore!({
      sessionId,
      instanceId: 'invalid-location',
      descriptor: {
        format: 1,
        ref: { sessionId, sourceId, resourceId: 'invalid-location' },
        name: 'invalid.txt',
        location: { segments: [{ selectionHint: 'missing label' }] },
      },
    })).rejects.toThrow('invalid persisted')
    runtime.dispose()
  })
})
