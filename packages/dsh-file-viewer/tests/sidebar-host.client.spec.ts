import type { Context } from '@deepseek-ai/cordis'
import type { SidebarRightLifecycle, SidebarRightNavigation } from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import { expect, it, vi } from 'vitest'
import { createResourceViewHost, resourceViewEnvelope } from '../src/client/sidebar-host.ts'

const sessionId = 'source-session' as never
function setup() {
  const controller = new AbortController()
  const transaction: SidebarRightNavigation = {
    signal: controller.signal, current: () => !controller.signal.aborted,
    cancel: reason => { controller.abort(reason) }, claim: vi.fn(() => !controller.signal.aborted),
    commit: vi.fn((_id, _destination, apply) => { if (controller.signal.aborted) return false; apply?.(); return true }),
  }
  let lifecycle: SidebarRightLifecycle | undefined
  const sidebar = {
    workspaceTabs: () => [{ id: 'official-tab', kind: 'resource-workbench', descriptor: { instanceId: 'feature-view', descriptor: { format: 1 } } }],
    beginNavigation: vi.fn(() => transaction),
    openResourceIn: vi.fn(async () => ({ tabId: 'new-tab', paneId: 'pane' })),
    checkpoint: vi.fn(), groupOf: vi.fn(() => 'pane'), resolveTarget: vi.fn(() => 'pane'), pin: vi.fn(),
    registerLifecycle: vi.fn((_kind, registered: SidebarRightLifecycle) => { lifecycle = registered; return vi.fn() }),
    closeIn: vi.fn(async () => false), openTabIn: vi.fn(async () => undefined),
  }
  const open = vi.fn(async () => {})
  // The fixture implements the public calls consumed by this adapter, not a second sidebar model.
  const host = createResourceViewHost({ sidebarRight: sidebar, workspaceFileOpener: { open } } as unknown as Context)
  return { host, sidebar, transaction, open, restore: () => lifecycle!.restore }
}

it('maps legacy feature identity to official tab IDs and passes the exact transaction when opening', async () => {
  const f = setup()
  const request = { path: '/outside/workspace.txt' }
  const navigation = f.host.beginNavigation(sessionId, {
    request, sourceInstanceId: 'feature-view', target: { fromInstanceId: 'feature-view', direction: 'right' },
  })
  expect(f.sidebar.beginNavigation).toHaveBeenCalledWith(sessionId, {
    request, sourceTabId: 'official-tab', target: { fromTabId: 'official-tab', direction: 'right' },
  })
  const onClosed = vi.fn()
  expect(await f.host.open(sessionId, { id: 'new-view', viewId: 'resource-workbench', title: 'file',
    restoreDescriptor: { format: 1 }, onClosed }, { navigation, preview: true })).toBe('pane')
  expect(f.sidebar.openResourceIn).toHaveBeenCalledWith(sessionId, 'dsh-resource://resource-workbench/new-view', {
    kind: 'resource-workbench', title: 'file', descriptor: { instanceId: 'new-view', descriptor: { format: 1 } },
    lifecycle: { onClosed }, navigation: f.transaction, preview: true,
  })
  expect(onClosed).not.toHaveBeenCalled()
  navigation.commit('feature-view', { descriptor: { reached: true }, pin: true })
  expect(f.transaction.commit).toHaveBeenCalledWith('official-tab', {
    descriptor: { instanceId: 'feature-view', descriptor: { reached: true } }, pin: true,
  }, undefined)
  const reason = new Error('handler unloaded')
  navigation.cancel(reason)
  expect(f.transaction.signal.reason).toBe(reason)
  expect(navigation.current()).toBe(false)
})

it('restores the legacy envelope and translates history checkpoints without discarding on close veto', async () => {
  const f = setup()
  const onClosed = vi.fn()
  const onNavigate = vi.fn(async () => true)
  const restore = vi.fn(async () => ({ onClose: () => false, onClosed, onNavigate }))
  f.host.registerRestorer('resource-workbench', restore)
  const signal = new AbortController().signal
  const callbacks = await f.restore()({ sessionId, tabId: 'official-tab' as never,
    descriptor: { instanceId: 'feature-view', descriptor: { format: 1 } }, signal })
  expect(restore).toHaveBeenCalledWith({ sessionId, instanceId: 'feature-view', descriptor: { format: 1 }, signal })
  await callbacks.onNavigate!({ instanceId: 'feature-view', descriptor: { reached: true } }, f.transaction)
  expect(onNavigate).toHaveBeenCalledWith({ reached: true }, expect.objectContaining({ signal: f.transaction.signal }))
  await f.host.close(sessionId, 'feature-view')
  expect(f.sidebar.closeIn).toHaveBeenCalledWith(sessionId, 'official-tab')
  expect(onClosed).not.toHaveBeenCalled()
})

it('rejects malformed durable metadata and does not treat an uncommitted open as a view', async () => {
  for (const value of [null, {}, { instanceId: '', descriptor: {} }, { instanceId: 'id' }]) {
    expect(() => resourceViewEnvelope(value)).toThrow('descriptor envelope')
  }
  const f = setup()
  vi.mocked(f.sidebar.openResourceIn).mockResolvedValue(undefined as never)
  await expect(f.host.open(sessionId, { id: 'new', viewId: 'resource-workbench', title: 'file' })).rejects.toThrow('cancelled')
})

it('uses the official placement transaction for a direct targeted open', async () => {
  const f = setup()
  await f.host.open(sessionId, { id: 'new', viewId: 'resource-workbench', title: 'file' }, { target: { groupId: 'pane' } })
  expect(f.sidebar.beginNavigation).toHaveBeenCalledWith(sessionId, { target: { paneId: 'pane' } })
  expect(f.sidebar.openResourceIn).toHaveBeenCalledWith(sessionId, expect.any(String), expect.objectContaining({ navigation: f.transaction }))
})
