import type { RightSidebarService } from '@dsh-external/dsh-right-sidebar/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { ResourceBytesWatchEvent, ResourceAutomationPreferences } from './resource.ts'
import type {
  ResourceDescriptor,
  ResourceHandler,
  ResourceHandlerId,
  ResourceOpenOptions,
  ResourceSource,
  ResourceWorkbenchClientService,
} from './resource.ts'
import {
  ResourceWorkbenchRuntime,
  type ResourceViewHost,
} from './workbench.ts'

/** @param rightSidebar Right-sidebar service. @returns Resource-view host adapter. */
export function createResourceViewHost(rightSidebar: RightSidebarService): ResourceViewHost {
  return {
    open: (sessionId, input, options) => rightSidebar.openInstance(sessionId, input, options),
    activate: (sessionId, viewId) => { rightSidebar.activateInstance(sessionId, viewId) },
    update: (sessionId, viewId, update) => {
      rightSidebar.updateInstance(sessionId, viewId, update)
    },
    pin: (sessionId, viewId) => { rightSidebar.pinInstance(sessionId, viewId) },
    group: (sessionId, viewId) => rightSidebar.getInstanceGroup(sessionId, viewId),
    resolveTarget: (sessionId, target) => rightSidebar.resolveTarget(sessionId, target),
    launch: (sessionId, selectorId, selection) => rightSidebar.launch(sessionId, selectorId, selection),
    registerRestorer: (viewId, restore) => rightSidebar.registerRestorer(viewId, context => restore({
      sessionId: context.sessionId as SessionId,
      instanceId: context.instanceId,
      descriptor: context.descriptor,
    })),
    close: (sessionId, viewId) => rightSidebar.closeInstance(sessionId, viewId),
  }
}

/** @param runtime Sole resource-workbench runtime. @returns Frozen public resource service. */
export function createResourceWorkbenchClientService(
  runtime: ResourceWorkbenchRuntime,
): ResourceWorkbenchClientService {
  return Object.freeze({
    registerSource: (source: ResourceSource) => runtime.registerSource(source),
    registerHandler: (handler: ResourceHandler) => runtime.registerHandler(handler),
    open: (descriptor: ResourceDescriptor, options?: ResourceOpenOptions) => runtime.open(descriptor, options),
    listOpenWith: (descriptor: ResourceDescriptor) => runtime.listOpenWith(descriptor),
    switchHandler: (viewId: string, handlerId: ResourceHandlerId) => runtime.switchHandler(viewId, handlerId),
    setAssociation: (descriptor: ResourceDescriptor, handlerId: ResourceHandlerId | undefined) => {
      runtime.setAssociation(descriptor, handlerId)
    },
    snapshot: (viewId: string) => runtime.snapshot(viewId),
    subscribe: (viewId: string, listener: () => void) => runtime.subscribe(viewId, listener),
    loadHandler: (viewId: string) => runtime.loadHandler(viewId),
    readBytes: (viewId: string, signal: AbortSignal) => runtime.readBytes(viewId, signal),
    writeBytes: (viewId: string, bytes: Uint8Array, version: unknown, signal: AbortSignal) =>
      runtime.writeBytes(viewId, bytes, version, signal),
    watchBytes: (viewId: string, listener: (event: ResourceBytesWatchEvent) => void) => runtime.watchBytes(viewId, listener),
    markEdited: (viewId: string) => { runtime.markEdited(viewId) },
    registerCloseGuard: (viewId: string, guard: () => boolean | Promise<boolean>) => runtime.registerCloseGuard(viewId, guard),
    textDocumentId: (viewId: string) => runtime.textDocumentId(viewId),
    textSnapshot: (viewId: string) => runtime.textSnapshot(viewId),
    subscribeText: (viewId: string, listener: () => void) => runtime.subscribeText(viewId, listener),
    editText: (viewId: string, text: string) => { runtime.editText(viewId, text) },
    saveText: (viewId: string) => runtime.saveText(viewId),
    refreshText: (viewId: string) => runtime.refreshText(viewId),
    overwriteSourceText: (viewId: string) => runtime.overwriteSourceText(viewId),
    discardLocalText: (viewId: string) => { runtime.discardLocalText(viewId) },
    setTextAutomation: (viewId: string, name: 'autoUpdate' | 'autoSave', enabled: boolean | undefined) => {
      runtime.setTextAutomation(viewId, name, enabled)
    },
    automationDefaults: () => runtime.automationDefaults(),
    setGlobalAutomation: (name: keyof ResourceAutomationPreferences, enabled: boolean) => {
      runtime.setGlobalAutomation(name, enabled)
    },
    getViewState: (viewId: string, handlerId: ResourceHandlerId) => runtime.getViewState(viewId, handlerId),
    setViewState: (viewId: string, handlerId: ResourceHandlerId, state: unknown) => {
      runtime.setViewState(viewId, handlerId, state)
    },
    selectLocation: (viewId: string, selection?: unknown) => runtime.selectLocation(viewId, selection),
    openExternal: (viewId: string) => runtime.openExternal(viewId),
    close: (viewId: string) => runtime.close(viewId),
  })
}
