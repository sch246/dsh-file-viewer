import type { SessionId } from '@deepseek-ai/dsh-session/types'

/** Stable source identifier contributed by a content adapter. */
export type FileViewerSourceId = string & { readonly __fileViewerSourceId: unique symbol }

/** Brand a non-empty source id. */
export function FileViewerSourceId(value: string): FileViewerSourceId {
  if (value.trim() === '') throw new Error('file-viewer: source id must not be empty')
  return value as FileViewerSourceId
}

/** Source-neutral identity of one document. */
export interface FileViewerDocumentRef {
  readonly sessionId: SessionId
  readonly sourceId: FileViewerSourceId
  readonly resourceId: string
}

/** Optional source-owned location projection. */
export interface FileViewerLocation {
  readonly label?: string
  readonly segments?: readonly { readonly label: string; readonly selectionHint?: unknown }[]
  readonly selectorId?: string
}

/** Canonical source text and its opaque revision. */
export interface FileViewerLoadedText {
  readonly text: string
  readonly version?: unknown
  readonly title?: string
  readonly location?: FileViewerLocation
}

/** Source save result. */
export interface FileViewerSavedText { readonly version?: unknown }

/** Source watch event. */
export type FileViewerWatchEvent =
  | { readonly kind: 'invalidate' }
  | { readonly kind: 'snapshot'; readonly snapshot: FileViewerLoadedText }

/** One pluggable text source. */
export interface FileViewerSource {
  readonly id: FileViewerSourceId
  load(ref: FileViewerDocumentRef, signal: AbortSignal): Promise<FileViewerLoadedText>
  save?(ref: FileViewerDocumentRef, text: string, version: unknown, signal: AbortSignal): Promise<FileViewerSavedText>
  /** True only when save rejects a revision mismatch without publishing. */
  readonly supportsConditionalSave?: boolean
  watch?(ref: FileViewerDocumentRef, listener: (event: FileViewerWatchEvent) => void): () => void
  openExternal?(ref: FileViewerDocumentRef, signal: AbortSignal): Promise<void>
}

/** Stable operation failure codes. */
export type FileViewerErrorCode = 'source-unavailable' | 'load-failed' | 'save-unsupported' | 'save-failed'
  | 'external-open-unsupported' | 'external-open-failed'

/** One retained operation failure. */
export interface FileViewerFailure { readonly code: FileViewerErrorCode; readonly message?: string }

/** Three-way synchronization relationship. */
export type FileViewerSyncStatus = 'synced' | 'local-ahead' | 'source-ahead' | 'diverged' | 'unknown'

/** Independently reported work in progress. */
export type FileViewerOperation = 'idle' | 'loading' | 'refreshing' | 'saving' | 'opening-external'

/** Per-resource automation preferences. */
export interface FileViewerAutomationPreferences { readonly autoUpdate: boolean; readonly autoSave: boolean }

interface CommonSnapshot {
  readonly instanceId: string
  readonly ref: FileViewerDocumentRef
  readonly title: string
  readonly operation: FileViewerOperation
  readonly failure?: FileViewerFailure
}

/** Immutable state for one editor instance. */
export type FileViewerInstanceSnapshot =
  | (CommonSnapshot & { readonly status: 'loading' | 'failed' })
  | (CommonSnapshot & {
    readonly status: 'ready'
    readonly text: string
    readonly localHash?: string
    readonly baseText: string
    readonly baseHash: string
    readonly baseVersion?: unknown
    readonly latestSourceText?: string
    readonly latestSourceHash?: string
    readonly latestSourceVersion?: unknown
    readonly sourceStale: boolean
    readonly syncStatus: FileViewerSyncStatus
    readonly saveSupported: boolean
    readonly conditionalSaveSupported: boolean
    readonly watchSupported: boolean
    readonly externalOpenSupported: boolean
    readonly location?: FileViewerLocation
    readonly automation: FileViewerAutomationPreferences
    readonly automationPaused: boolean
  })

type ReadySnapshot = Extract<FileViewerInstanceSnapshot, { status: 'ready' }>

/** Stable rejection raised after a failed initial load is published. */
export class FileViewerOpenError extends Error {
  constructor(readonly failure: FileViewerFailure, options?: ErrorOptions) {
    super(`file-viewer: ${failure.code}${failure.message === undefined ? '' : `: ${failure.message}`}`, options)
    this.name = 'FileViewerOpenError'
  }
}

/** Browser persistence subset used for automation preferences. */
export interface FileViewerPreferenceStorage { getItem(key: string): string | null; setItem(key: string, value: string): void }

/** Right-sidebar lifecycle used by instance controllers. */
export interface FileViewerInstanceHost {
  open(instanceId: string, ref: FileViewerDocumentRef, title: string, onClose: () => boolean | Promise<boolean>): void
  activate(instanceId: string, sessionId: SessionId): void
  update(instanceId: string, sessionId: SessionId, title: string): void
  launch(sessionId: SessionId, selectorId: string, selection?: unknown): Promise<void>
}

interface OperationState { generation: number; controller?: AbortController }
interface InstanceRecord {
  snapshot: FileViewerInstanceSnapshot
  listeners: Set<() => void>
  read: OperationState
  save: OperationState
  external: OperationState
  hashGeneration: number
  watchDispose?: () => void
  autoUpdateTimer?: ReturnType<typeof setTimeout>
  autoSaveTimer?: ReturnType<typeof setTimeout>
}

interface FileViewerServiceOptions {
  readonly host?: FileViewerInstanceHost
  readonly storage?: FileViewerPreferenceStorage
  readonly automationDebounceMs?: number
  readonly confirmDiscard?: (snapshot: ReadySnapshot) => boolean | Promise<boolean>
}

const DEFAULT_AUTOMATION = Object.freeze({ autoUpdate: false, autoSave: false })

/** Calculate the exact SHA-256 of canonical source text. */
export async function hashFileViewerText(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

/** True when local content differs from the common base. */
export function isFileViewerDirty(snapshot: FileViewerInstanceSnapshot): boolean {
  return snapshot.status === 'ready' && (snapshot.localHash === undefined || snapshot.localHash !== snapshot.baseHash)
}

function errorMessage(error: unknown): string | undefined {
  const message = error instanceof Error ? error.message : String(error)
  return message === '' ? undefined : message
}
function toFailure(code: FileViewerErrorCode, error: unknown): FileViewerFailure {
  const message = errorMessage(error)
  return { code, ...(message === undefined ? {} : { message }) }
}
function clearFailure<T extends { readonly failure?: FileViewerFailure }>(value: T): Omit<T, 'failure'> {
  const { failure: _failure, ...rest } = value
  return rest
}
function keyOf(ref: FileViewerDocumentRef): string { return JSON.stringify([ref.sessionId, ref.sourceId, ref.resourceId]) }
function preferenceKey(ref: FileViewerDocumentRef): string { return `dsh-file-viewer:automation:${JSON.stringify([ref.sourceId, ref.resourceId])}` }

function deriveSync(snapshot: ReadySnapshot): ReadySnapshot {
  if (snapshot.localHash === undefined || snapshot.latestSourceHash === undefined || snapshot.sourceStale) {
    return { ...snapshot, syncStatus: 'unknown' }
  }
  if (snapshot.localHash === snapshot.latestSourceHash) {
    return { ...snapshot, baseText: snapshot.text, baseHash: snapshot.localHash,
      ...(snapshot.latestSourceVersion === undefined ? {} : { baseVersion: snapshot.latestSourceVersion }), syncStatus: 'synced' }
  }
  if (snapshot.localHash === snapshot.baseHash) return { ...snapshot, syncStatus: 'source-ahead' }
  if (snapshot.latestSourceHash === snapshot.baseHash) return { ...snapshot, syncStatus: 'local-ahead' }
  return { ...snapshot, syncStatus: 'diverged' }
}

/** Authoritative registry for sources and independent document controllers. */
export class FileViewerService {
  private readonly sources = new Map<FileViewerSourceId, FileViewerSource>()
  private readonly instances = new Map<string, InstanceRecord>()
  private readonly refs = new Map<string, string>()
  private readonly host?: FileViewerInstanceHost
  private readonly storage?: FileViewerPreferenceStorage
  private readonly debounceMs: number
  private readonly confirmDiscard: (snapshot: ReadySnapshot) => boolean | Promise<boolean>
  private nextInstance = 0
  private disposed = false

  constructor(options: FileViewerServiceOptions = {}) {
    this.host = options.host
    this.storage = options.storage ?? (typeof localStorage === 'undefined' ? undefined : localStorage)
    this.debounceMs = options.automationDebounceMs ?? 700
    this.confirmDiscard = options.confirmDiscard ?? (() => false)
  }

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
      for (const record of this.instances.values()) {
        if (record.snapshot.ref.sourceId !== source.id) continue
        this.stop(record, new Error('source unloaded'))
        record.snapshot = { ...record.snapshot, status: 'failed', operation: 'idle', failure: { code: 'source-unavailable' } }
        this.notify(record)
      }
    }
  }

  /** Open a new instance, or activate the existing instance for the exact ref. */
  async open(ref: FileViewerDocumentRef): Promise<string> {
    this.assertLive()
    const existing = this.refs.get(keyOf(ref))
    if (existing !== undefined) {
      this.host?.activate(existing, ref.sessionId)
      return existing
    }
    const instanceId = `text-editor-${++this.nextInstance}`
    const record: InstanceRecord = {
      snapshot: { instanceId, ref, title: ref.resourceId, status: 'loading', operation: 'loading' },
      listeners: new Set(), read: { generation: 0 }, save: { generation: 0 }, external: { generation: 0 }, hashGeneration: 0,
    }
    this.instances.set(instanceId, record)
    this.refs.set(keyOf(ref), instanceId)
    this.host?.open(instanceId, ref, ref.resourceId, () => this.close(instanceId))
    await this.read(record, 'loading', true)
    return instanceId
  }

  /** Read one instance snapshot. */
  snapshot(instanceId: string): FileViewerInstanceSnapshot { this.assertLive(); return this.record(instanceId).snapshot }

  /** Subscribe to one instance. */
  subscribe(instanceId: string, listener: () => void): () => void {
    this.assertLive(); const listeners = this.record(instanceId).listeners; listeners.add(listener); return () => { listeners.delete(listener) }
  }

  /** Replace local text and schedule enabled automation. */
  edit(instanceId: string, text: string): void {
    const record = this.record(instanceId)
    if (record.snapshot.status !== 'ready') return
    const generation = ++record.hashGeneration
    record.snapshot = deriveSync({ ...clearFailure(record.snapshot), text, localHash: undefined })
    this.notify(record)
    void hashFileViewerText(text).then(hash => {
      if (this.instances.get(instanceId) !== record || record.hashGeneration !== generation || record.snapshot.status !== 'ready') return
      record.snapshot = deriveSync({ ...record.snapshot, localHash: hash })
      this.notify(record)
      this.scheduleAutoSave(record)
    })
  }

  /** Save local text. */
  async save(instanceId: string): Promise<void> { await this.saveRecord(this.record(instanceId), false, false) }
  /** Read latest source even while local text is dirty. */
  async refresh(instanceId: string): Promise<void> { await this.read(this.record(instanceId), 'refreshing', false) }
  /** Publish local text against the latest observed source revision. */
  async overwriteSource(instanceId: string): Promise<void> { await this.saveRecord(this.record(instanceId), false, true) }

  /** Replace local text with latest observed source text. */
  discardLocal(instanceId: string): void {
    const record = this.record(instanceId); const value = record.snapshot
    if (value.status !== 'ready' || value.latestSourceText === undefined || value.latestSourceHash === undefined) return
    record.hashGeneration += 1
    record.snapshot = { ...clearFailure(value), text: value.latestSourceText, localHash: value.latestSourceHash,
      baseText: value.latestSourceText, baseHash: value.latestSourceHash,
      ...(value.latestSourceVersion === undefined ? {} : { baseVersion: value.latestSourceVersion }),
      syncStatus: 'synced', automationPaused: false }
    this.notify(record)
  }

  /** Change and persist an automation preference. */
  setAutomation(instanceId: string, name: keyof FileViewerAutomationPreferences, enabled: boolean): void {
    const record = this.record(instanceId)
    if (record.snapshot.status !== 'ready') return
    const automation = { ...record.snapshot.automation, [name]: enabled }
    record.snapshot = { ...record.snapshot, automation, automationPaused: false }
    try { this.storage?.setItem(preferenceKey(record.snapshot.ref), JSON.stringify(automation)) } catch { /* Memory value remains effective. */ }
    if (!enabled) this.clearTimer(record, name)
    this.notify(record)
    if (enabled && name === 'autoSave') this.scheduleAutoSave(record)
    if (enabled && name === 'autoUpdate' && record.snapshot.sourceStale && !isFileViewerDirty(record.snapshot)) this.scheduleAutoUpdate(record)
  }

  /** Launch a source-declared location selector. */
  async selectLocation(instanceId: string, selection?: unknown): Promise<void> {
    const value = this.record(instanceId).snapshot
    if (value.status === 'ready' && value.location?.selectorId !== undefined) {
      await this.host?.launch(value.ref.sessionId, value.location.selectorId, selection)
    }
  }

  /** Open through the source external action. */
  async openExternal(instanceId: string): Promise<void> {
    const record = this.record(instanceId); const value = record.snapshot
    if (value.status !== 'ready') return
    const source = this.sources.get(value.ref.sourceId)
    if (source?.openExternal === undefined) { record.snapshot = { ...value, failure: { code: 'external-open-unsupported' } }; this.notify(record); return }
    const operation = this.begin(record.external)
    record.snapshot = { ...clearFailure(value), operation: 'opening-external' }; this.notify(record)
    try {
      await source.openExternal(value.ref, operation.controller.signal)
      if (this.current(record.external, operation) && record.snapshot.status === 'ready') { record.snapshot = { ...record.snapshot, operation: 'idle' }; this.notify(record) }
    } catch (error: unknown) {
      if (this.current(record.external, operation) && record.snapshot.status === 'ready') {
        record.snapshot = { ...record.snapshot, operation: 'idle', failure: toFailure('external-open-failed', error) }; this.notify(record)
      }
    } finally { this.finish(record.external, operation) }
  }

  /** Veto dirty close unless confirmed, then dispose the instance. */
  async close(instanceId: string): Promise<boolean> {
    this.assertLive(); const record = this.instances.get(instanceId); if (record === undefined) return true
    if (record.snapshot.status === 'ready' && isFileViewerDirty(record.snapshot) && !await this.confirmDiscard(record.snapshot)) return false
    this.remove(instanceId, record, new Error('document closed')); return true
  }

  /** Abort all work and detach watches. */
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    for (const [id, record] of this.instances) this.remove(id, record, new Error('file viewer disposed'))
    this.sources.clear()
  }

  private async read(record: InstanceRecord, name: 'loading' | 'refreshing', initial: boolean): Promise<void> {
    const source = this.sources.get(record.snapshot.ref.sourceId); const operation = this.begin(record.read)
    record.snapshot = { ...clearFailure(record.snapshot), operation: name }; this.notify(record)
    if (source === undefined) {
      this.finish(record.read, operation); record.snapshot = { ...record.snapshot, status: 'failed', operation: 'idle', failure: { code: 'source-unavailable' } }; this.notify(record)
      if (initial) throw new FileViewerOpenError(record.snapshot.failure); return
    }
    try {
      const loaded = await source.load(record.snapshot.ref, operation.controller.signal)
      const hash = await hashFileViewerText(loaded.text)
      if (!this.current(record.read, operation) || !this.instances.has(record.snapshot.instanceId)) return
      this.applyLoaded(record, source, loaded, hash, initial)
    } catch (error: unknown) {
      if (!this.current(record.read, operation)) return
      const failure = toFailure('load-failed', error)
      record.snapshot = record.snapshot.status === 'ready'
        ? { ...record.snapshot, operation: 'idle', sourceStale: true, syncStatus: 'unknown', failure, automationPaused: true }
        : { ...record.snapshot, status: 'failed', operation: 'idle', failure }
      this.notify(record); if (initial) throw new FileViewerOpenError(failure, { cause: error })
    } finally { this.finish(record.read, operation) }
  }

  private applyLoaded(record: InstanceRecord, source: FileViewerSource, loaded: FileViewerLoadedText, hash: string, initial: boolean): void {
    const previous = record.snapshot; const clean = previous.status !== 'ready' || !isFileViewerDirty(previous)
    let preferences: FileViewerAutomationPreferences = DEFAULT_AUTOMATION
    try { const raw = this.storage?.getItem(preferenceKey(previous.ref)); if (raw !== null && raw !== undefined) { const value = JSON.parse(raw) as Record<string, unknown>; preferences = { autoUpdate: value.autoUpdate === true, autoSave: value.autoSave === true } } } catch { /* Defaults remain. */ }
    let next: ReadySnapshot = {
      instanceId: previous.instanceId, ref: previous.ref, status: 'ready', title: loaded.title ?? previous.ref.resourceId, operation: 'idle',
      text: clean ? loaded.text : previous.text, ...(clean ? { localHash: hash } : previous.localHash === undefined ? {} : { localHash: previous.localHash }),
      baseText: initial || previous.status !== 'ready' ? loaded.text : previous.baseText,
      baseHash: initial || previous.status !== 'ready' ? hash : previous.baseHash,
      ...(initial || previous.status !== 'ready' ? (loaded.version === undefined ? {} : { baseVersion: loaded.version }) : (previous.baseVersion === undefined ? {} : { baseVersion: previous.baseVersion })),
      latestSourceText: loaded.text, latestSourceHash: hash, ...(loaded.version === undefined ? {} : { latestSourceVersion: loaded.version }),
      sourceStale: false, syncStatus: 'unknown', saveSupported: source.save !== undefined,
      conditionalSaveSupported: source.save !== undefined && source.supportsConditionalSave === true,
      watchSupported: source.watch !== undefined, externalOpenSupported: source.openExternal !== undefined,
      ...(loaded.location === undefined ? {} : { location: loaded.location }),
      automation: previous.status === 'ready' ? previous.automation : preferences, automationPaused: false,
    }
    next = deriveSync(next); record.snapshot = next; this.host?.update(next.instanceId, next.ref.sessionId, next.title)
    record.watchDispose?.(); record.watchDispose = source.watch?.(next.ref, event => { void this.onWatch(record, source, event) })
    this.notify(record); this.scheduleAutoSave(record)
  }

  private async onWatch(record: InstanceRecord, source: FileViewerSource, event: FileViewerWatchEvent): Promise<void> {
    if (this.instances.get(record.snapshot.instanceId) !== record || this.sources.get(source.id) !== source || record.snapshot.status !== 'ready') return
    if (event.kind === 'invalidate') {
      record.snapshot = { ...record.snapshot, sourceStale: true, syncStatus: 'unknown' }; this.notify(record)
      if (record.snapshot.automation.autoUpdate && !record.snapshot.automationPaused && !isFileViewerDirty(record.snapshot)) this.scheduleAutoUpdate(record)
      return
    }
    const generation = ++record.read.generation; const hash = await hashFileViewerText(event.snapshot.text)
    if (this.instances.get(record.snapshot.instanceId) === record && record.read.generation === generation) this.applyLoaded(record, source, event.snapshot, hash, false)
  }

  private async saveRecord(record: InstanceRecord, automatic: boolean, overwrite: boolean): Promise<void> {
    const value = record.snapshot; if (value.status !== 'ready') return
    const source = this.sources.get(value.ref.sourceId)
    if (source?.save === undefined) { record.snapshot = { ...value, failure: { code: 'save-unsupported' } }; this.notify(record); return }
    if (automatic && (!value.conditionalSaveSupported || value.latestSourceHash !== value.baseHash || value.sourceStale)) return
    if (overwrite && (!value.conditionalSaveSupported || value.latestSourceVersion === undefined)) return
    const operation = this.begin(record.save); const savedText = value.text; const savedHash = value.localHash ?? await hashFileViewerText(savedText)
    if (!this.current(record.save, operation) || record.snapshot.status !== 'ready') return
    record.snapshot = { ...clearFailure(record.snapshot), operation: 'saving' }; this.notify(record)
    try {
      const saved = await source.save(value.ref, savedText, overwrite ? value.latestSourceVersion : value.baseVersion, operation.controller.signal)
      if (!this.current(record.save, operation) || record.snapshot.status !== 'ready') return
      record.snapshot = deriveSync({ ...clearFailure(record.snapshot), operation: 'idle', baseText: savedText, baseHash: savedHash,
        ...(saved.version === undefined ? {} : { baseVersion: saved.version }), latestSourceText: savedText, latestSourceHash: savedHash,
        ...(saved.version === undefined ? {} : { latestSourceVersion: saved.version }), sourceStale: false, automationPaused: false })
      this.notify(record); this.scheduleAutoSave(record)
    } catch (error: unknown) {
      if (this.current(record.save, operation) && record.snapshot.status === 'ready') {
        record.snapshot = { ...record.snapshot, operation: 'idle', failure: toFailure('save-failed', error), automationPaused: automatic || record.snapshot.automation.autoSave }; this.notify(record)
      }
    } finally { this.finish(record.save, operation) }
  }

  private scheduleAutoUpdate(record: InstanceRecord): void {
    clearTimeout(record.autoUpdateTimer); record.autoUpdateTimer = setTimeout(() => {
      record.autoUpdateTimer = undefined
      if (record.snapshot.status === 'ready' && !isFileViewerDirty(record.snapshot) && !record.snapshot.automationPaused) void this.read(record, 'refreshing', false)
    }, this.debounceMs)
  }
  private scheduleAutoSave(record: InstanceRecord): void {
    if (record.snapshot.status !== 'ready') return
    const value = record.snapshot
    if (!value.automation.autoSave || value.automationPaused || !value.conditionalSaveSupported || value.localHash === undefined
      || value.localHash === value.baseHash || value.latestSourceHash !== value.baseHash || value.sourceStale) return
    clearTimeout(record.autoSaveTimer); record.autoSaveTimer = setTimeout(() => { record.autoSaveTimer = undefined; void this.saveRecord(record, true, false) }, this.debounceMs)
  }
  private clearTimer(record: InstanceRecord, name: keyof FileViewerAutomationPreferences): void {
    if (name === 'autoUpdate') { clearTimeout(record.autoUpdateTimer); record.autoUpdateTimer = undefined }
    else { clearTimeout(record.autoSaveTimer); record.autoSaveTimer = undefined }
  }
  private remove(id: string, record: InstanceRecord, reason: Error): void { record.listeners.clear(); this.stop(record, reason); this.instances.delete(id); this.refs.delete(keyOf(record.snapshot.ref)) }
  private stop(record: InstanceRecord, reason: Error): void {
    for (const state of [record.read, record.save, record.external]) { state.generation += 1; state.controller?.abort(reason); state.controller = undefined }
    record.watchDispose?.(); record.watchDispose = undefined; clearTimeout(record.autoUpdateTimer); clearTimeout(record.autoSaveTimer)
  }
  private record(id: string): InstanceRecord { this.assertLive(); const value = this.instances.get(id); if (value === undefined) throw new Error(`file-viewer: unknown instance "${id}"`); return value }
  private begin(state: OperationState) { state.generation += 1; state.controller?.abort(new Error('superseded')); const operation = { generation: state.generation, controller: new AbortController() }; state.controller = operation.controller; return operation }
  private current(state: OperationState, operation: { generation: number; controller: AbortController }): boolean { return !this.disposed && state.generation === operation.generation && state.controller === operation.controller && !operation.controller.signal.aborted }
  private finish(state: OperationState, operation: { controller: AbortController }): void { if (state.controller === operation.controller) state.controller = undefined }
  private notify(record: InstanceRecord): void { for (const listener of record.listeners) { try { listener() } catch { /* A subscriber cannot starve later subscribers. */ } } }
  private assertLive(): void { if (this.disposed) throw new Error('file-viewer: service is disposed') }
}
