import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import { resolveWorkspacePath } from '@deepseek-ai/dsh-util-workspace-path'
import type {
  WorkspaceLoadRequest, WorkspaceSaveRequest, WorkspaceSaveResult, WorkspaceTextDocument,
} from '../types.ts'
import {
  FileViewerSourceId, type FileViewerSource,
} from './service.ts'

/** Generated-Remote method shape consumed by the workspace adapter. */
export interface FileViewerWorkspaceRemoteClient {
  load(request: WorkspaceLoadRequest, signal?: AbortSignal): Promise<RemoteResult<WorkspaceTextDocument>>
  save(request: WorkspaceSaveRequest, signal?: AbortSignal): Promise<RemoteResult<WorkspaceSaveResult>>
}

/** Existing native Session path-open methods consumed by the workspace adapter. */
export interface SessionPathRemoteClient {
  canOpenWorkspacePath(): Promise<RemoteResult<boolean>>
  openWorkspacePath(
    request: { readonly path: string },
    signal?: AbortSignal,
  ): Promise<RemoteResult<{ readonly opened: true }>>
}

/** Dependencies that keep generated transport and Client Session state outside the source. */
export interface WorkspaceSourceDependencies {
  readonly workspace: FileViewerWorkspaceRemoteClient
  readonly session: SessionPathRemoteClient
  readonly cwdOf: (sessionId: SessionId) => string | undefined
  readonly externalOpenSupported: boolean
}

function valueOf<T>(result: RemoteResult<T>): T {
  if (result.ok) return result.value
  throw result.error
}

/** Create the built-in Session-workspace text source. */
export function createWorkspaceSource(dependencies: WorkspaceSourceDependencies): FileViewerSource {
  const id = FileViewerSourceId('workspace')
  return {
    id,
    load: async (ref, signal) => {
      const value = valueOf(await dependencies.workspace.load({
        sessionId: ref.sessionId,
        path: ref.resourceId,
      }, signal))
      return { text: value.text, title: value.path, version: value.version }
    },
    save: async (ref, text, version, signal) => {
      const value = valueOf(await dependencies.workspace.save({
        sessionId: ref.sessionId,
        path: ref.resourceId,
        text,
        version: version as WorkspaceSaveRequest['version'],
      }, signal))
      return { version: value.version }
    },
    ...(dependencies.externalOpenSupported
      ? {
          openExternal: async (ref, signal): Promise<void> => {
            valueOf(await dependencies.session.openWorkspacePath({
              path: resolveWorkspacePath(dependencies.cwdOf(ref.sessionId), ref.resourceId),
            }, signal))
          },
        }
      : {}),
  }
}
