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
  | { readonly kind: 'confirmation-required'; readonly error: FileViewerConfirmationRequiredError }
  | { readonly kind: 'invalidate' }
  | { readonly kind: 'missing'; readonly error: FileViewerMissingResourceError }
  | { readonly kind: 'snapshot'; readonly snapshot: FileViewerLoadedText }

/** Per-document permission passed only after an explicit large-file load action. */
export interface FileViewerTextAccess { readonly allowLargeFile?: boolean }

/** Metadata returned without reading content when the source requires confirmation. */
export interface FileViewerLoadConfirmation { readonly sizeBytes: number; readonly thresholdBytes: number }

/** Source rejection requesting an explicit load decision from the document owner. */
export class FileViewerConfirmationRequiredError extends Error implements FileViewerLoadConfirmation {
  readonly confirmationRequired = true
  constructor(readonly sizeBytes: number, readonly thresholdBytes: number, options?: ErrorOptions) {
    super('file-viewer: loading this file requires confirmation', options)
    this.name = 'FileViewerConfirmationRequiredError'
  }
}

/** @param error Source rejection. @returns Whether it requests large-file confirmation. */
export function isConfirmationRequiredError(error: unknown): error is FileViewerConfirmationRequiredError {
  return typeof error === 'object' && error !== null
    && (error as FileViewerConfirmationRequiredError).confirmationRequired === true
}

/** One pluggable text source. */
export interface FileViewerSource {
  readonly id: FileViewerSourceId
  readonly defaults?: Partial<FileViewerAutomationPreferences>
  load(ref: FileViewerDocumentRef, signal: AbortSignal, access?: FileViewerTextAccess): Promise<FileViewerLoadedText>
  save?(ref: FileViewerDocumentRef, text: string, version: unknown, signal: AbortSignal, access?: FileViewerTextAccess): Promise<FileViewerSavedText>
  /** True only when save rejects a revision mismatch without publishing. */
  readonly supportsConditionalSave?: boolean
  watch?(ref: FileViewerDocumentRef, listener: (event: FileViewerWatchEvent) => void, access?: FileViewerTextAccess): () => void
  openExternal?(ref: FileViewerDocumentRef, signal: AbortSignal): Promise<void>
}

/** Stable operation failure codes. */
export type FileViewerErrorCode = 'source-unavailable' | 'load-failed' | 'resource-missing' | 'hash-failed'
  | 'save-unsupported' | 'save-conflict' | 'save-failed' | 'watch-failed'
  | 'external-open-unsupported' | 'external-open-failed'

/** Rejection a source raises when its resource no longer exists. */
export class FileViewerMissingResourceError extends Error {
  /** Duck-typed marker so any source can report absence without sharing this class instance. */
  readonly resourceMissing = true
  constructor(message = 'file-viewer: the resource no longer exists', options?: ErrorOptions) {
    super(message, options)
    this.name = 'FileViewerMissingResourceError'
  }
}

/** @param error Source rejection. @returns True when the source reported that its resource is gone. */
export function isMissingResourceError(error: unknown): boolean {
  return typeof error === 'object' && error !== null
    && (error as { resourceMissing?: unknown }).resourceMissing === true
}

/** One retained operation failure. */
export interface FileViewerFailure { readonly code: FileViewerErrorCode; readonly message?: string }

/** Three-way synchronization relationship. */
export type FileViewerSyncStatus = 'synced' | 'local-ahead' | 'source-ahead' | 'diverged' | 'unknown'

/** Primary work in progress, ordered saving, reading, then external opening. */
export type FileViewerOperation = 'idle' | 'loading' | 'refreshing' | 'saving' | 'opening-external'

/** Concurrent update and save activity projected from the document's live operation controllers. */
export interface FileViewerActivities {
  /** True during a refresh read and its comparison; initial loading is separate. */
  readonly updating: boolean
  /** True during save preparation and the source write, including explicit overwrites. */
  readonly saving: boolean
}

/** Concrete automation choices owned by one shared document. */
export interface FileViewerAutomationPreferences { readonly autoUpdate: boolean; readonly autoSave: boolean }

interface CommonSnapshot {
  readonly instanceId: string
  readonly ref: FileViewerDocumentRef
  readonly title: string
  readonly operation: FileViewerOperation
  readonly activities: FileViewerActivities
  readonly failure?: FileViewerFailure
  /** Last confirmed resource absence; unrelated operation failures do not clear it. */
  readonly resourceMissing: boolean
  readonly loadConfirmation?: FileViewerLoadConfirmation
  readonly automation: FileViewerAutomationPreferences
}

/** Immutable state for one editor instance. */
export type FileViewerInstanceSnapshot =
  | (CommonSnapshot & { readonly status: 'loading' | 'failed' | 'confirmation-required' })
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
    readonly automationPaused: boolean
    /** True when the exact text is long enough that whole-document actions may be slow. Advisory only. */
    readonly large: boolean
  })

type ReadySnapshot = Extract<FileViewerInstanceSnapshot, { status: 'ready' }>

/** Stable rejection raised after a failed initial load is published. */
export class FileViewerOpenError extends Error {
  constructor(readonly failure: FileViewerFailure, options?: ErrorOptions) {
    super(`file-viewer: ${failure.code}${failure.message === undefined ? '' : `: ${failure.message}`}`, options)
    this.name = 'FileViewerOpenError'
  }
}

/** Browser persistence used for global defaults and recoverable editor drafts. */
export interface FileViewerBrowserStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

interface OperationState {
  generation: number
  controller: AbortController | undefined
  kind: FileViewerOperation | undefined
}

interface ActiveOperation {
  readonly generation: number
  readonly controller: AbortController
}

type AutomationPauseReason = 'conflict' | 'failure' | 'confirmation'

interface InstanceRecord {
  allowLargeFile: boolean
  snapshot: FileViewerInstanceSnapshot
  listeners: Set<() => void>
  read: OperationState
  save: OperationState
  external: OperationState
  hashGeneration: number
  editGeneration: number
  pauseReason: AutomationPauseReason | undefined
  presented: boolean
  watchSource: FileViewerSource | undefined
  watchDispose: (() => void) | undefined
  savePromise: Promise<void> | undefined
  autoUpdateTimer: ReturnType<typeof setTimeout> | undefined
  autoSaveTimer: ReturnType<typeof setTimeout> | undefined
  draftTimer: ReturnType<typeof setTimeout> | undefined
  /** Last successfully persisted draft; equal text and preferences need no rewrite. */
  persistedDraft: { readonly baseText: string; readonly localText: string; readonly automation: FileViewerAutomationPreferences } | undefined
}

/** Optional browser dependencies and timing policy. */
export interface FileViewerServiceOptions {
  readonly storage?: FileViewerBrowserStorage
  readonly automationDebounceMs?: number
  readonly persistenceDebounceMs?: number
  readonly globalAutomationDefaults?: Partial<FileViewerAutomationPreferences>
  readonly confirmDiscard?: (snapshot: ReadySnapshot) => boolean | Promise<boolean>
  /** Injectable only to make hashing failures and completion order deterministic in tests. */
  readonly hashText?: (text: string) => Promise<string>
  /** Code-unit length above which a document is reported as large; omission disables the advisory. */
  readonly largeDocumentCharacters?: number
}

const DEFAULT_AUTOMATION = Object.freeze({ autoUpdate: false, autoSave: false })

const GLOBAL_AUTOMATION_KEY = 'dsh-resource-workbench:automation-defaults:1'
const DRAFT_FORMAT_VERSION = 1

interface PersistedDraft {
  readonly format: typeof DRAFT_FORMAT_VERSION
  readonly baseText: string
  readonly localText: string
  readonly automation?: FileViewerAutomationPreferences
}

interface RestoredDraft extends PersistedDraft {
  readonly baseHash: string
  readonly localHash: string
}

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
  const message = typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string'
    ? error.message : String(error)
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

function keyOf(ref: FileViewerDocumentRef): string {
  return JSON.stringify([ref.sessionId, ref.sourceId, ref.resourceId])
}

function draftKey(ref: FileViewerDocumentRef): string {
  return `dsh-file-viewer:draft:${keyOf(ref)}`
}

function parseDraft(raw: string): PersistedDraft | undefined {
  const value: unknown = JSON.parse(raw)
  if (typeof value !== 'object' || value === null) return undefined
  const candidate = value as Record<string, unknown>
  if (candidate.format !== DRAFT_FORMAT_VERSION
    || typeof candidate.baseText !== 'string'
    || typeof candidate.localText !== 'string') return undefined
  const automation = parseAutomation(candidate.automation)
  return {
    format: DRAFT_FORMAT_VERSION,
    baseText: candidate.baseText,
    localText: candidate.localText,
    ...(automation === undefined ? {} : { automation }),
  }
}

function parseAutomation(value: unknown): FileViewerAutomationPreferences | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const candidate = value as Record<string, unknown>
  return typeof candidate.autoUpdate === 'boolean' && typeof candidate.autoSave === 'boolean'
    ? { autoUpdate: candidate.autoUpdate, autoSave: candidate.autoSave }
    : undefined
}

function defaultBrowserStorage(): FileViewerBrowserStorage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage
  } catch {
    return undefined
  }
}

function replaceBase(snapshot: ReadySnapshot, text: string, hash: string, version: unknown): ReadySnapshot {
  const { baseVersion: _baseVersion, ...rest } = snapshot
  return { ...rest, baseText: text, baseHash: hash, ...(version === undefined ? {} : { baseVersion: version }) }
}

function replaceLatestSource(snapshot: ReadySnapshot, loaded: FileViewerLoadedText, hash: string): ReadySnapshot {
  const {
    latestSourceVersion: _latestSourceVersion,
    latestSourceText: _latestSourceText,
    latestSourceHash: _latestSourceHash,
    location: _location,
    ...rest
  } = snapshot
  return {
    ...rest,
    latestSourceText: loaded.text,
    latestSourceHash: hash,
    ...(loaded.version === undefined ? {} : { latestSourceVersion: loaded.version }),
    ...(loaded.location === undefined ? {} : { location: loaded.location }),
  }
}

function replaceLocalTextWithoutHash(snapshot: ReadySnapshot, text: string): ReadySnapshot {
  const { localHash: _localHash, ...rest } = snapshot
  return { ...rest, text }
}

function deriveSync(snapshot: ReadySnapshot): ReadySnapshot {
  const localHash = snapshot.localHash
  const latestSourceHash = snapshot.latestSourceHash
  if (localHash === undefined || latestSourceHash === undefined || snapshot.sourceStale) {
    return { ...snapshot, syncStatus: 'unknown' }
  }
  let next = snapshot
  if (next.latestSourceHash === next.baseHash) {
    next = replaceBase(next, next.latestSourceText ?? next.baseText, next.baseHash, next.latestSourceVersion)
  }
  if (localHash === latestSourceHash) {
    return {
      ...replaceBase(next, next.latestSourceText ?? next.text, localHash, next.latestSourceVersion),
      syncStatus: 'synced',
    }
  }
  if (localHash === next.baseHash) return { ...next, syncStatus: 'source-ahead' }
  if (latestSourceHash === next.baseHash) return { ...next, syncStatus: 'local-ahead' }
  return { ...next, syncStatus: 'diverged' }
}

/** Authoritative registry for sources and independent document controllers. */
export class FileViewerService {
  private readonly sources = new Map<FileViewerSourceId, FileViewerSource>()
  private readonly instances = new Map<string, InstanceRecord>()
  private readonly refs = new Map<string, string>()
  private readonly storage: FileViewerBrowserStorage | undefined
  private readonly debounceMs: number
  private readonly persistenceDebounceMs: number
  private readonly confirmDiscard: (snapshot: ReadySnapshot) => boolean | Promise<boolean>
  private readonly hashText: (text: string) => Promise<string>
  private readonly largeDocumentCharacters: number | undefined
  private globalAutomation: FileViewerAutomationPreferences
  private readonly automationDefaultListeners = new Set<() => void>()
  private nextInstance = 0
  private disposed = false

  constructor(options: FileViewerServiceOptions = {}) {
    this.storage = options.storage ?? defaultBrowserStorage()
    this.debounceMs = options.automationDebounceMs ?? 700
    this.persistenceDebounceMs = options.persistenceDebounceMs ?? 700
    this.confirmDiscard = options.confirmDiscard ?? (() => false)
    this.hashText = options.hashText ?? hashFileViewerText
    this.largeDocumentCharacters = options.largeDocumentCharacters
    this.globalAutomation = this.readGlobalAutomation(options.globalAutomationDefaults)
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
        if (record.snapshot.status === 'ready') {
          record.pauseReason = 'failure'
          record.snapshot = {
            ...record.snapshot,
            sourceStale: true,
            syncStatus: 'unknown',
            saveSupported: false,
            conditionalSaveSupported: false,
            watchSupported: false,
            externalOpenSupported: false,
            automationPaused: true,
            failure: { code: 'source-unavailable' },
          }
        } else {
          record.snapshot = {
            ...record.snapshot,
            status: 'failed',
            failure: { code: 'source-unavailable' },
          }
        }
        this.notify(record)
      }
    }
  }

  /** Open a new instance, or activate and retry the existing instance for the exact ref. */
  async open(ref: FileViewerDocumentRef): Promise<string> {
    this.assertLive()
    const existing = this.refs.get(keyOf(ref))
    if (existing !== undefined) {
      const record = this.record(existing)
      if (record.snapshot.status === 'failed') {
        const failure = await this.read(record, 'loading', 'initial')
        if (failure !== undefined) throw new FileViewerOpenError(failure)
        if (record.snapshot.status === 'failed') throw new FileViewerOpenError(record.snapshot.failure ?? { code: 'load-failed' })
      }
      return existing
    }

    const instanceId = `text-editor-${++this.nextInstance}`
    const record: InstanceRecord = {
      allowLargeFile: false,
      snapshot: {
        instanceId, ref, title: ref.resourceId, status: 'loading', operation: 'loading', resourceMissing: false,
        activities: { updating: false, saving: false },
        automation: this.readDraft(ref)?.automation ?? {
          ...this.globalAutomation,
          ...this.sources.get(ref.sourceId)?.defaults,
        },
      },
      listeners: new Set(),
      read: { generation: 0, controller: undefined, kind: undefined },
      save: { generation: 0, controller: undefined, kind: undefined },
      external: { generation: 0, controller: undefined, kind: undefined },
      hashGeneration: 0,
      editGeneration: 0,
      pauseReason: undefined,
      presented: true,
      watchSource: undefined,
      watchDispose: undefined,
      savePromise: undefined,
      autoUpdateTimer: undefined,
      autoSaveTimer: undefined,
      draftTimer: undefined,
      persistedDraft: undefined,
    }
    this.instances.set(instanceId, record)
    this.refs.set(keyOf(ref), instanceId)
    const failure = await this.read(record, 'loading', 'initial')
    if (failure !== undefined) throw new FileViewerOpenError(failure)
    if (this.instances.get(instanceId) === record && record.snapshot.status === 'failed') {
      throw new FileViewerOpenError(record.snapshot.failure ?? { code: 'load-failed' })
    }
    return instanceId
  }

  /** Read one instance snapshot. */
  snapshot(instanceId: string): FileViewerInstanceSnapshot {
    return this.record(instanceId).snapshot
  }

  /** @param ref Exact text-document identity. @returns Existing document id, including a retained failed load. */
  find(ref: FileViewerDocumentRef): string | undefined {
    this.assertLive()
    return this.refs.get(keyOf(ref))
  }

  /** Subscribe to one instance. */
  subscribe(instanceId: string, listener: () => void): () => void {
    const listeners = this.record(instanceId).listeners
    listeners.add(listener)
    return () => { listeners.delete(listener) }
  }

  /** Replace local text and schedule enabled automation after its exact hash resolves. */
  edit(instanceId: string, text: string): void {
    const record = this.record(instanceId)
    if (record.snapshot.status !== 'ready') return
    record.editGeneration += 1
    const generation = ++record.hashGeneration
    record.snapshot = deriveSync(this.applySize(replaceLocalTextWithoutHash(record.snapshot, text)))
    this.scheduleDraftPersistence(record)
    this.notify(record)
    this.hashLocalText(instanceId, record, generation, text)
  }

  /** Save local text only through a conditional source write. */
  async save(instanceId: string): Promise<void> {
    await this.saveRecord(this.record(instanceId), false, false)
  }

  /** Read and manually pull latest source text when local text is clean. */
  async refresh(instanceId: string): Promise<void> {
    await this.read(this.record(instanceId), 'refreshing', 'manual')
  }

  /** @param instanceId Shared document whose current large-file prompt the user accepted. @returns Nothing after loading. */
  async confirmLoad(instanceId: string): Promise<void> {
    const record = this.record(instanceId)
    if (record.snapshot.loadConfirmation === undefined || record.read.controller !== undefined) return
    record.allowLargeFile = true
    const { loadConfirmation: _confirmation, ...snapshot } = record.snapshot
    record.snapshot = snapshot.status === 'ready' ? snapshot : { ...snapshot, status: 'loading' }
    await this.read(record, snapshot.status === 'ready' ? 'refreshing' : 'loading', snapshot.status === 'ready' ? 'manual' : 'initial')
  }

  /** Publish local text through the explicit overwrite path. */
  async overwriteSource(instanceId: string): Promise<void> {
    await this.saveRecord(this.record(instanceId), false, true)
  }

  /** Replace local text with the latest observed source text. */
  discardLocal(instanceId: string): void {
    this.pullLatest(this.record(instanceId))
  }

  /** Change one shared document's automation choice until its last view closes. */
  setAutomation(instanceId: string, name: keyof FileViewerAutomationPreferences, enabled: boolean): void {
    const record = this.record(instanceId)
    if (record.snapshot.status !== 'ready') return
    const automation = { ...record.snapshot.automation, [name]: enabled }
    record.snapshot = {
      ...record.snapshot,
      automation,
    }
    this.scheduleDraftPersistence(record)
    if (automation[name] !== true) this.clearTimer(record, name)
    this.notify(record)
    this.scheduleAutomation(record, true)
  }

  /** Read stable global defaults used only when a new document opens. */
  automationDefaults(): FileViewerAutomationPreferences {
    return this.globalAutomation
  }

  /** @param listener Global-default change listener. @returns Subscription disposer. */
  subscribeAutomationDefaults(listener: () => void): () => void {
    this.assertLive()
    this.automationDefaultListeners.add(listener)
    return () => { this.automationDefaultListeners.delete(listener) }
  }

  /** Change a persisted global default without notifying or rescheduling existing documents. */
  setGlobalAutomation(name: keyof FileViewerAutomationPreferences, enabled: boolean): void {
    this.assertLive()
    if (this.globalAutomation[name] === enabled) return
    this.globalAutomation = { ...this.globalAutomation, [name]: enabled }
    try {
      this.storage?.setItem(GLOBAL_AUTOMATION_KEY, JSON.stringify(this.globalAutomation))
    } catch {
      // The in-memory global defaults remain effective when persistence is unavailable.
    }
    for (const listener of this.automationDefaultListeners) {
      try {
        listener()
      } catch {
        // A defaults subscriber cannot starve later subscribers.
      }
    }
  }

  /** Pause hidden-handler automation or resume it when a compatible text view returns. */
  setPresented(instanceId: string, presented: boolean): void {
    const record = this.record(instanceId)
    if (record.snapshot.status !== 'ready') return
    if (record.presented === presented) return
    record.presented = presented
    record.snapshot = this.reconcilePause(record, record.snapshot)
    this.notify(record)
    if (!presented) {
      this.clearAutomationTimers(record)
      return
    }
    this.scheduleAutomation(record, true)
  }

  /** Open through the source external action. */
  async openExternal(instanceId: string): Promise<void> {
    const record = this.record(instanceId)
    const value = record.snapshot
    if (value.status !== 'ready') return
    const source = this.sources.get(value.ref.sourceId)
    if (source?.openExternal === undefined) {
      record.snapshot = { ...value, failure: { code: 'external-open-unsupported' } }
      this.notify(record)
      return
    }
    const operation = this.begin(record.external, 'opening-external')
    this.notify(record)
    try {
      await source.openExternal(value.ref, operation.controller.signal)
      if (!this.complete(record.external, operation) || record.snapshot.status !== 'ready') return
      record.snapshot = clearFailure(record.snapshot)
      this.notify(record)
    } catch (error: unknown) {
      if (!this.complete(record.external, operation) || record.snapshot.status !== 'ready') return
      record.snapshot = {
        ...record.snapshot,
        failure: toFailure('external-open-failed', error),
      }
      this.notify(record)
    }
  }

  /** @param instanceId Shared text-document id. @returns Whether the current document may close without releasing its state. */
  async canClose(instanceId: string): Promise<boolean> {
    this.assertLive()
    const record = this.instances.get(instanceId)
    if (record === undefined) return true
    const candidate = record.snapshot
    const candidateEditGeneration = record.editGeneration
    if (candidate.status === 'ready' && isFileViewerDirty(candidate)) {
      if (!await this.confirmDiscard(candidate)) {
        this.flushDraft(record)
        return false
      }
      if (this.instances.get(instanceId) !== record) return true
      const current = record.snapshot
      if (current.status === 'ready' && isFileViewerDirty(current)
        && record.editGeneration !== candidateEditGeneration) {
        this.flushDraft(record)
        return false
      }
    }
    if (this.instances.get(instanceId) !== record) return true
    this.flushDraft(record)
    return true
  }

  /** @param instanceId Shared text-document id to discard after its owning view closure commits. */
  discard(instanceId: string): void {
    this.assertLive()
    const record = this.instances.get(instanceId)
    if (record === undefined) return
    this.discardDraft(record)
    this.remove(instanceId, record, new Error('document closed'))
  }

  /** Flush current text before browser page suspension without disposing reusable instances. */
  flushDrafts(): void {
    if (this.disposed) return
    for (const record of this.instances.values()) this.flushDraft(record)
  }

  /** Abort all work and detach watches. */
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.automationDefaultListeners.clear()
    for (const [id, record] of this.instances) {
      this.flushDraft(record)
      this.remove(id, record, new Error('file viewer disposed'))
    }
    this.sources.clear()
  }

  private hashLocalText(instanceId: string, record: InstanceRecord, generation: number, text: string): void {
    void this.hashText(text).then(
      hash => {
        if (!this.hashCurrent(instanceId, record, generation)) return
        let next = deriveSync({ ...record.snapshot, localHash: hash })
        next = this.reconcilePause(record, next)
        record.snapshot = next
        this.scheduleDraftPersistence(record)
        this.notify(record)
        this.scheduleAutomation(record, true)
      },
      error => {
        if (!this.hashCurrent(instanceId, record, generation)) return
        record.pauseReason = 'failure'
        record.snapshot = {
          ...record.snapshot,
          syncStatus: 'unknown',
          automationPaused: true,
          failure: toFailure('hash-failed', error),
        }
        this.notify(record)
        this.clearAutomationTimers(record)
      },
    )
  }

  private async read(
    record: InstanceRecord,
    operationName: 'loading' | 'refreshing',
    mode: 'initial' | 'manual' | 'observe',
  ): Promise<FileViewerFailure | undefined> {
    const source = this.sources.get(record.snapshot.ref.sourceId)
    if (record.snapshot.loadConfirmation !== undefined && source !== undefined) {
      this.requireConfirmation(record, record.snapshot.loadConfirmation)
      return undefined
    }
    const operation = this.begin(record.read, operationName)
    this.notify(record)
    if (source === undefined) {
      const failure = { code: 'source-unavailable' } as const
      if (this.complete(record.read, operation)) this.publishReadFailure(record, failure)
      return failure
    }

    let loaded: FileViewerLoadedText
    try {
      loaded = await source.load(record.snapshot.ref, operation.controller.signal, { allowLargeFile: record.allowLargeFile })
    } catch (error: unknown) {
      if (!this.current(record.read, operation)) return undefined
      if (isConfirmationRequiredError(error)) {
        if (this.complete(record.read, operation)) this.requireConfirmation(record, error)
        return undefined
      }
      const missing = isMissingResourceError(error)
      const failure = toFailure(missing ? 'resource-missing' : 'load-failed', error)
      const draft = missing && record.snapshot.status !== 'ready' ? this.readDraft(record.snapshot.ref) : undefined
      if (draft !== undefined) {
        let restored: RestoredDraft
        try {
          const baseHash = await this.hashText(draft.baseText)
          const localHash = draft.localText === draft.baseText ? baseHash : await this.hashText(draft.localText)
          restored = { ...draft, baseHash, localHash }
        } catch (hashError: unknown) {
          if (!this.complete(record.read, operation)) return undefined
          record.snapshot = { ...record.snapshot, resourceMissing: true }
          const hashFailure = toFailure('hash-failed', hashError)
          this.publishReadFailure(record, hashFailure)
          return hashFailure
        }
        if (!this.complete(record.read, operation)) return undefined
        this.applyObserved(record, source, { text: draft.baseText }, restored.baseHash, mode, restored, failure)
        return undefined
      }
      if (!this.complete(record.read, operation)) return undefined
      this.publishReadFailure(record, failure)
      return failure
    }

    if (!this.current(record.read, operation)) return undefined
    const persisted = mode === 'initial' && record.snapshot.status !== 'ready'
      ? this.readDraft(record.snapshot.ref)
      : undefined
    let hash: string
    let restored: RestoredDraft | undefined
    try {
      if (persisted === undefined) {
        hash = await this.hashText(loaded.text)
      } else {
        const sourceHashPromise = this.hashText(loaded.text)
        const baseHashPromise = persisted.baseText === loaded.text
          ? sourceHashPromise
          : this.hashText(persisted.baseText)
        const localHashPromise = persisted.localText === loaded.text
          ? sourceHashPromise
          : persisted.localText === persisted.baseText
            ? baseHashPromise
            : this.hashText(persisted.localText)
        const [sourceHash, baseHash, localHash] = await Promise.all([
          sourceHashPromise,
          baseHashPromise,
          localHashPromise,
        ])
        hash = sourceHash
        restored = { ...persisted, baseHash, localHash }
      }
    } catch (error: unknown) {
      if (!this.complete(record.read, operation)) return undefined
      const failure = toFailure('hash-failed', error)
      this.publishReadFailure(record, failure)
      return failure
    }

    if (!this.complete(record.read, operation) || this.instances.get(record.snapshot.instanceId) !== record) return undefined
    this.applyObserved(record, source, loaded, hash, mode, restored)
    return undefined
  }

  private requireConfirmation(record: InstanceRecord, error: FileViewerLoadConfirmation): void {
    record.pauseReason = 'confirmation'
    this.cancel(record.read, new Error('load confirmation required'))
    this.detachWatch(record)
    this.clearAutomationTimers(record)
    const snapshot = record.snapshot
    const loadConfirmation = { sizeBytes: error.sizeBytes, thresholdBytes: error.thresholdBytes }
    record.snapshot = snapshot.status === 'ready'
      ? { ...clearFailure(snapshot), loadConfirmation, sourceStale: true, syncStatus: 'unknown', automationPaused: true }
      : { ...clearFailure(snapshot), loadConfirmation, status: 'confirmation-required' }
    this.notify(record)
  }

  private publishReadFailure(record: InstanceRecord, failure: FileViewerFailure): void {
    record.pauseReason = 'failure'
    const resourceMissing = failure.code === 'resource-missing' || record.snapshot.resourceMissing
    record.snapshot = record.snapshot.status === 'ready'
      ? {
        ...record.snapshot,
        sourceStale: true,
        syncStatus: 'unknown',
        automationPaused: true,
        resourceMissing,
        failure,
      }
      : {
        ...record.snapshot,
        status: 'failed',
        resourceMissing,
        failure,
      }
    this.notify(record)
    this.clearAutomationTimers(record)
  }

  private applyObserved(
    record: InstanceRecord,
    source: FileViewerSource,
    loaded: FileViewerLoadedText,
    hash: string,
    mode: 'initial' | 'manual' | 'observe',
    restored?: RestoredDraft,
    missingFailure?: FileViewerFailure,
  ): void {
    const previous = record.snapshot
    let next: ReadySnapshot
    if (previous.status !== 'ready') {
      next = deriveSync({
        instanceId: previous.instanceId,
        ref: previous.ref,
        status: 'ready',
        resourceMissing: false,
        title: loaded.title ?? previous.ref.resourceId,
        operation: previous.operation,
        activities: previous.activities,
        text: restored?.localText ?? loaded.text,
        localHash: restored?.localHash ?? hash,
        baseText: restored?.baseText ?? loaded.text,
        baseHash: restored?.baseHash ?? hash,
        ...(restored === undefined && loaded.version !== undefined ? { baseVersion: loaded.version } : {}),
        latestSourceText: loaded.text,
        latestSourceHash: hash,
        ...(loaded.version === undefined ? {} : { latestSourceVersion: loaded.version }),
        sourceStale: false,
        syncStatus: 'synced',
        saveSupported: source.save !== undefined,
        conditionalSaveSupported: source.save !== undefined && source.supportsConditionalSave === true,
        watchSupported: source.watch !== undefined,
        externalOpenSupported: source.openExternal !== undefined,
        ...(loaded.location === undefined ? {} : { location: loaded.location }),
        automation: previous.automation,
        automationPaused: false,
        large: false,
      })
    } else {
      const pull = mode === 'manual' && !isFileViewerDirty(previous)
      next = replaceLatestSource({
        ...clearFailure(previous),
        resourceMissing: false,
        title: loaded.title ?? previous.ref.resourceId,
        sourceStale: false,
        saveSupported: source.save !== undefined,
        conditionalSaveSupported: source.save !== undefined && source.supportsConditionalSave === true,
        watchSupported: source.watch !== undefined,
        externalOpenSupported: source.openExternal !== undefined,
      }, loaded, hash)
      if (pull) {
        record.hashGeneration += 1
        next = replaceBase({ ...next, text: loaded.text, localHash: hash }, loaded.text, hash, loaded.version)
      }
      next = deriveSync(next)
    }
    record.pauseReason = missingFailure === undefined ? undefined : 'failure'
    if (missingFailure !== undefined) {
      const { latestSourceText: _text, latestSourceHash: _hash, latestSourceVersion: _version, ...retained } = next
      next = { ...retained, sourceStale: true, syncStatus: 'unknown', resourceMissing: true, failure: missingFailure }
    }
    next = this.reconcilePause(record, next)
    record.snapshot = next
    this.scheduleDraftPersistence(record)
    this.attachWatch(record, source)
    this.notify(record)
    this.scheduleAutomation(record, true)
  }

  private attachWatch(record: InstanceRecord, source: FileViewerSource): void {
    if (source.watch === undefined || record.watchSource === source) return
    this.detachWatch(record)
    record.watchSource = source
    try {
      record.watchDispose = source.watch(record.snapshot.ref, event => {
        void this.onWatch(record, source, event).catch(error => {
          if (!this.watchCurrent(record, source)) return
          record.pauseReason = 'failure'
          record.snapshot = {
            ...record.snapshot,
            automationPaused: true,
            failure: toFailure('watch-failed', error),
          }
          this.notify(record)
          this.clearAutomationTimers(record)
        })
      }, { allowLargeFile: record.allowLargeFile })
    } catch (error: unknown) {
      record.watchSource = undefined
      record.watchDispose = undefined
      record.pauseReason = 'failure'
      if (record.snapshot.status === 'ready') {
        record.snapshot = {
          ...record.snapshot,
          watchSupported: false,
          automationPaused: true,
          failure: toFailure('watch-failed', error),
        }
      }
      this.clearTimer(record, 'autoUpdate')
    }
  }

  private async onWatch(record: InstanceRecord, source: FileViewerSource, event: FileViewerWatchEvent): Promise<void> {
    if (!this.watchCurrent(record, source)) return
    if (event.kind === 'confirmation-required') {
      this.requireConfirmation(record, event.error)
      return
    }
    if (event.kind === 'missing') {
      this.cancel(record.read, event.error)
      this.publishReadFailure(record, toFailure('resource-missing', event.error))
      return
    }
    if (event.kind === 'invalidate') {
      record.snapshot = { ...record.snapshot, sourceStale: true, syncStatus: 'unknown' }
      this.notify(record)
      this.clearTimer(record, 'autoUpdate')
      await this.read(record, 'refreshing', 'observe')
      return
    }

    this.cancel(record.read, new Error('source snapshot superseded read'))
    const generation = record.read.generation
    this.notify(record)
    let hash: string
    try {
      hash = await this.hashText(event.snapshot.text)
    } catch (error: unknown) {
      if (!this.watchHashCurrent(record, source, generation)) return
      record.pauseReason = 'failure'
      record.snapshot = {
        ...record.snapshot,
        sourceStale: true,
        syncStatus: 'unknown',
        automationPaused: true,
        failure: toFailure('hash-failed', error),
      }
      this.notify(record)
      this.clearAutomationTimers(record)
      return
    }
    if (!this.watchHashCurrent(record, source, generation)) return
    this.applyObserved(record, source, event.snapshot, hash, 'observe')
  }

  private saveRecord(record: InstanceRecord, automatic: boolean, overwrite: boolean): Promise<void> {
    if (record.savePromise !== undefined) return record.savePromise
    const promise = this.runSave(record, automatic, overwrite)
    record.savePromise = promise
    const release = (): void => {
      if (record.savePromise === promise) record.savePromise = undefined
    }
    void promise.then(release, release)
    return promise
  }

  private async runSave(record: InstanceRecord, automatic: boolean, overwrite: boolean): Promise<void> {
    const value = record.snapshot
    if (value.status !== 'ready' || value.loadConfirmation !== undefined) return
    const source = this.sources.get(value.ref.sourceId)
    if (source?.save === undefined) {
      this.publishSaveBlock(record, { code: 'save-unsupported' })
      return
    }
    if (automatic && !this.canAutoSave(value)) return
    if (!overwrite && !value.conditionalSaveSupported) {
      this.publishSaveBlock(record, {
        code: 'save-conflict',
        message: 'source requires explicit overwrite because conditional save is unavailable',
      })
      return
    }
    if (!overwrite && (value.sourceStale || value.latestSourceHash === undefined
      || value.latestSourceHash !== value.baseHash)) {
      this.publishSaveBlock(record, { code: 'save-conflict', message: 'source changed since the local base was observed' })
      return
    }
    if (!overwrite && !isFileViewerDirty(value)) return

    const operation = this.begin(record.save, 'saving')
    this.clearTimer(record, 'autoSave')
    this.notify(record)
    const savedText = value.text
    let savedHash = value.localHash
    if (savedHash === undefined) {
      try {
        savedHash = await this.hashText(savedText)
      } catch (error: unknown) {
        if (!this.complete(record.save, operation) || record.snapshot.status !== 'ready') return
        record.pauseReason = 'failure'
        record.snapshot = {
          ...record.snapshot,
          automationPaused: true,
          failure: toFailure('hash-failed', error),
        }
        this.notify(record)
        return
      }
    }
    if (!this.current(record.save, operation) || record.snapshot.status !== 'ready') return

    const current = record.snapshot
    if (!overwrite && (current.sourceStale || current.latestSourceHash === undefined
      || current.latestSourceHash !== current.baseHash)) {
      if (this.complete(record.save, operation)) {
        this.publishSaveBlock(record, { code: 'save-conflict', message: 'source changed while preparing the save' })
      }
      return
    }
    const version = overwrite ? current.latestSourceVersion : current.baseVersion
    try {
      const saved = await source.save(value.ref, savedText, version, operation.controller.signal, { allowLargeFile: record.allowLargeFile })
      if (!this.complete(record.save, operation) || record.snapshot.status !== 'ready') return
      this.cancel(record.read, new Error('successful save superseded source read'))
      record.pauseReason = undefined
      let next = replaceLatestSource({
        ...clearFailure(record.snapshot),
        resourceMissing: false,
        sourceStale: false,
      }, { text: savedText, version: saved.version }, savedHash)
      next = replaceBase(next, savedText, savedHash, saved.version)
      next = this.reconcilePause(record, deriveSync(next))
      record.snapshot = next
      this.scheduleDraftPersistence(record)
      this.notify(record)
      this.scheduleAutomation(record, true)
    } catch (error: unknown) {
      if (!this.complete(record.save, operation) || record.snapshot.status !== 'ready') return
      if (isConfirmationRequiredError(error)) {
        this.requireConfirmation(record, error)
        return
      }
      record.pauseReason = 'failure'
      record.snapshot = {
        ...record.snapshot,
        automationPaused: true,
        failure: toFailure('save-failed', error),
      }
      this.notify(record)
      this.clearAutomationTimers(record)
    }
  }

  private publishSaveBlock(record: InstanceRecord, failure: FileViewerFailure): void {
    if (record.snapshot.status !== 'ready') return
    record.pauseReason = failure.code === 'save-conflict' ? 'conflict' : 'failure'
    record.snapshot = { ...record.snapshot, automationPaused: true, failure }
    this.notify(record)
    this.clearAutomationTimers(record)
  }

  private pullLatest(record: InstanceRecord): void {
    const value = record.snapshot
    if (value.status !== 'ready' || value.sourceStale
      || value.latestSourceText === undefined || value.latestSourceHash === undefined) return
    record.hashGeneration += 1
    record.pauseReason = undefined
    let next = replaceBase({
      ...clearFailure(value),
      text: value.latestSourceText,
      localHash: value.latestSourceHash,
      syncStatus: 'synced',
      automationPaused: false,
    }, value.latestSourceText, value.latestSourceHash, value.latestSourceVersion)
    next = this.reconcilePause(record, deriveSync(next))
    record.snapshot = next
    this.scheduleDraftPersistence(record)
    this.notify(record)
    this.scheduleAutomation(record, true)
  }

  private readGlobalAutomation(
    configured: Partial<FileViewerAutomationPreferences> | undefined,
  ): FileViewerAutomationPreferences {
    let stored: Record<string, unknown> = {}
    try {
      const raw = this.storage?.getItem(GLOBAL_AUTOMATION_KEY)
      if (raw !== null && raw !== undefined) stored = JSON.parse(raw) as Record<string, unknown>
    } catch {
      // Malformed or unavailable persistence uses configured defaults.
    }
    return {
      autoUpdate: typeof stored.autoUpdate === 'boolean'
        ? stored.autoUpdate
        : configured?.autoUpdate ?? DEFAULT_AUTOMATION.autoUpdate,
      autoSave: typeof stored.autoSave === 'boolean'
        ? stored.autoSave
        : configured?.autoSave ?? DEFAULT_AUTOMATION.autoSave,
    }
  }

  private readDraft(ref: FileViewerDocumentRef): PersistedDraft | undefined {
    try {
      const raw = this.storage?.getItem(draftKey(ref))
      return raw === null || raw === undefined ? undefined : parseDraft(raw)
    } catch {
      // Malformed or unavailable browser persistence leaves source loading authoritative.
      return undefined
    }
  }

  private scheduleDraftPersistence(record: InstanceRecord): void {
    if (this.storage === undefined || record.snapshot.status !== 'ready') return
    clearTimeout(record.draftTimer)
    record.draftTimer = setTimeout(() => {
      record.draftTimer = undefined
      this.persistDraft(record)
    }, this.persistenceDebounceMs)
  }

  private persistDraft(record: InstanceRecord): void {
    if (this.storage === undefined || record.snapshot.status !== 'ready') return
    const written = {
      baseText: record.snapshot.baseText,
      localText: record.snapshot.text,
      automation: record.snapshot.automation,
    }
    const value: PersistedDraft = { format: DRAFT_FORMAT_VERSION, ...written }
    const persisted = record.persistedDraft
    if (persisted !== undefined && persisted.baseText === written.baseText
      && persisted.localText === written.localText
      && persisted.automation.autoUpdate === written.automation.autoUpdate
      && persisted.automation.autoSave === written.automation.autoSave) return
    try {
      this.storage.setItem(draftKey(record.snapshot.ref), JSON.stringify(value))
      record.persistedDraft = written
    } catch {
      // The in-memory Base and Local text remain authoritative when browser quota or storage is unavailable.
      record.persistedDraft = undefined
    }
  }

  private flushDraft(record: InstanceRecord): void {
    this.clearDraftTimer(record)
    this.persistDraft(record)
  }

  private discardDraft(record: InstanceRecord): void {
    this.clearDraftTimer(record)
    record.persistedDraft = undefined
    try {
      this.storage?.removeItem(draftKey(record.snapshot.ref))
    } catch {
      // Browser storage failure cannot prevent an explicitly confirmed close.
    }
  }

  private scheduleAutomation(record: InstanceRecord, reset: boolean): void {
    if (record.snapshot.status !== 'ready') return
    if (this.canAutoUpdate(record.snapshot)) {
      if (reset) clearTimeout(record.autoUpdateTimer)
      if (reset || record.autoUpdateTimer === undefined) {
        record.autoUpdateTimer = setTimeout(() => {
          record.autoUpdateTimer = undefined
          if (record.snapshot.status === 'ready' && this.canAutoUpdate(record.snapshot)) this.pullLatest(record)
        }, this.debounceMs)
      }
    } else {
      this.clearTimer(record, 'autoUpdate')
    }

    if (this.canAutoSave(record.snapshot)) {
      if (reset) clearTimeout(record.autoSaveTimer)
      if (reset || record.autoSaveTimer === undefined) {
        record.autoSaveTimer = setTimeout(() => {
          record.autoSaveTimer = undefined
          if (record.snapshot.status === 'ready' && this.canAutoSave(record.snapshot)) {
            void this.saveRecord(record, true, false)
          }
        }, this.debounceMs)
      }
    } else {
      this.clearTimer(record, 'autoSave')
    }
  }

  private canAutoUpdate(value: ReadySnapshot): boolean {
    return value.automation.autoUpdate && value.watchSupported && !value.automationPaused
      && !value.sourceStale && value.syncStatus === 'source-ahead' && !isFileViewerDirty(value)
      && value.latestSourceText !== undefined && value.latestSourceHash !== undefined
  }

  private canAutoSave(value: ReadySnapshot): boolean {
    return value.automation.autoSave && value.conditionalSaveSupported && !value.automationPaused
      && !value.sourceStale && value.syncStatus === 'local-ahead' && value.localHash !== undefined
      && value.latestSourceHash === value.baseHash
  }

  /** Classify the exact local text against the advisory length without copying it. */
  private applySize(value: ReadySnapshot): ReadySnapshot {
    const large = this.largeDocumentCharacters !== undefined && value.text.length > this.largeDocumentCharacters
    return value.large === large ? value : { ...value, large }
  }

  private reconcilePause(record: InstanceRecord, snapshot: ReadySnapshot): ReadySnapshot {
    const value = this.applySize(snapshot)
    if (value.syncStatus === 'diverged') {
      if (record.pauseReason !== 'failure') record.pauseReason = 'conflict'
    } else if (record.pauseReason === 'conflict' && value.syncStatus !== 'unknown') {
      record.pauseReason = undefined
    }
    return { ...value, automationPaused: record.pauseReason !== undefined || !record.presented }
  }

  private clearTimer(record: InstanceRecord, name: keyof FileViewerAutomationPreferences): void {
    if (name === 'autoUpdate') {
      clearTimeout(record.autoUpdateTimer)
      record.autoUpdateTimer = undefined
    } else {
      clearTimeout(record.autoSaveTimer)
      record.autoSaveTimer = undefined
    }
  }

  private clearAutomationTimers(record: InstanceRecord): void {
    this.clearTimer(record, 'autoUpdate')
    this.clearTimer(record, 'autoSave')
  }

  private clearDraftTimer(record: InstanceRecord): void {
    clearTimeout(record.draftTimer)
    record.draftTimer = undefined
  }

  private remove(id: string, record: InstanceRecord, reason: Error): void {
    record.listeners.clear()
    this.stop(record, reason)
    this.clearDraftTimer(record)
    this.instances.delete(id)
    if (this.refs.get(keyOf(record.snapshot.ref)) === id) this.refs.delete(keyOf(record.snapshot.ref))
  }

  private stop(record: InstanceRecord, reason: Error): void {
    for (const state of [record.read, record.save, record.external]) this.cancel(state, reason)
    this.detachWatch(record)
    record.savePromise = undefined
    this.clearAutomationTimers(record)
  }

  private detachWatch(record: InstanceRecord): void {
    const dispose = record.watchDispose
    record.watchDispose = undefined
    record.watchSource = undefined
    if (dispose === undefined) return
    try {
      dispose()
    } catch {
      // A source-owned watch disposer cannot prevent the viewer from reaching a detached state.
    }
  }

  private record(id: string): InstanceRecord {
    this.assertLive()
    const value = this.instances.get(id)
    if (value === undefined) throw new Error(`file-viewer: unknown instance "${id}"`)
    return value
  }

  private begin(state: OperationState, kind: FileViewerOperation): ActiveOperation {
    this.cancel(state, new Error('superseded'))
    const operation = { generation: state.generation, controller: new AbortController() }
    state.controller = operation.controller
    state.kind = kind
    return operation
  }

  private cancel(state: OperationState, reason: Error): void {
    state.generation += 1
    state.controller?.abort(reason)
    state.controller = undefined
    state.kind = undefined
  }

  private current(state: OperationState, operation: ActiveOperation): boolean {
    return !this.disposed && state.generation === operation.generation
      && state.controller === operation.controller && !operation.controller.signal.aborted
  }

  private complete(state: OperationState, operation: ActiveOperation): boolean {
    if (!this.current(state, operation)) return false
    state.controller = undefined
    state.kind = undefined
    return true
  }

  private visibleOperation(record: InstanceRecord): FileViewerOperation {
    return record.save.kind ?? record.read.kind ?? record.external.kind ?? 'idle'
  }

  private hashCurrent(
    instanceId: string,
    record: InstanceRecord,
    generation: number,
  ): record is InstanceRecord & { snapshot: ReadySnapshot } {
    return this.instances.get(instanceId) === record && record.hashGeneration === generation
      && record.snapshot.status === 'ready'
  }

  private watchCurrent(record: InstanceRecord, source: FileViewerSource): record is InstanceRecord & { snapshot: ReadySnapshot } {
    return this.instances.get(record.snapshot.instanceId) === record
      && this.sources.get(source.id) === source && record.watchSource === source
      && record.snapshot.status === 'ready'
  }

  private watchHashCurrent(record: InstanceRecord, source: FileViewerSource, generation: number): boolean {
    return this.watchCurrent(record, source) && record.read.generation === generation
  }

  private notify(record: InstanceRecord): void {
    record.snapshot = {
      ...record.snapshot,
      operation: this.visibleOperation(record),
      activities: {
        updating: record.read.kind === 'refreshing',
        saving: record.save.kind === 'saving',
      },
    }
    for (const listener of record.listeners) {
      try {
        listener()
      } catch {
        // A subscriber cannot starve later subscribers.
      }
    }
  }

  private assertLive(): void {
    if (this.disposed) throw new Error('file-viewer: service is disposed')
  }
}
