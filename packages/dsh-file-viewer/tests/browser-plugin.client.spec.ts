// @vitest-environment jsdom
import { Context } from '@deepseek-ai/cordis'
import { LocaleRuntime } from '../../../harness/packages/client/locale/src/client/index.ts'
import { SlotRegistry } from '../../../harness/packages/client/ui-renderer/src/client/registry.ts'
import type { RightSidebarService } from '@dsh-external/dsh-right-sidebar/client'
import { describe, expect, it, vi } from 'vitest'
import { apply, inject } from '../src/client/index.ts'
import { FILE_VIEWER_VIEW_ID } from '../src/client/face.ts'

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

    await plugin.dispose()
    expect(slots.entries('rightbar.view')).toEqual([])
    offRoot()
    await slotsFiber.dispose()
  })
})
