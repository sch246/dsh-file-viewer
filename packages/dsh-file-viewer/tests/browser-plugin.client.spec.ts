// @vitest-environment jsdom
import { Context } from '@deepseek-ai/cordis'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { RightSidebarService } from '@dsh-external/dsh-right-sidebar/client'
import { describe, expect, it, vi } from 'vitest'
import { apply, inject } from '../src/client/index.ts'
import { RESOURCE_WORKBENCH_VIEW_ID } from '../src/client/workbench.ts'
import { ResourceSourceId } from '../src/client/resource.ts'
import type { SessionId } from '@deepseek-ai/dsh-session/types'

describe('file viewer browser plugin', () => {
  it('registers one source-neutral workbench view without materializing CodeMirror', async () => {
    const ctx = new Context()
    const slotsFiber = ctx.plugin(SlotRegistry)
    await slotsFiber.await()
    const slots = ctx.get('slots') as SlotRegistry
    const offRoot = slots.register({
      name: 'root',
      children: { 'rightbar.view': { kind: 'list', scope: 'session' } },
    }, (() => null) as never)
    ctx.provide('locale', new LocaleRuntime(ctx))
    const importModule = vi.fn()
    ctx.provide('modules', { import: importModule } as never)
    const rightSidebar: RightSidebarService = {
      registerLauncher: vi.fn(() => () => {}),
      launch: vi.fn(async () => {}),
      openInstance: vi.fn(),
      activateInstance: vi.fn(),
      updateInstance: vi.fn(),
      switchInstanceView: vi.fn(),
      pinInstance: vi.fn(),
      getInstanceGroup: vi.fn(() => 'group'),
      resolveTarget: vi.fn(() => 'group'),
      registerRestorer: vi.fn(() => () => {}),
      closeInstance: vi.fn(async () => {}),
    }
    ctx.provide('rightSidebar', rightSidebar)
    const plugin = ctx.plugin({ inject: [...inject], apply })
    await plugin.await()

    expect(ctx.resourceWorkbench).toBeDefined()
    expect(slots.entries('rightbar.view').map(entry => entry.options.id)).toEqual([
      RESOURCE_WORKBENCH_VIEW_ID,
    ])
    expect(importModule).not.toHaveBeenCalled()

    const sourceId = ResourceSourceId('pagehide-test')
    const offSource = ctx.resourceWorkbench.registerSource({ id: sourceId, readText: async () => ({ text: 'base' }) })
    const ref = { sessionId: 'pagehide-session' as SessionId, sourceId, resourceId: 'memory' }
    const id = await ctx.resourceWorkbench.open({ ref, name: 'memory', mediaType: 'text/plain' })
    ctx.resourceWorkbench.editText(id, 'last keystroke')
    window.dispatchEvent(new Event('pagehide'))
    const key = `dsh-file-viewer:draft:${JSON.stringify([ref.sessionId, ref.sourceId, ref.resourceId])}`
    expect(JSON.parse(localStorage.getItem(key) ?? 'null')).toMatchObject({ baseText: 'base', localText: 'last keystroke' })
    offSource()

    await plugin.dispose()
    expect(slots.entries('rightbar.view')).toEqual([])
    offRoot()
    await slotsFiber.dispose()
    localStorage.removeItem(key)
  })
})
