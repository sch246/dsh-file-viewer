import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { RightSidebarService } from '@dsh-external/dsh-right-sidebar/client'
import type { FileViewerClientService } from './contract.ts'
import {
  FileViewerService, type FileViewerDocumentRef, type FileViewerSource,
} from './service.ts'

/** Build the frozen public face over the sole document-state owner. */
export function createFileViewerClientService(
  runtime: FileViewerService,
  rightSidebar: RightSidebarService,
): FileViewerClientService {
  return Object.freeze({
    registerSource: (source: FileViewerSource) => runtime.registerSource(source),
    open: async (ref: FileViewerDocumentRef): Promise<void> => {
      const loading = runtime.open(ref)
      try {
        rightSidebar.openTab(ref.sessionId, 'files')
      } catch (error: unknown) {
        await loading
        throw error
      }
      await loading
    },
    snapshot: (sessionId: SessionId) => runtime.snapshot(sessionId),
    subscribe: (sessionId: SessionId, listener: () => void) => runtime.subscribe(sessionId, listener),
    edit: (sessionId: SessionId, text: string) => { runtime.edit(sessionId, text) },
    save: (sessionId: SessionId) => runtime.save(sessionId),
    refresh: (sessionId: SessionId) => runtime.refresh(sessionId),
    openExternal: (sessionId: SessionId) => runtime.openExternal(sessionId),
  })
}
