import type { Context } from '@deepseek-ai/cordis'
import type { FsTarget, FsVersion } from '@deepseek-ai/dsh-fs'
import { FsError } from '@deepseek-ai/dsh-fs'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type {
  WorkspaceLoadRequest, WorkspaceSaveRequest, WorkspaceSaveResult, WorkspaceTextDocument,
} from './types.ts'

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    /** The Session has no workspace cwd. */
    'file-viewer/no-workspace': { readonly sessionId: SessionId }
    /** The requested path resolves outside the Session workspace. */
    'file-viewer/outside-workspace': { readonly path: string }
    /** The requested path does not identify a regular file. */
    'file-viewer/not-regular-file': { readonly path: string }
    /** The requested file exceeds the configured complete-read limit. */
    'file-viewer/too-large': { readonly path: string; readonly maxReadBytes: number }
    /** The provider rejected the file as non-text. */
    'file-viewer/not-text': { readonly path: string }
    /** The file changed after it was loaded. */
    'file-viewer/stale-version': { readonly path: string }
    /** The Session or file does not exist. */
    'file-viewer/not-found': { readonly sessionId: SessionId; readonly path: string }
  }
}

interface ResolvedWorkspaceFile {
  readonly target: FsTarget
  readonly version: FsVersion
}

/** Host-side workspace text Remote backed exclusively by `ctx.fs`. */
export class FileViewerWorkspaceRemote extends TypertRemoteService {
  /**
   * @param ctx - Host plugin context.
   * @param maxReadBytes - Inclusive configured limit for a complete text read.
   */
  constructor(
    ctx: Context,
    private readonly maxReadBytes: number,
    private readonly configuredOpenMode: 'preview' | 'system' | 'preview-or-system',
  ) {
    super(ctx, 'fileViewerWorkspace', { namespace: 'fileViewerWorkspace' })
  }

  /** Return the Host-owned chat file-click policy. */
  @Remote('openMode')
  openMode(): 'preview' | 'system' | 'preview-or-system' {
    return this.configuredOpenMode
  }

  private async cwdOf(sessionId: SessionId, signal: AbortSignal): Promise<string> {
    signal.throwIfAborted()
    const live = this.ctx.sessions.get(sessionId)
    const header = live?.header ?? (await this.ctx.sessionPersistence.inspect(sessionId, signal).catch((error: unknown) => {
      if (signal.aborted) throw signal.reason
      throw new RemoteError('file-viewer/not-found', `session "${sessionId}" was not found`, {
        sessionId,
        path: '',
      }, { cause: error })
    })).meta
    if (header.cwd === undefined) {
      throw new RemoteError('file-viewer/no-workspace', `session "${sessionId}" has no workspace`, { sessionId })
    }
    return header.cwd
  }

  private async resolveFile(
    sessionId: SessionId,
    path: string,
    signal: AbortSignal,
  ): Promise<ResolvedWorkspaceFile> {
    const cwd = await this.cwdOf(sessionId, signal)
    signal.throwIfAborted()
    const pathInfo = await this.ctx.fs.lstat(path, { cwd }, signal)
    if (pathInfo === undefined) {
      throw new RemoteError('file-viewer/not-found', `workspace path "${path}" was not found`, { sessionId, path })
    }
    if (pathInfo.type !== 'file') {
      throw new RemoteError('file-viewer/not-regular-file', `workspace path "${path}" is not a regular file`, { path })
    }
    const [root, target] = await Promise.all([
      this.ctx.fs.resolve(cwd, { signal }),
      this.ctx.fs.resolve(path, { cwd, signal }),
    ])
    if (!this.ctx.fs.contains(root, target)) {
      throw new RemoteError('file-viewer/outside-workspace', `workspace path "${path}" escapes the workspace`, { path })
    }
    const info = await this.ctx.fs.stat(target, signal)
    if (info === undefined) {
      throw new RemoteError('file-viewer/not-found', `workspace path "${path}" was not found`, { sessionId, path })
    }
    if (info.type !== 'file') {
      throw new RemoteError('file-viewer/not-regular-file', `workspace path "${path}" is not a regular file`, { path })
    }
    if (info.size !== undefined && info.size > this.maxReadBytes) {
      throw new RemoteError('file-viewer/too-large', `workspace path "${path}" exceeds the preview limit`, {
        path,
        maxReadBytes: this.maxReadBytes,
      })
    }
    return { target, version: info.version }
  }

  /**
   * Load one regular UTF-8 workspace file and its opaque version.
   * @param request - Session and relative or workspace path.
   * @param signal - Cancels persistence and filesystem work.
   * @returns file text and the exact version required by save.
   */
  @Remote('load')
  async load(request: WorkspaceLoadRequest, signal: AbortSignal): Promise<WorkspaceTextDocument> {
    const resolved = await this.resolveFile(request.sessionId, request.path, signal)
    try {
      const text = await this.ctx.fs.readText(resolved.target, signal)
      if (new TextEncoder().encode(text).byteLength > this.maxReadBytes) {
        throw new RemoteError('file-viewer/too-large', `workspace path "${request.path}" exceeds the preview limit`, {
          path: request.path,
          maxReadBytes: this.maxReadBytes,
        })
      }
      return { path: request.path, text, version: resolved.version }
    } catch (error: unknown) {
      if (error instanceof RemoteError) throw error
      if (error instanceof FsError && error.code === 'FS_NOT_TEXT') {
        throw new RemoteError('file-viewer/not-text', `workspace path "${request.path}" is not text`, {
          path: request.path,
        }, { cause: error })
      }
      throw error
    }
  }

  /**
   * Atomically replace a workspace text file when its opaque version still matches.
   * @param request - Session path, complete text, and exact version returned by load.
   * @param signal - Cancels work before atomic publication.
   * @returns the opaque post-write version.
   */
  @Remote('save')
  async save(request: WorkspaceSaveRequest, signal: AbortSignal): Promise<WorkspaceSaveResult> {
    const resolved = await this.resolveFile(request.sessionId, request.path, signal)
    try {
      const result = await this.ctx.fs.writeText(
        resolved.target,
        request.text,
        { kind: 'replaceIfVersion', version: request.version },
        signal,
      )
      return { version: result.version }
    } catch (error: unknown) {
      if (error instanceof FsError && error.code === 'FS_STALE_VERSION') {
        throw new RemoteError('file-viewer/stale-version', `workspace path "${request.path}" changed on disk`, {
          path: request.path,
        }, { cause: error })
      }
      throw error
    }
  }
}
