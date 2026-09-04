import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type {
  FileViewerDocumentRef, FileViewerSessionSnapshot, FileViewerSource,
} from './service.ts'

/** Frozen browser service exposed as `ctx.fileViewer`. */
export interface FileViewerClientService {
  /** Register one source until the returned disposer runs. */
  registerSource(source: FileViewerSource): () => void
  /** Load a document and reveal the Session's Files tab. */
  open(ref: FileViewerDocumentRef): Promise<void>
  /** Read the current immutable snapshot for one Session. */
  snapshot(sessionId: SessionId): FileViewerSessionSnapshot
  /** Subscribe to snapshot changes for one Session. */
  subscribe(sessionId: SessionId, listener: () => void): () => void
  /** Replace the ready document's browser text. */
  edit(sessionId: SessionId, text: string): void
  /** Save the ready document when its source supports writes. */
  save(sessionId: SessionId): Promise<void>
  /** Reload a clean ready document from its source. */
  refresh(sessionId: SessionId): Promise<void>
  /** Open the ready resource through its source's external action. */
  openExternal(sessionId: SessionId): Promise<void>
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** File viewer intent API; source and Session stores remain private. */
    fileViewer: FileViewerClientService
  }
}
