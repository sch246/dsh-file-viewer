/** Translate feature identities into official Workspace-owned tab occurrences. */
import type { Context } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { PaneId, SidebarRightNavigation, SidebarRightTabLifecycle, SidebarRightTarget } from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'
import type {} from '@dsh-external/dsh-user-files/file-location'
import type { ResourceNavigation, ResourceViewHost, ResourceViewRestored } from './host.ts'
import type { ResourceOpenTarget } from './resource.ts'

/** Durable envelope shared with the official importer of legacy sidebar tabs. */
export interface ResourceViewEnvelope {
  readonly instanceId: string
  readonly descriptor: unknown
}

/** @param value Durable tab metadata. @returns Validated feature identity and its opaque checkpoint. */
export function resourceViewEnvelope(value: unknown): ResourceViewEnvelope {
  if (typeof value !== 'object' || value === null || !('instanceId' in value)
    || typeof value.instanceId !== 'string' || value.instanceId === '' || !('descriptor' in value)) {
    throw new Error('resource-workbench: invalid sidebar descriptor envelope')
  }
  return { instanceId: value.instanceId, descriptor: value.descriptor }
}

/** @param ctx Client context with official sidebar and unified opener injected. @returns Feature adapter without a layout or occurrence store. */
export function createResourceViewHost(ctx: Context): ResourceViewHost {
  const sidebar = ctx.sidebarRight
  const transactions = new WeakMap<ResourceNavigation, SidebarRightNavigation>()
  const tabFor = (sessionId: SessionId, instanceId: string) => {
    const tab = sidebar.workspaceTabs(sessionId).find(tab => {
      const value = tab.descriptor
      return typeof value === 'object' && value !== null && 'instanceId' in value && value.instanceId === instanceId
    })
    if (tab === undefined) throw new Error(`resource-workbench: unknown sidebar instance "${instanceId}"`)
    return tab
  }
  const targetFor = (sessionId: SessionId, target: ResourceOpenTarget): SidebarRightTarget => 'groupId' in target
    ? { paneId: target.groupId as PaneId }
    : { fromTabId: tabFor(sessionId, target.fromInstanceId).id, direction: target.direction }
  const navigationFor = (sessionId: SessionId, transaction: SidebarRightNavigation): ResourceNavigation => {
    const navigation: ResourceNavigation = {
      signal: transaction.signal,
      current: () => transaction.current(),
      cancel: reason => { transaction.cancel(reason) },
      claim: id => transaction.claim(tabFor(sessionId, id).id),
      commit: (id, destination, apply) => transaction.commit(tabFor(sessionId, id).id, {
        ...destination, descriptor: { instanceId: id, descriptor: destination.descriptor },
      }, apply),
    }
    transactions.set(navigation, transaction)
    return navigation
  }
  const lifecycleFor = (sessionId: SessionId, input: ResourceViewRestored): SidebarRightTabLifecycle => ({
    ...(input.onClose === undefined ? {} : { canClose: input.onClose }),
    ...(input.onClosed === undefined ? {} : { onClosed: input.onClosed }),
    ...(input.onRestored === undefined ? {} : { onRestored: input.onRestored }),
    ...(input.onNavigate === undefined ? {} : { onNavigate: (descriptor, navigation) =>
      input.onNavigate!(resourceViewEnvelope(descriptor).descriptor, navigationFor(sessionId, navigation)) }),
  })
  return {
    openWorkspaceFile: request => ctx.workspaceFileOpener.open(request),
    beginNavigation: (sessionId, options = {}) => navigationFor(sessionId, sidebar.beginNavigation(sessionId, {
      ...(options.request === undefined ? {} : { request: options.request }),
      ...(options.signal === undefined ? {} : { signal: options.signal }),
      ...(options.sourceInstanceId === undefined ? {} : { sourceTabId: tabFor(sessionId, options.sourceInstanceId).id }),
      ...(options.target === undefined ? {} : { target: targetFor(sessionId, options.target) }),
    })),
    open: async (sessionId, input, options = {}) => {
      const navigation = options.navigation === undefined
        ? options.target === undefined ? undefined : sidebar.beginNavigation(sessionId, { target: targetFor(sessionId, options.target) })
        : transactions.get(options.navigation)
      if (options.navigation !== undefined && navigation === undefined) throw new Error('resource-workbench: foreign navigation adapter')
      const opened = await sidebar.openResourceIn(sessionId, `dsh-resource://resource-workbench/${encodeURIComponent(input.id)}`, {
        kind: input.viewId, title: input.title,
        descriptor: { instanceId: input.id, descriptor: input.restoreDescriptor ?? null },
        lifecycle: lifecycleFor(sessionId, input),
        ...(options.preview === undefined ? {} : { preview: options.preview }),
        ...(navigation === undefined ? {} : { navigation }),
      })
      if (opened === undefined) throw new Error('resource navigation cancelled')
      if (input.resourceMissing !== undefined) sidebar.checkpoint(sessionId, opened.tabId, { resourceMissing: input.resourceMissing })
      return opened.paneId
    },
    update: (sessionId, viewId, update) => {
      const { restoreDescriptor, ...presentation } = update
      sidebar.checkpoint(sessionId, tabFor(sessionId, viewId).id, {
        ...presentation,
        ...(restoreDescriptor === undefined ? {} : { descriptor: { instanceId: viewId, descriptor: restoreDescriptor } }),
      })
    },
    pin: (sessionId, viewId) => { sidebar.pin(sessionId, tabFor(sessionId, viewId).id) },
    group: (sessionId, viewId) => {
      const group = sidebar.groupOf(sessionId, tabFor(sessionId, viewId).id)
      if (group === undefined) throw new Error('resource-workbench: sidebar instance has no pane')
      return group
    },
    resolveTarget: (sessionId, target) => sidebar.resolveTarget(sessionId, targetFor(sessionId, target)),
    launch: async (sessionId, selectorId, selection) => {
      await sidebar.openTabIn(sessionId, selectorId, { ...(selection === undefined ? {} : { descriptor: selection }) })
    },
    registerRestorer: (viewId, restore) => sidebar.registerLifecycle(viewId, {
      restore: async context => {
        const envelope = resourceViewEnvelope(context.descriptor)
        const restored = await restore({ sessionId: context.sessionId, instanceId: envelope.instanceId, descriptor: envelope.descriptor, signal: context.signal })
        return lifecycleFor(context.sessionId, restored ?? {})
      },
    }),
    close: async (sessionId, viewId) => { await sidebar.closeIn(sessionId, tabFor(sessionId, viewId).id) },
  }
}
