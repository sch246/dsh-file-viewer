/** Bind the workbench's required host operations to the installed sidebar provider. */
import type { Context } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { openWorkspaceFile } from '@deepseek-ai/dsh-client-ui-chat/client'
import type {} from '@dsh-external/dsh-right-sidebar/client'
import type { ResourceViewHost } from './host.ts'

/** @param ctx Client context with sidebar, sessions and remote.session injected. @returns Resource-view host adapter. */
export function createResourceViewHost(ctx: Context): ResourceViewHost {
  const sidebar = ctx.rightSidebar
  return {
    openWorkspaceFile: request => openWorkspaceFile(ctx, request),
    open: (sessionId, input, options) => sidebar.openInstance(sessionId, input, options),
    beginNavigation: (sessionId, options) => sidebar.beginNavigation(sessionId, options),
    update: (sessionId, viewId, update) => { sidebar.updateInstance(sessionId, viewId, update) },
    pin: (sessionId, viewId) => { sidebar.pinInstance(sessionId, viewId) },
    group: (sessionId, viewId) => sidebar.getInstanceGroup(sessionId, viewId),
    resolveTarget: (sessionId, target) => sidebar.resolveTarget(sessionId, target),
    launch: (sessionId, selectorId, selection) => sidebar.launch(sessionId, selectorId, selection),
    registerRestorer: (viewId, restore) => sidebar.registerRestorer(viewId, context => restore({
      sessionId: context.sessionId as SessionId,
      instanceId: context.instanceId,
      descriptor: context.descriptor,
    })),
    close: (sessionId, viewId) => sidebar.closeInstance(sessionId, viewId),
  }
}
