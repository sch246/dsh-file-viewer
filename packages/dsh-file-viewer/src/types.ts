import type { FsVersion } from '@deepseek-ai/dsh-fs'
import type { SessionId } from '@deepseek-ai/dsh-session/types'

/** Text file returned by the Host workspace source. */
export interface WorkspaceTextDocument {
  /** Path relative to the immutable Session workspace. */
  readonly path: string
  /** UTF-8 text content. */
  readonly text: string
  /** Opaque filesystem version used by guarded replacement. */
  readonly version: FsVersion
}

/** Successful guarded workspace write. */
export interface WorkspaceSaveResult {
  /** Opaque filesystem version after publication. */
  readonly version: FsVersion
}

/** Host request identifying one Session workspace path. */
export interface WorkspaceLoadRequest {
  readonly sessionId: SessionId
  readonly path: string
}

/** Host write request carrying the exact version observed by load. */
export interface WorkspaceSaveRequest extends WorkspaceLoadRequest {
  readonly text: string
  readonly version: FsVersion
}
