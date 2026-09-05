import type { RightSidebarService } from '@dsh-external/dsh-right-sidebar/client'
import type { FileViewerClientService } from './contract.ts'
import {
  FileViewerService,
  type FileViewerAutomationPreferences,
  type FileViewerDocumentRef,
  type FileViewerInstanceHost,
  type FileViewerSource,
} from './service.ts'

/** Static renderer id shared by every file-viewer workbench instance. */
export const FILE_VIEWER_VIEW_ID = 'text-editor'

/** Adapt the right-sidebar workbench to the runtime's instance lifecycle. */
export function createFileViewerInstanceHost(
  rightSidebar: RightSidebarService,
): FileViewerInstanceHost {
  return {
    open: (instanceId, ref, title, onClose) => {
      rightSidebar.openInstance(ref.sessionId, {
        id: instanceId,
        viewId: FILE_VIEWER_VIEW_ID,
        title,
        onClose,
      })
    },
    activate: (instanceId, sessionId) => {
      rightSidebar.activateInstance(sessionId, instanceId)
    },
    update: (instanceId, sessionId, title) => {
      rightSidebar.updateInstance(sessionId, instanceId, { title })
    },
    launch: async (sessionId, selectorId, selection) => {
      await rightSidebar.launch(sessionId, selectorId, selection)
    },
  }
}

/** Build the frozen public face over the sole document-state owner. */
export function createFileViewerClientService(
  runtime: FileViewerService,
  rightSidebar: RightSidebarService,
): FileViewerClientService {
  return Object.freeze({
    registerSource: (source: FileViewerSource) => runtime.registerSource(source),
    open: (ref: FileViewerDocumentRef) => runtime.open(ref),
    snapshot: (instanceId: string) => runtime.snapshot(instanceId),
    subscribe: (instanceId: string, listener: () => void) => runtime.subscribe(instanceId, listener),
    edit: (instanceId: string, text: string) => { runtime.edit(instanceId, text) },
    save: (instanceId: string) => runtime.save(instanceId),
    refresh: (instanceId: string) => runtime.refresh(instanceId),
    overwriteSource: (instanceId: string) => runtime.overwriteSource(instanceId),
    discardLocal: (instanceId: string) => { runtime.discardLocal(instanceId) },
    setAutomation: (
      instanceId: string,
      name: keyof FileViewerAutomationPreferences,
      enabled: boolean,
    ) => {
      runtime.setAutomation(instanceId, name, enabled)
    },
    selectLocation: (instanceId: string, selection?: unknown) =>
      runtime.selectLocation(instanceId, selection),
    openExternal: (instanceId: string) => runtime.openExternal(instanceId),
    close: async (instanceId: string): Promise<void> => {
      const { sessionId } = runtime.snapshot(instanceId).ref
      await rightSidebar.closeInstance(sessionId, instanceId)
    },
  })
}
