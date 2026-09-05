import type {
  FileViewerAutomationPreferences,
  FileViewerDocumentRef,
  FileViewerInstanceSnapshot,
  FileViewerSource,
} from './service.ts'

/** Frozen browser service exposed as `ctx.fileViewer`. */
export interface FileViewerClientService {
  /** Register one source until the returned disposer runs. */
  registerSource(source: FileViewerSource): () => void
  /** Open a new instance, or activate the existing instance for the exact resource. */
  open(ref: FileViewerDocumentRef): Promise<string>
  /** Read one immutable editor-instance snapshot. */
  snapshot(instanceId: string): FileViewerInstanceSnapshot
  /** Subscribe to one editor instance. */
  subscribe(instanceId: string, listener: () => void): () => void
  /** Replace one ready instance's local text. */
  edit(instanceId: string, text: string): void
  /** Save local text through the source. */
  save(instanceId: string): Promise<void>
  /** Observe the latest source text without discarding local edits. */
  refresh(instanceId: string): Promise<void>
  /** Publish local text against the latest observed source revision. */
  overwriteSource(instanceId: string): Promise<void>
  /** Replace local text with the latest observed source text. */
  discardLocal(instanceId: string): void
  /** Change one persisted automatic update or save preference. */
  setAutomation(
    instanceId: string,
    name: keyof FileViewerAutomationPreferences,
    enabled: boolean,
  ): void
  /** Ask the source location selector to reveal a provider-owned location. */
  selectLocation(instanceId: string, selection?: unknown): Promise<void>
  /** Open the resource through its optional source action. */
  openExternal(instanceId: string): Promise<void>
  /** Ask the sidebar to close an instance, retaining it when dirty close is rejected. */
  close(instanceId: string): Promise<void>
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Source-neutral text editor API; source and instance stores remain private. */
    fileViewer: FileViewerClientService
  }
}
