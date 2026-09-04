import type { SessionId } from '@deepseek-ai/dsh-session/types'

/** Stable source identifier contributed by a content adapter. */
export type FileViewerSourceId = string & { readonly __fileViewerSourceId: unique symbol }

/** Brand a source id after the contributing plugin validates its own namespace. */
export function FileViewerSourceId(value: string): FileViewerSourceId {
  if (value.trim() === '') throw new Error('file-viewer: source id must not be empty')
  return value as FileViewerSourceId
}

/** Identity of a document within one Session and source. */
export interface FileViewerDocumentRef {
  readonly sessionId: SessionId
  readonly sourceId: FileViewerSourceId
  readonly resourceId: string
}

/** Loaded source content with an opaque source-owned save token. */
export interface FileViewerLoadedText {
  readonly text: string
  readonly version?: unknown
  readonly title?: string
}

/** Source save result. The returned version becomes the next save guard. */
export interface FileViewerSavedText {
  readonly version?: unknown
}

/** One pluggable content source. Browser-memory sources may retain all data in closures. */
export interface FileViewerSource {
  readonly id: FileViewerSourceId
  load(ref: FileViewerDocumentRef, signal: AbortSignal): Promise<FileViewerLoadedText>
  save?(ref: FileViewerDocumentRef, text: string, version: unknown, signal: AbortSignal): Promise<FileViewerSavedText>
  openExternal?(ref: FileViewerDocumentRef, signal: AbortSignal): Promise<void>
}

/** Stable operation failure codes suitable for locale-owned presentation. */
export type FileViewerErrorCode =
  | 'source-unavailable'
  | 'load-failed'
  | 'save-unsupported'
  | 'save-failed'
  | 'refresh-dirty'
  | 'external-open-unsupported'
  | 'external-open-failed'

/** One operation failure retained in the Session snapshot. */
export interface FileViewerFailure {
  readonly code: FileViewerErrorCode
  readonly message?: string
}

/** Stable rejection raised after the corresponding failed snapshot is published. */
export class FileViewerOpenError extends Error {
  constructor(readonly failure: FileViewerFailure, options?: ErrorOptions) {
    super(`file-viewer: ${failure.code}${failure.message === undefined ? '' : `: ${failure.message}`}`, options)
    this.name = 'FileViewerOpenError'
  }
}

export type FileViewerSessionSnapshot =
  | { readonly status: 'idle' }
  | { readonly status: 'loading'; readonly ref: FileViewerDocumentRef }
  | { readonly status: 'failed'; readonly ref: FileViewerDocumentRef; readonly failure: FileViewerFailure }
  | {
    readonly status: 'ready'
    readonly ref: FileViewerDocumentRef
    readonly title: string
    readonly text: string
    readonly baseline: string
    readonly version?: unknown
    readonly saving: boolean
    readonly saveSupported: boolean
    readonly externalOpenSupported: boolean
    readonly failure?: FileViewerFailure
  }

type ReadySnapshot = Extract<FileViewerSessionSnapshot, { status: 'ready' }>

interface SessionRecord {
  snapshot: FileViewerSessionSnapshot
  generation: number
  controller?: AbortController
  externalGeneration: number
  externalController?: AbortController
  listeners: Set<() => void>
}

interface SessionOperation {
  readonly generation: number
  readonly controller: AbortController
}

/** True when editor text differs from the last loaded or saved baseline. */
export function isFileViewerDirty(snapshot: FileViewerSessionSnapshot): boolean {
  return snapshot.status === 'ready' && snapshot.text !== snapshot.baseline
}

function errorMessage(error: unknown): string | undefined {
  const message = error instanceof Error ? error.message : String(error)
  return message === '' ? undefined : message
}

/**
 * Authoritative browser document registry, per-Session state, and actions.
 * Consumers receive intent-level methods; no writable store is exported.
 */
export class FileViewerService {
  private readonly sources = new Map<FileViewerSourceId, FileViewerSource>()
  private readonly sessions = new Map<SessionId, SessionRecord>()
  private disposed = false

  /** Register a source until the returned disposer runs. */
  registerSource(source: FileViewerSource): () => void {
    this.assertLive()
    if (this.sources.has(source.id)) throw new Error(`file-viewer: duplicate source "${source.id}"`)
    this.sources.set(source.id, source)
    let active = true
    return () => {
      if (!active) return
      active = false
      if (this.sources.get(source.id) !== source) return
      this.sources.delete(source.id)
      for (const record of this.sessions.values()) {
        const ref = 'ref' in record.snapshot ? record.snapshot.ref : undefined
        if (ref?.sourceId !== source.id) continue
        this.invalidate(record, new Error('source unloaded'))
        record.snapshot = {
          status: 'failed',
          ref,
          failure: { code: 'source-unavailable' },
        }
        this.notify(record)
      }
    }
  }

  /** Read the immutable current snapshot for one Session. */
  snapshot(sessionId: SessionId): FileViewerSessionSnapshot {
    this.assertLive()
    return this.record(sessionId).snapshot
  }

  /** Subscribe to one Session; the disposer removes only this listener. */
  subscribe(sessionId: SessionId, listener: () => void): () => void {
    this.assertLive()
    const listeners = this.record(sessionId).listeners
    listeners.add(listener)
    return () => { listeners.delete(listener) }
  }

  /** Load a document, ignoring every completion superseded by a later operation. */
  async open(ref: FileViewerDocumentRef): Promise<void> {
    this.assertLive()
    const source = this.sources.get(ref.sourceId)
    const record = this.record(ref.sessionId)
    const operation = this.begin(record)
    record.snapshot = { status: 'loading', ref }
    this.notify(record)
    if (source === undefined) {
      this.finish(record, operation)
      record.snapshot = { status: 'failed', ref, failure: { code: 'source-unavailable' } }
      this.notify(record)
      throw new FileViewerOpenError(record.snapshot.failure)
    }
    try {
      const loaded = await source.load(ref, operation.controller.signal)
      if (!this.isCurrent(record, operation)) return
      record.snapshot = {
        status: 'ready',
        ref,
        title: loaded.title ?? ref.resourceId,
        text: loaded.text,
        baseline: loaded.text,
        ...(loaded.version === undefined ? {} : { version: loaded.version }),
        saving: false,
        saveSupported: source.save !== undefined,
        externalOpenSupported: source.openExternal !== undefined,
      }
      this.notify(record)
    } catch (error: unknown) {
      if (!this.isCurrent(record, operation)) return
      const failure = { code: 'load-failed', message: errorMessage(error) } as const
      record.snapshot = { status: 'failed', ref, failure }
      this.notify(record)
      throw new FileViewerOpenError(failure, { cause: error })
    } finally {
      this.finish(record, operation)
    }
  }

  /** Replace editor text for the currently-ready document. */
  edit(sessionId: SessionId, text: string): void {
    this.assertLive()
    const record = this.record(sessionId)
    if (record.snapshot.status !== 'ready') return
    record.snapshot = { ...record.snapshot, text, failure: undefined }
    this.notify(record)
  }

  /** Save through the selected source, retaining dirty text on every failure. */
  async save(sessionId: SessionId): Promise<void> {
    this.assertLive()
    const record = this.record(sessionId)
    const current = record.snapshot
    if (current.status !== 'ready') return
    const source = this.sources.get(current.ref.sourceId)
    if (source?.save === undefined) {
      record.snapshot = { ...current, failure: { code: 'save-unsupported' } }
      this.notify(record)
      return
    }
    const operation = this.begin(record)
    const savedText = current.text
    record.snapshot = { ...current, saving: true, failure: undefined }
    this.notify(record)
    try {
      const saved = await source.save(current.ref, savedText, current.version, operation.controller.signal)
      if (!this.isCurrent(record, operation)) return
      const latest = this.readySnapshot(record)
      record.snapshot = {
        ...latest,
        baseline: savedText,
        ...(saved.version === undefined ? { version: current.version } : { version: saved.version }),
        saving: false,
        failure: undefined,
      }
      this.notify(record)
    } catch (error: unknown) {
      if (!this.isCurrent(record, operation)) return
      const latest = this.readySnapshot(record)
      record.snapshot = {
        ...latest,
        saving: false,
        failure: { code: 'save-failed', message: errorMessage(error) },
      }
      this.notify(record)
    } finally {
      this.finish(record, operation)
    }
  }

  /** Reload the current document only when it has no unsaved edits. */
  async refresh(sessionId: SessionId): Promise<void> {
    this.assertLive()
    const current = this.snapshot(sessionId)
    if (current.status !== 'ready') return
    if (isFileViewerDirty(current)) {
      const record = this.record(sessionId)
      record.snapshot = { ...current, failure: { code: 'refresh-dirty' } }
      this.notify(record)
      return
    }
    await this.open(current.ref)
  }

  /** Ask the selected source to open its resource outside the browser. */
  async openExternal(sessionId: SessionId): Promise<void> {
    this.assertLive()
    const record = this.record(sessionId)
    const current = record.snapshot
    if (current.status !== 'ready') return
    const source = this.sources.get(current.ref.sourceId)
    if (source?.openExternal === undefined) {
      record.snapshot = { ...current, failure: { code: 'external-open-unsupported' } }
      this.notify(record)
      return
    }
    const operation = this.beginExternal(record)
    if (current.failure !== undefined) {
      record.snapshot = { ...current, failure: undefined }
      this.notify(record)
    }
    try {
      await source.openExternal(current.ref, operation.controller.signal)
    } catch (error: unknown) {
      if (!this.isCurrentExternal(record, operation)) return
      const latest = this.readySnapshot(record)
      record.snapshot = { ...latest, failure: { code: 'external-open-failed', message: errorMessage(error) } }
      this.notify(record)
    } finally {
      this.finishExternal(record, operation)
    }
  }

  /** Abort in-flight work and invalidate the service. */
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    for (const record of this.sessions.values()) {
      record.listeners.clear()
      this.invalidate(record, new Error('file viewer disposed'))
    }
    this.sources.clear()
    this.sessions.clear()
  }

  private record(sessionId: SessionId): SessionRecord {
    let record = this.sessions.get(sessionId)
    if (record === undefined) {
      record = {
        snapshot: { status: 'idle' },
        generation: 0,
        externalGeneration: 0,
        listeners: new Set(),
      }
      this.sessions.set(sessionId, record)
    }
    return record
  }

  private begin(record: SessionRecord): SessionOperation {
    record.generation += 1
    record.externalGeneration += 1
    record.controller?.abort(new Error('superseded'))
    record.externalController?.abort(new Error('superseded'))
    const operation = { generation: record.generation, controller: new AbortController() }
    record.controller = operation.controller
    record.externalController = undefined
    return operation
  }

  private beginExternal(record: SessionRecord): SessionOperation {
    record.externalGeneration += 1
    record.externalController?.abort(new Error('superseded'))
    const operation = { generation: record.externalGeneration, controller: new AbortController() }
    record.externalController = operation.controller
    return operation
  }

  private invalidate(record: SessionRecord, reason: Error): void {
    record.generation += 1
    record.externalGeneration += 1
    record.controller?.abort(reason)
    record.externalController?.abort(reason)
    record.controller = undefined
    record.externalController = undefined
  }

  private isCurrent(record: SessionRecord, operation: SessionOperation): boolean {
    return !this.disposed
      && record.generation === operation.generation
      && record.controller === operation.controller
      && !operation.controller.signal.aborted
  }

  private isCurrentExternal(record: SessionRecord, operation: SessionOperation): boolean {
    return !this.disposed
      && record.externalGeneration === operation.generation
      && record.externalController === operation.controller
      && !operation.controller.signal.aborted
  }

  private finish(record: SessionRecord, operation: SessionOperation): void {
    if (record.controller === operation.controller) record.controller = undefined
  }

  private finishExternal(record: SessionRecord, operation: SessionOperation): void {
    if (record.externalController === operation.controller) record.externalController = undefined
  }

  /** Return the ready state after the caller proves its operation generation is current. */
  private readySnapshot(record: SessionRecord): ReadySnapshot {
    return record.snapshot as ReadySnapshot
  }

  private notify(record: SessionRecord): void {
    for (const listener of record.listeners) {
      try { listener() } catch { /* A subscriber cannot starve later subscribers. */ }
    }
  }

  private assertLive(): void {
    if (this.disposed) throw new Error('file-viewer: service is disposed')
  }
}
