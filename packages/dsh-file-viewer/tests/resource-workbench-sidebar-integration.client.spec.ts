// @vitest-environment jsdom
import { Context } from '@deepseek-ai/cordis'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import {
  apply as applyRightSidebar,
  inject as rightSidebarInject,
  type RightSidebarInstance,
  type RightSidebarLayoutNode,
} from '@dsh-external/dsh-right-sidebar/client'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createResourceViewHost } from '../src/client/face.ts'
import { ResourceSourceId } from '../src/client/resource.ts'
import {
  RESOURCE_WORKBENCH_VIEW_ID,
  ResourceWorkbenchRuntime,
  TEXT_RESOURCE_HANDLER_ID,
} from '../src/client/workbench.ts'

interface WorkbenchProjection {
  readonly root: RightSidebarLayoutNode
}

interface SidebarPanelFace {
  readonly hooks: { readonly workbench: { getSnapshot(): WorkbenchProjection } }
  mountWorkbench(): () => void
}

const runtimes = new Set<ResourceWorkbenchRuntime>()
const sidebarCleanups = new Set<() => Promise<void>>()

function findInstance(root: RightSidebarLayoutNode, id: string): RightSidebarInstance | undefined {
  if (root.kind === 'group') return root.instances.find(instance => instance.id === id)
  return findInstance(root.first, id) ?? findInstance(root.second, id)
}

async function createSidebar(sessionId: SessionId) {
  const ctx = new Context()
  const slotsFiber = ctx.plugin(SlotRegistry)
  await slotsFiber.await()
  const slots = ctx.get('slots') as SlotRegistry
  const offRoot = slots.register({
    name: 'root',
    children: {
      details: { kind: 'single', scope: 'session' },
      'shell.navbar.action': { kind: 'list', scope: 'root' },
    },
  }, (() => null) as never)
  ctx.provide('locale', new LocaleRuntime(ctx))
  ctx.provide('layout', {
    openDetails: vi.fn(),
    closeDetails: vi.fn(),
    toggleDetailsMaximized: vi.fn(),
  } as never)
  const sidebarFiber = ctx.plugin({ inject: [...rightSidebarInject], apply: applyRightSidebar })
  await sidebarFiber.await()
  const details = slots.entries('details').find(entry => entry.options.priority === -1)
  if (details === undefined) throw new Error('fixture: right-sidebar details entry is absent')
  const panel = (details.inject as unknown as (id: SessionId) => SidebarPanelFace)(sessionId)
  const unmount = panel.mountWorkbench()
  const offView = slots.register({
    name: 'rightbar.view',
    id: RESOURCE_WORKBENCH_VIEW_ID,
  }, (() => null) as never)
  let disposed = false
  const dispose = async (): Promise<void> => {
    if (disposed) return
    disposed = true
    sidebarCleanups.delete(dispose)
    unmount()
    offView()
    await sidebarFiber.dispose()
    offRoot()
    await slotsFiber.dispose()
  }
  sidebarCleanups.add(dispose)
  return {
    ctx,
    panel,
    dispose,
  }
}

beforeEach(() => { localStorage.clear() })
afterEach(async () => {
  for (const runtime of runtimes) runtime.dispose()
  runtimes.clear()
  for (const dispose of [...sidebarCleanups]) await dispose()
  localStorage.clear()
})

describe('resource workbench with the right-sidebar runtime', () => {
  it('retains close callbacks across checkpoints and restores cleanup callbacks before refreshing metadata', async () => {
    const sessionId = SessionId('resource-sidebar-integration')
    const sourceId = ResourceSourceId('memory')
    let allowClose = false
    const confirmDiscard = vi.fn(() => allowClose)
    const first = await createSidebar(sessionId)
    const firstRuntime = new ResourceWorkbenchRuntime({
      host: createResourceViewHost(first.ctx, first.ctx.rightSidebar),
      confirmDiscard,
      hashText: async text => text,
    })
    runtimes.add(firstRuntime)
    const offFirstHandler = firstRuntime.registerHandler({
      id: TEXT_RESOURCE_HANDLER_ID,
      label: 'Text',
      match: () => ({ role: 'default' }),
      load: async () => ({ View: () => null }),
    })
    const offFirstSource = firstRuntime.registerSource({
      id: sourceId,
      readText: async ref => ({
        text: 'base',
        descriptor: { name: ref.resourceId === 'dirty' ? 'dirty-loaded.txt' : 'saved-loaded.txt' },
      }),
    })
    const offFirstRestorer = firstRuntime.registerRestorer()

    const dirtyId = await firstRuntime.open({
      ref: { sessionId, sourceId, resourceId: 'dirty' },
      name: 'dirty.txt',
      mediaType: 'text/plain',
    })
    expect(findInstance(first.panel.hooks.workbench.getSnapshot().root, dirtyId)?.title).toBe('dirty-loaded.txt')
    firstRuntime.editText(dirtyId, 'local edit')
    await first.ctx.rightSidebar.closeInstance(sessionId, dirtyId)
    expect(confirmDiscard).toHaveBeenCalledTimes(1)
    expect(findInstance(first.panel.hooks.workbench.getSnapshot().root, dirtyId)).toBeDefined()
    expect(firstRuntime.textSnapshot(dirtyId)).toMatchObject({ text: 'local edit' })

    allowClose = true
    await first.ctx.rightSidebar.closeInstance(sessionId, dirtyId)
    expect(findInstance(first.panel.hooks.workbench.getSnapshot().root, dirtyId)).toBeUndefined()
    expect(() => firstRuntime.snapshot(dirtyId)).toThrow('unknown view')

    const savedId = await firstRuntime.open({
      ref: { sessionId, sourceId, resourceId: 'saved' },
      name: 'saved.txt',
      mediaType: 'text/plain',
    })
    expect(findInstance(first.panel.hooks.workbench.getSnapshot().root, savedId)?.title).toBe('saved-loaded.txt')
    offFirstRestorer()
    offFirstSource()
    offFirstHandler()
    firstRuntime.dispose()
    await first.dispose()

    const second = await createSidebar(sessionId)
    const secondRuntime = new ResourceWorkbenchRuntime({
      host: createResourceViewHost(second.ctx, second.ctx.rightSidebar),
      hashText: async text => text,
    })
    runtimes.add(secondRuntime)
    const offSecondHandler = secondRuntime.registerHandler({
      id: TEXT_RESOURCE_HANDLER_ID,
      label: 'Text',
      match: () => ({ role: 'default' }),
      load: async () => ({ View: () => null }),
    })
    const offSecondSource = secondRuntime.registerSource({
      id: sourceId,
      readText: async () => ({
        text: 'base',
        descriptor: { name: 'saved-restored.txt' },
      }),
    })
    const offSecondRestorer = secondRuntime.registerRestorer()

    await vi.waitFor(() => {
      expect(findInstance(second.panel.hooks.workbench.getSnapshot().root, savedId)).toMatchObject({
        availability: 'ready',
        title: 'saved-restored.txt',
      })
    })
    const restoredDocumentId = secondRuntime.textDocumentId(savedId)
    expect(restoredDocumentId).toBeDefined()
    await second.ctx.rightSidebar.closeInstance(sessionId, savedId)
    expect(findInstance(second.panel.hooks.workbench.getSnapshot().root, savedId)).toBeUndefined()
    expect(() => secondRuntime.snapshot(savedId)).toThrow('unknown view')
    expect(() => secondRuntime.documents.snapshot(restoredDocumentId!)).toThrow('unknown instance')

    offSecondRestorer()
    offSecondSource()
    offSecondHandler()
    secondRuntime.dispose()
    await second.dispose()
  })
})
