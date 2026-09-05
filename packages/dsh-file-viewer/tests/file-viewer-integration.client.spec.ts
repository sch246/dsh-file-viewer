import { SessionId } from '@deepseek-ai/dsh-session/types'
import type {
  RightSidebarInstanceInput,
  RightSidebarService,
} from '@dsh-external/dsh-right-sidebar/client'
import { describe, expect, it, vi } from 'vitest'
import {
  createFileViewerClientService,
  createFileViewerInstanceHost,
  FILE_VIEWER_VIEW_ID,
} from '../src/client/face.ts'
import { FileViewerService } from '../src/client/service.ts'
import { MemoryFileViewerSource } from './fixtures/memory-source.ts'

function createSidebar(): RightSidebarService & {
  readonly instances: Map<string, RightSidebarInstanceInput>
} {
  const instances = new Map<string, RightSidebarInstanceInput>()
  return {
    instances,
    registerLauncher: vi.fn(() => () => {}),
    launch: vi.fn(async () => {}),
    openInstance: vi.fn((_sessionId, instance) => { instances.set(instance.id, instance) }),
    activateInstance: vi.fn(),
    updateInstance: vi.fn((_sessionId, id, update) => {
      const current = instances.get(id)
      if (current !== undefined && update.title !== undefined) {
        instances.set(id, { ...current, title: update.title })
      }
    }),
    closeInstance: vi.fn(async (_sessionId, id) => {
      const current = instances.get(id)
      if (current === undefined) return
      if (current.onClose !== undefined && await current.onClose() === false) return
      instances.delete(id)
    }),
  }
}

describe('file viewer client workbench face', () => {
  it('opens independent instances, activates exact repeats, and projects source titles', async () => {
    const sidebar = createSidebar()
    const runtime = new FileViewerService({ host: createFileViewerInstanceHost(sidebar) })
    const face = createFileViewerClientService(runtime, sidebar)
    const source = new MemoryFileViewerSource()
    source.put('one', 'first', 'One')
    source.put('two', 'second', 'Two')
    face.registerSource(source)
    const sessionId = SessionId('session')

    const first = await face.open({ sessionId, sourceId: source.id, resourceId: 'one' })
    const second = await face.open({ sessionId, sourceId: source.id, resourceId: 'two' })
    const repeated = await face.open({ sessionId, sourceId: source.id, resourceId: 'one' })

    expect(first).not.toBe(second)
    expect(repeated).toBe(first)
    expect(sidebar.openInstance).toHaveBeenNthCalledWith(1, sessionId, expect.objectContaining({
      id: first, viewId: FILE_VIEWER_VIEW_ID, title: 'one', onClose: expect.any(Function),
    }))
    expect(sidebar.updateInstance).toHaveBeenCalledWith(sessionId, first, { title: 'One' })
    expect(sidebar.activateInstance).toHaveBeenCalledWith(sessionId, first)
    expect(face.snapshot(first)).toMatchObject({ status: 'ready', text: 'first' })
    expect(face.snapshot(second)).toMatchObject({ status: 'ready', text: 'second' })
  })

  it('routes provider location hints and keeps a dirty instance after close is rejected', async () => {
    const sidebar = createSidebar()
    const confirmDiscard = vi.fn(() => false)
    const runtime = new FileViewerService({
      host: createFileViewerInstanceHost(sidebar),
      confirmDiscard,
    })
    const face = createFileViewerClientService(runtime, sidebar)
    const source = new MemoryFileViewerSource()
    source.put('one', 'first', 'One')
    face.registerSource(source)
    const sessionId = SessionId('session')
    const instanceId = await face.open({ sessionId, sourceId: source.id, resourceId: 'one' })

    await face.selectLocation(instanceId, { document: 'one' })
    expect(sidebar.launch).toHaveBeenCalledWith(
      sessionId,
      'memory-documents',
      { document: 'one' },
    )

    face.edit(instanceId, 'changed')
    await face.close(instanceId)
    expect(confirmDiscard).toHaveBeenCalledOnce()
    expect(sidebar.instances.has(instanceId)).toBe(true)
    expect(face.snapshot(instanceId)).toMatchObject({ status: 'ready', text: 'changed' })
  })
})
