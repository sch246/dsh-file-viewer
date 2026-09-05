// @vitest-environment jsdom
import { Context } from '@deepseek-ai/cordis'
import { LocaleRuntime } from '../../../harness/packages/client/locale/src/client/index.ts'
import { SlotRegistry } from '../../../harness/packages/client/ui-renderer/src/client/registry.ts'
import type { RightSidebarService } from '@dsh-external/dsh-right-sidebar/client'
import { describe, expect, it, vi } from 'vitest'
import { apply, inject } from '../src/client/index.ts'
import { FILE_VIEWER_VIEW_ID } from '../src/client/face.ts'
import { FileViewerSourceId } from '../src/client/service.ts'
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
      closeInstance: vi.fn(async () => {}),
    }
    ctx.provide('rightSidebar', rightSidebar)
    const plugin = ctx.plugin({ inject: [...inject], apply })
    await plugin.await()

    expect(ctx.fileViewer).toBeDefined()
    expect(slots.entries('rightbar.view').map(entry => entry.options.id)).toEqual([
      FILE_VIEWER_VIEW_ID,
    ])
    expect(importModule).not.toHaveBeenCalled()

    const sourceId = FileViewerSourceId('pagehide-test')
    const offSource = ctx.fileViewer.registerSource({ id: sourceId, load: async () => ({ text: 'base' }) })
    const ref = { sessionId: 'pagehide-session' as SessionId, sourceId, resourceId: 'memory' }
    const id = await ctx.fileViewer.open(ref)
    ctx.fileViewer.edit(id, 'last keystroke')
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
