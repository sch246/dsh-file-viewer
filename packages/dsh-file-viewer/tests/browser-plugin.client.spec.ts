import { createHash, webcrypto } from 'node:crypto'
import { pollPolicy } from './poll-policy.ts'
// @vitest-environment jsdom
import { Context } from '@deepseek-ai/cordis'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { RightSidebarService } from '@dsh-external/dsh-right-sidebar/client'
import { describe, expect, it, onTestFinished, vi } from 'vitest'

vi.mock('@deepseek-ai/dsh-client-ui-chat/client', async () => {
  const { openWorkspaceFile } = await import('../../../harness/packages/client/ui-chat/src/client/open-workspace-file.ts')
  return { openWorkspaceFile: vi.fn(openWorkspaceFile) }
})
import { openWorkspaceFile } from '@deepseek-ai/dsh-client-ui-chat/client'
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
    vi.stubGlobal('crypto', webcrypto)
    onTestFinished(() => vi.unstubAllGlobals())
    const prepareTextRead = vi.fn(async () => ({ ok: true, value: { path: '/workspace/file.txt', chunkBytes: 1024, readVersion: 'stat', sizeBytes: 11 } }))
    const canonicalHash = createHash('sha256').update('remote text').digest('hex')
    const readTextChunk = vi.fn(async () => ({ ok: true, value: { offset: 0, dataBase64: btoa('remote text'), sha256: canonicalHash } }))
    const finishTextRead = vi.fn(async () => ({ ok: true, value: { version: 'v1', sizeBytes: 11, canonicalHash } }))
    const resolve = vi.fn(async () => ({ ok: true, value: { path: '/workspace/file.txt', name: 'file.txt', kind: 'file', mediaType: 'text/plain' } }))
    const fileViewer = { metadata: async () => ({ ok: true, value: { ...pollPolicy(2000), largeFileBytes: 8, hugeFileBytes: 80 } }) }
    const userFiles = { resolve, prepareTextRead, readTextChunk, finishTextRead }
    const session = { openWorkspacePath: vi.fn(async () => ({ ok: true, value: undefined })) }
    ctx.provide('sessions', { list: { getSnapshot: () => ({ byId: { 'standalone-viewer': { cwd: '/workspace' } } }) } } as never)
    ctx.provide('remote.session', session as never)
    ctx.provide('remote', { $mount: vi.fn(async () => async () => {}), fileViewer, userFiles, session } as never)
    ctx.provide('remote.fileViewer', fileViewer as never)
    ctx.provide('remote.userFiles', userFiles as never)
    const plugin = ctx.plugin({ inject: [...inject], apply })
    onTestFinished(async () => { await plugin.dispose(); offRoot(); await slotsFiber.dispose(); localStorage.clear() })
    await plugin.await()

    expect(ctx.resourceWorkbench).toBeDefined()
    expect(slots.entries('rightbar.view').map(entry => entry.options.id)).toEqual([
      RESOURCE_WORKBENCH_VIEW_ID,
    ])
    expect(importModule).not.toHaveBeenCalled()

    const sessionId = 'standalone-viewer' as SessionId
    await ctx.waterfall('chat/open-workspace-file', { sessionId, path: 'file.txt', preview: true, target: { fromInstanceId: 'tree', direction: 'right' } }, async () => {})
    expect(prepareTextRead).toHaveBeenCalledWith({ sessionId, path: '/workspace/file.txt', allowLargeFile: false, maxConfirmedBytes: 80 }, expect.any(AbortSignal))
    expect(rightSidebar.openInstance).toHaveBeenLastCalledWith(sessionId, expect.objectContaining({
      viewId: RESOURCE_WORKBENCH_VIEW_ID,
      restoreDescriptor: expect.objectContaining({ ref: { sessionId, sourceId: 'filesystem', resourceId: '/workspace/file.txt' } }),
    }), { preview: true, target: { fromInstanceId: 'tree', direction: 'right' } })
    expect(importModule).not.toHaveBeenCalled()
    const filesystemView = vi.mocked(rightSidebar.openInstance).mock.calls[0]![1].id
    expect(ctx.resourceWorkbench.textSnapshot(filesystemView)).toMatchObject({ sizeTier: 'large' })
    resolve.mockResolvedValueOnce({ ok: true, value: { path: '/workspace', name: 'workspace', kind: 'directory', mediaType: 'inode/directory' } })
    await ctx.resourceWorkbench.selectLocation(filesystemView, { path: '/workspace' })
    expect(openWorkspaceFile).toHaveBeenLastCalledWith(expect.anything(), { sessionId, path: '/workspace' })
    expect(session.openWorkspacePath).toHaveBeenLastCalledWith({ path: '/workspace' }, undefined)
    await ctx.resourceWorkbench.openExternal(filesystemView)
    expect(openWorkspaceFile).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ sessionId, path: '/workspace/file.txt', mode: 'system', signal: expect.any(AbortSignal) }))
    expect(session.openWorkspacePath).toHaveBeenLastCalledWith({ path: '/workspace/file.txt' }, expect.any(AbortSignal))
    const next = vi.fn(async () => {})
    const offNext = ctx.on('chat/open-workspace-file', next)
    resolve.mockResolvedValueOnce({ ok: true, value: { path: '/workspace', name: 'workspace', kind: 'directory', mediaType: 'inode/directory' } })
    await ctx.waterfall('chat/open-workspace-file', { sessionId, path: '/workspace' }, async () => {})
    expect(next).toHaveBeenCalledTimes(1)
    resolve.mockRejectedValueOnce(new Error('remote denied'))
    await expect(ctx.waterfall('chat/open-workspace-file', { sessionId, path: 'denied' }, async () => {})).rejects.toThrow('remote denied')
    expect(next).toHaveBeenCalledTimes(1)
    vi.mocked(rightSidebar.resolveTarget).mockReturnValueOnce('other')
    vi.mocked(rightSidebar.openInstance).mockRejectedValueOnce(new Error('sidebar rejected'))
    await expect(ctx.waterfall('chat/open-workspace-file', { sessionId, path: 'file.txt', target: { groupId: 'other' } }, async () => {})).rejects.toThrow('sidebar rejected')
    expect(next).toHaveBeenCalledTimes(1)
    offNext()

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
