import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { RemoteResult, TypertClientRemote } from '@deepseek-ai/dsh-typert-protocol'
import { resolveWorkspacePath } from '@deepseek-ai/dsh-util-workspace-path'
import type { WorkspaceSaveRequest } from '../types.ts'
import {
  FileViewerSourceId, type FileViewerSource,
} from './service.ts'

/** Dependencies that keep generated transport and Client Session state outside the source. */
export interface WorkspaceSourceDependencies {
  readonly workspace: Pick<TypertClientRemote['fileViewerWorkspace'], 'load' | 'save'>
  readonly session: Pick<TypertClientRemote['session'], 'openWorkspacePath'>
  readonly cwdOf: (sessionId: SessionId) => string | undefined
  /** Read the latest optional native-opener capability without gating source registration. */
  readonly externalOpenSupported: () => boolean
}

function valueOf<T>(result: RemoteResult<T>): T {
  if (result.ok) return result.value
  throw result.error
}

function assertWorkspaceVersion(
  version: unknown,
): asserts version is WorkspaceSaveRequest['version'] {
  if (version === undefined) {
    throw new Error('file-viewer: workspace save requires the opaque version returned by load')
  }
}

/** Create the built-in Session-workspace text source. */
export function createWorkspaceSource(dependencies: WorkspaceSourceDependencies): FileViewerSource {
  const id = FileViewerSourceId('workspace')
  const openExternal: NonNullable<FileViewerSource['openExternal']> = async (ref, signal) => {
    valueOf(await dependencies.session.openWorkspacePath({
      path: resolveWorkspacePath(dependencies.cwdOf(ref.sessionId), ref.resourceId),
    }, signal))
  }
  const source: FileViewerSource = {
    id,
    load: async (ref, signal) => {
      const value = valueOf(await dependencies.workspace.load({
        sessionId: ref.sessionId,
        path: ref.resourceId,
      }, signal))
      return { text: value.text, title: value.path, version: value.version }
    },
    save: async (ref, text, version, signal) => {
      assertWorkspaceVersion(version)
      const value = valueOf(await dependencies.workspace.save({
        sessionId: ref.sessionId,
        path: ref.resourceId,
        text,
        version,
      }, signal))
      return { version: value.version }
    },
  }
  Object.defineProperty(source, 'openExternal', {
    enumerable: true,
    get: () => dependencies.externalOpenSupported() ? openExternal : undefined,
  })
  return source
}
