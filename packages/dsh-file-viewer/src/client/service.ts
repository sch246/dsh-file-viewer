import { TextDocumentSnapshot, type TextBlock, type TextChange, type TextBlockPolicy, defaultTextBlockPolicy } from './text-document.ts'
import { applyTextPatches, TextPatchError } from '@dsh-external/dsh-user-files/text-patch'
import type { UserFileDeltaResult, UserFileTextPatch } from '@dsh-external/dsh-user-files/types'
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
  readonly document?: TextDocumentSnapshot
  /** Expected canonical SHA-256, verified before this observation becomes usable. */
  readonly canonicalHash?: string
  readonly sizeBytes?: number
  readonly version?: unknown
  readonly title?: string
  readonly location?: FileViewerLocation
}

/** Sequential canonical text; only complete supplies a usable revision. */
export type FileViewerTextStreamEvent =
  | { readonly kind: 'start'; readonly sizeBytes: number; readonly resume?: boolean; readonly bytesRead?: number; readonly title?: string; readonly location?: FileViewerLocation }
  | { readonly kind: 'progress'; readonly receivedRanges: readonly FileViewerReceivedRange[] }
  | { readonly kind: 'chunk'; readonly text: string; readonly blocks?: readonly TextBlock[]; readonly bytesRead: number }
  | { readonly kind: 'complete'; readonly version: unknown; readonly sizeBytes: number; readonly canonicalHash?: string }

/** Verified received byte interval; gaps have no downloaded content. */
export interface FileViewerReceivedRange { readonly offset: number; readonly length: number }

/** One document-owned resumable read; only its caller owns accumulated canonical text. */
export interface FileViewerTextRead {
  /** @param signal Attempt cancellation. @param access Document permission. @returns Resumed canonical chunks and source validation metadata. */
  stream(signal: AbortSignal, access?: FileViewerTextAccess): AsyncIterable<FileViewerTextStreamEvent>
  /** Abort active work and release transport state. */
  dispose(): void
}

/** Source save result. */
export interface FileViewerSavedText { readonly version?: unknown; readonly sizeBytes?: number }

/** Delta publication reports the actual canonical source hash without returning its complete text. */
export interface FileViewerSavedDelta extends FileViewerSavedText { readonly canonicalHash: string }

/** Source-owned guarded updates; canonical hashes identify their exact input and output. */
export type FileViewerDeltaResult = UserFileDeltaResult

/** Live document baseline supplied to a source subscription without copying text. */
export interface FileViewerWatchContext {
  /** @returns The last verified canonical Source hash, including a retained stale baseline. */
  sourceHash(): string | undefined
  /** @returns The latest exact source byte size for polling cadence. */
  sizeBytes(): number | undefined
}

/** Exact shared-document transactions in the preceding snapshot. */
export interface FileViewerTextUpdate {
  readonly previousDocument: TextDocumentSnapshot
  readonly changes: readonly { readonly from: number; readonly to: number; readonly insert: string }[]
}

/** Source watch event. */
export type FileViewerWatchEvent =
  | { readonly kind: 'confirmation-required'; readonly error: FileViewerConfirmationRequiredError }
  | { readonly kind: 'unchanged'; readonly delta: Extract<FileViewerDeltaResult, { kind: 'unchanged' }> }
  | { readonly kind: 'delta'; readonly baseHash: string; readonly delta: Extract<FileViewerDeltaResult, { kind: 'patch' }> }
  | { readonly kind: 'manual-required'; readonly reason: string }
  | { readonly kind: 'failure'; readonly error: unknown }
  | { readonly kind: 'invalidate' }
  | { readonly kind: 'missing'; readonly error: FileViewerMissingResourceError }
  | { readonly kind: 'snapshot'; readonly snapshot: FileViewerLoadedText }

/** Per-document permission passed only after an explicit large-file load action. */
export interface FileViewerTextAccess { readonly allowLargeFile?: boolean; readonly maxConfirmedBytes?: number }

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

/** Guarded publication rejection supplied by a source without replacing its diagnostic. */
export class FileViewerSaveConflictError extends Error { readonly saveConflict = true }

function isSaveConflictError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'saveConflict' in error && error.saveConflict === true
}

/** One pluggable text source. */
export interface FileViewerSource {
  readonly id: FileViewerSourceId
  readonly defaults?: Partial<FileViewerAutomationPreferences>
  load(ref: FileViewerDocumentRef, signal: AbortSignal, access?: FileViewerTextAccess): Promise<FileViewerLoadedText>
  /** @param ref Document identity. @param baseHash Verified Source baseline. @param signal Cancellation. @param access Read approval. @returns Guarded observation or explicit full-read requirement. */
  loadDelta?(ref: FileViewerDocumentRef, baseHash: string, signal: AbortSignal, access?: FileViewerTextAccess): Promise<FileViewerDeltaResult>
  /** @param ref Shared document identity. @returns One resumable read retained through failed attempts until completion or disposal. */
  createTextRead?(ref: FileViewerDocumentRef): FileViewerTextRead
  stream?(ref: FileViewerDocumentRef, signal: AbortSignal, access?: FileViewerTextAccess): AsyncIterable<FileViewerTextStreamEvent>
  save?(ref: FileViewerDocumentRef, text: string, version: unknown, signal: AbortSignal, access?: FileViewerTextAccess): Promise<FileViewerSavedText>
  /** @param ref Document identity. @param baseText Captured canonical Base. @param text Captured Local. @param signal Cancellation. @param access Existing-content approval. @returns Actual published canonical hash; unrelated source changes may remain. */
  saveDelta?(ref: FileViewerDocumentRef, baseText: string, text: string, signal: AbortSignal, access?: FileViewerTextAccess): Promise<FileViewerSavedDelta>
  /** True only when save rejects a revision mismatch without publishing. */
  readonly supportsConditionalSave?: boolean
  watch?(ref: FileViewerDocumentRef, listener: (event: FileViewerWatchEvent) => void | Promise<void>, access?: FileViewerTextAccess, context?: FileViewerWatchContext): () => void
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
  /** Runtime-only instant of an actual load, pull, or equal-content publication. */
  readonly lastSyncedAt?: number

  readonly loadProgress?: { readonly bytesRead: number; readonly totalBytes: number; readonly complete: boolean; readonly receivedRanges?: readonly FileViewerReceivedRange[] }

  /** Last exact source byte size; local edits do not re-encode the complete document. */
  readonly sizeBytes?: number
  readonly sizeTier: 'normal' | 'large' | 'huge'
  /** One-time policy entry marker shared by all views of this open document. */
  readonly largeDefaultsApplied: boolean
  readonly draftPersistence: boolean
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
  | (CommonSnapshot & { readonly status: 'partial'; readonly text: string; readonly streamId: number })
  | (CommonSnapshot & { readonly status: 'loading' | 'failed' | 'confirmation-required' })
  | (CommonSnapshot & {
    readonly status: 'ready'
    readonly document: TextDocumentSnapshot
    readonly baseDocument: TextDocumentSnapshot
    readonly sourceDocument?: TextDocumentSnapshot
    readonly localChecked?: boolean
    readonly localEqualsBase?: boolean
    /** Explicit full-text projection; nonenumerable so metadata copies cannot materialize it. */
    readonly text: string
    /** Standard SHA-256 when known; dirty multi-block checks do not synthesize it. */
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
    readonly deltaSaveSupported?: boolean
    readonly savedWithOtherChanges?: boolean
    readonly manualUpdateRequired?: string
    readonly textUpdate?: FileViewerTextUpdate
    readonly watchSupported: boolean
    readonly externalOpenSupported: boolean
    readonly location?: FileViewerLocation
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
  localHashTimer?: ReturnType<typeof setTimeout> | undefined
  pendingLocalHash?: { generation: number; document: TextDocumentSnapshot; notBefore: number } | undefined
  localHashWork?: { document: TextDocumentSnapshot; promise: Promise<void> } | undefined
  textRead?: { source: FileViewerSource; reader: FileViewerTextRead | undefined; blocks: TextBlock[]; text: string; bytesRead: number; streamId: number; flush?: (() => void) | undefined } | undefined

  allowLargeFile: boolean
  allowHugeFile: boolean
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
  readonly largeEditCheckDelayMs?: number
  readonly textBlockPolicy?: TextBlockPolicy
  readonly progressiveFlushIntervalMs?: number
  readonly persistenceDebounceMs?: number
  readonly globalAutomationDefaults?: Partial<FileViewerAutomationPreferences>
  readonly confirmDiscard?: (snapshot: ReadySnapshot) => boolean | Promise<boolean>
  /** Injectable only to make hashing failures and completion order deterministic in tests. */
  readonly hashText?: (text: string) => Promise<string>
  /** Byte tiers supplied by validated deployment configuration; omission disables the corresponding tier. */
  readonly largeFileBytes?: number
  readonly hugeFileBytes?: number
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
  return snapshot.status === 'ready' && (snapshot.localHash === undefined ? snapshot.localEqualsBase !== true : snapshot.localHash !== snapshot.baseHash)
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

function replaceBase(snapshot: ReadySnapshot, text: string, hash: string, version: unknown, document?: TextDocumentSnapshot): ReadySnapshot {
  const { baseVersion: _baseVersion, ...rest } = snapshot
  const baseDocument = document ?? (snapshot.localHash === hash ? snapshot.document : snapshot.latestSourceHash === hash && snapshot.sourceDocument !== undefined ? snapshot.sourceDocument : snapshot.baseHash === hash ? snapshot.baseDocument : TextDocumentSnapshot.fromText(text, snapshot.document.policy))
  return { ...rest, baseText: text, baseDocument, baseHash: hash, ...(version === undefined ? {} : { baseVersion: version }) }
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
    sourceDocument: loaded.document ?? (snapshot.latestSourceHash === hash && snapshot.sourceDocument !== undefined ? snapshot.sourceDocument : snapshot.localHash === hash ? snapshot.document : snapshot.baseHash === hash ? snapshot.baseDocument : TextDocumentSnapshot.fromText(loaded.text, snapshot.document.policy)),
    latestSourceHash: hash,
    ...(loaded.version === undefined ? {} : { latestSourceVersion: loaded.version }),
    ...(loaded.location === undefined ? {} : { location: loaded.location }),
  }
}

function deriveSync(snapshot: ReadySnapshot): ReadySnapshot {
  const localHash = snapshot.localHash
  const sourceHash = snapshot.latestSourceHash
  if ((localHash === undefined && !snapshot.localChecked) || sourceHash === undefined || snapshot.sourceStale) {
    return { ...snapshot, syncStatus: 'unknown' }
  }
  const equalsBase = localHash === undefined ? snapshot.document.equals(snapshot.baseDocument) : localHash === snapshot.baseHash
  const equalsSource = localHash === undefined ? snapshot.sourceDocument !== undefined && snapshot.document.equals(snapshot.sourceDocument) : localHash === sourceHash
  let next = { ...snapshot, localEqualsBase: equalsBase }
  if (sourceHash === snapshot.baseHash) next = { ...next, baseDocument: snapshot.sourceDocument ?? snapshot.baseDocument, baseVersion: snapshot.latestSourceVersion }
  if (equalsSource) {
    return { ...replaceBase(next, snapshot.latestSourceText!, sourceHash, snapshot.latestSourceVersion), localHash: sourceHash,
      localEqualsBase: true, syncStatus: 'synced' }
  }
  if (equalsBase) return { ...next, localHash: snapshot.baseHash, syncStatus: 'source-ahead' }
  return { ...next, syncStatus: sourceHash === snapshot.baseHash ? 'local-ahead' : 'diverged' }
}

/** Full-text compatibility is deliberately nonenumerable: metadata copies cannot materialize Local. */
function exposeText(snapshot: FileViewerInstanceSnapshot): FileViewerInstanceSnapshot {
  if (snapshot.status !== 'ready') return snapshot
  Object.defineProperty(snapshot, 'text', { configurable: true, enumerable: false, get: () => snapshot.document.toString() })
  return snapshot
}

function patchOffsets(text: string, ranges: readonly UserFileTextPatch[]): FileViewerTextUpdate['changes'] {
  let line = 0, offset = 0
  const at = (target: number) => {
    while (line < target) { const end = text.indexOf('\n', offset); offset = end === -1 ? text.length : end + 1; line++ }
    return offset
  }
  return ranges.map(range => ({ from: at(range.startLine), to: at(range.startLine + range.lineCount), insert: range.replacement }))
}

/** Authoritative registry for sources and independent document controllers. */
export class FileViewerService {
  private readonly sources = new Map<FileViewerSourceId, FileViewerSource>()
  private readonly instances = new Map<string, InstanceRecord>()
  private readonly refs = new Map<string, string>()
  private readonly storage: FileViewerBrowserStorage | undefined
  private readonly debounceMs: number
  private readonly largeEditCheckDelayMs: number
  private readonly progressiveFlushIntervalMs: number
  private readonly persistenceDebounceMs: number
  private readonly confirmDiscard: (snapshot: ReadySnapshot) => boolean | Promise<boolean>
  private readonly hashText: (text: string) => Promise<string>
  private readonly textBlockPolicy: TextBlockPolicy
  private readonly largeFileBytes: number | undefined
  private readonly hugeFileBytes: number | undefined
  private globalAutomation: FileViewerAutomationPreferences
  private readonly automationDefaultListeners = new Set<() => void>()
  private nextInstance = 0
  private disposed = false

  constructor(options: FileViewerServiceOptions = {}) {
    this.storage = options.storage ?? defaultBrowserStorage()
    this.debounceMs = options.automationDebounceMs ?? 700
    this.largeEditCheckDelayMs = options.largeEditCheckDelayMs ?? 300
    this.progressiveFlushIntervalMs = options.progressiveFlushIntervalMs ?? 300
    this.persistenceDebounceMs = options.persistenceDebounceMs ?? 700
    this.confirmDiscard = options.confirmDiscard ?? (() => false)
    this.hashText = options.hashText ?? hashFileViewerText
    this.textBlockPolicy = options.textBlockPolicy ?? defaultTextBlockPolicy
    this.largeFileBytes = options.largeFileBytes
    this.hugeFileBytes = options.hugeFileBytes
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
        } else if (record.snapshot.status === 'partial') {
          record.snapshot = { ...record.snapshot, failure: { code: 'source-unavailable' } }
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
  async open(ref: FileViewerDocumentRef, sizeBytes?: number): Promise<string> {
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
      allowHugeFile: false,
      snapshot: {
        sizeTier: 'normal', largeDefaultsApplied: false, draftPersistence: true,
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
    let published = record.snapshot
    Object.defineProperty(record, 'snapshot', { get: () => published, set: (value: FileViewerInstanceSnapshot) => { published = exposeText(value) } })
    if (sizeBytes !== undefined) record.snapshot = { ...record.snapshot, sizeBytes }
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

  /** @param instanceId Shared document. @param text Complete text at an explicit replacement API. */
  edit(instanceId: string, text: string): void {
    const value = this.record(instanceId).snapshot
    if (value.status !== 'ready') return
    this.editChanges(instanceId, [{ from: 0, to: value.document.length, insert: text }])
  }

  /** @param instanceId Shared document. @param changes CodeMirror ranges in the preceding document's UTF-16 coordinates. */
  editChanges(instanceId: string, changes: readonly TextChange[]): void {
    const record = this.record(instanceId)
    if (record.snapshot.status !== 'ready' || changes.length === 0) return
    const previousDocument = record.snapshot.document
    const document = previousDocument.edit(changes)
    record.editGeneration++
    const generation = ++record.hashGeneration
    const { localHash: _hash, ...retained } = record.snapshot
    record.snapshot = { ...retained, document, localChecked: false, localEqualsBase: false,
      syncStatus: 'unknown', textUpdate: { previousDocument, changes } }
    this.scheduleDraftPersistence(record)
    this.notify(record)
    const delayed = record.snapshot.sizeTier !== 'normal' || (this.largeFileBytes !== undefined && document.byteLength > this.largeFileBytes)
    record.pendingLocalHash = { generation, document, notBefore: performance.now() + (delayed ? this.largeEditCheckDelayMs : 0) }
    if (!delayed && record.localHashWork === undefined) {
      record.pendingLocalHash = undefined
      this.hashLocalText(instanceId, record, generation, document)
    } else this.scheduleLocalHash(record)
  }

  /** Save local text only through a conditional source write. */
  async save(instanceId: string): Promise<void> {
    await this.saveRecord(this.record(instanceId), false, false)
  }

  /** Read and manually pull latest source text when local text is clean. */
  async refresh(instanceId: string): Promise<void> {
    const record = this.record(instanceId)
    await this.read(record, record.snapshot.status === 'ready' ? 'refreshing' : 'loading', record.snapshot.status === 'ready' ? 'manual' : 'initial')
  }

  /** @param instanceId Shared document whose current large-file prompt the user accepted. @returns Nothing after loading. */
  async confirmLoad(instanceId: string): Promise<void> {
    const record = this.record(instanceId)
    if (record.snapshot.loadConfirmation === undefined || record.read.controller !== undefined) return
    record.allowLargeFile = true
    if (record.snapshot.sizeTier === 'huge') record.allowHugeFile = true
    const { loadConfirmation: _confirmation, ...snapshot } = record.snapshot
    record.snapshot = snapshot.status === 'ready' ? snapshot : { ...snapshot, status: 'loading' }
    await this.read(record, snapshot.status === 'ready' ? 'refreshing' : 'loading', snapshot.status === 'ready' ? 'manual' : 'initial')
  }

  /** @param instanceId Document whose partial read should stop without discarding received text. */
  cancelLoad(instanceId: string): void {
    const record = this.record(instanceId)
    if (record.read.kind !== 'loading' && !(record.read.kind === 'refreshing' && record.textRead !== undefined)) return
    record.textRead?.flush?.()
    this.cancel(record.read, new Error('file load stopped'))
    if (record.snapshot.status === 'loading') record.snapshot = { ...record.snapshot, status: 'failed' }
    this.notify(record)
  }

  /** Publish local text through the explicit overwrite path. */
  async overwriteSource(instanceId: string): Promise<void> {
    await this.saveRecord(this.record(instanceId), false, true)
  }

  /** Replace local text with the latest observed source text. */
  discardLocal(instanceId: string): void {
    this.pullLatest(this.record(instanceId))
  }

  /** @param instanceId Shared document. @param enabled Whether future browser draft writes are enabled; existing records are retained. */
  setDraftPersistence(instanceId: string, enabled: boolean): void {
    const record = this.record(instanceId)
    record.snapshot = { ...record.snapshot, draftPersistence: enabled }
    if (enabled) this.scheduleDraftPersistence(record)
    else this.clearDraftTimer(record)
    this.notify(record)
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
    this.reconcileWatch(record)
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

  private hashLocalText(instanceId: string, record: InstanceRecord, generation: number, document: TextDocumentSnapshot): void {
    const work = { document, promise: document.check(this.hashText) }
    record.localHashWork = work
    void work.promise.then(
      () => {
        if (!this.hashCurrent(instanceId, record, generation)) return
        const hash = document.blocks.length === 1 ? document.blocks[0]!.hash : undefined
        let next = deriveSync({ ...record.snapshot, localChecked: true, ...(hash === undefined ? {} : { localHash: hash }) })
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
    ).finally(() => {
      if (record.localHashWork === work) record.localHashWork = undefined
      this.scheduleLocalHash(record)
    })
  }

  private clearLocalHash(record: InstanceRecord): void {
    clearTimeout(record.localHashTimer)
    record.localHashTimer = undefined
    record.pendingLocalHash = undefined
  }

  private scheduleLocalHash(record: InstanceRecord): void {
    clearTimeout(record.localHashTimer)
    record.localHashTimer = undefined
    const pending = record.pendingLocalHash
    if (pending === undefined || record.localHashWork !== undefined) return
    if (pending.notBefore <= performance.now()) {
      record.pendingLocalHash = undefined
      if (this.hashCurrent(record.snapshot.instanceId, record, pending.generation)) this.hashLocalText(record.snapshot.instanceId, record, pending.generation, pending.document)
      return
    }
    record.localHashTimer = setTimeout(() => {
      record.localHashTimer = undefined
      if (record.pendingLocalHash !== pending) return
      record.pendingLocalHash = undefined
      if (this.hashCurrent(record.snapshot.instanceId, record, pending.generation)) {
        this.hashLocalText(record.snapshot.instanceId, record, pending.generation, pending.document)
      }
    }, Math.max(0, pending.notBefore - performance.now()))
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
    if (mode === 'manual' && source?.loadDelta !== undefined) this.detachWatch(record)
    const operation = this.begin(record.read, operationName)
    this.notify(record)
    if (source === undefined) {
      const failure = { code: 'source-unavailable' } as const
      if (this.complete(record.read, operation)) this.publishReadFailure(record, failure)
      return failure
    }

    let loaded: FileViewerLoadedText
    let verifiedHash: string | undefined
    try {
      const previous = record.snapshot
      const delta = mode === 'manual' && source.loadDelta !== undefined && previous.status === 'ready'
        && previous.latestSourceText !== undefined && previous.latestSourceHash !== undefined
        ? await source.loadDelta(previous.ref, previous.latestSourceHash, operation.controller.signal, this.textAccess(record)) : undefined
      if (delta?.kind === 'unchanged' || delta?.kind === 'patch') {
        if (previous.status !== 'ready' || previous.latestSourceText === undefined) throw new Error('file-viewer: delta baseline unavailable')
        const text = delta.kind === 'patch' ? await applyTextPatches(previous.latestSourceText, delta.ranges, this.hashText) : previous.latestSourceText
        verifiedHash = delta.kind === 'unchanged' ? previous.latestSourceHash : await this.hashText(text)
        if (verifiedHash !== delta.canonicalHash) throw new Error('file-viewer: source delta hash mismatch')
        loaded = { text, document: delta.kind === 'patch' ? previous.sourceDocument!.edit(patchOffsets(previous.latestSourceText, delta.ranges)) : previous.sourceDocument!, version: delta.version, sizeBytes: delta.sizeBytes }
      } else loaded = source.createTextRead !== undefined || (mode === 'initial' && record.allowLargeFile && source.stream !== undefined)
        ? await this.readStream(record, source, operation)
        : await source.load(record.snapshot.ref, operation.controller.signal, this.textAccess(record))
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
    this.observeSize(record, loaded.sizeBytes ?? record.snapshot.sizeBytes)
    const persisted = mode === 'initial' && record.snapshot.status !== 'ready'
      ? this.readDraft(record.snapshot.ref)
      : undefined
    let hash: string
    let restored: RestoredDraft | undefined
    try {
      if (persisted === undefined) {
        hash = verifiedHash ?? await this.hashText(loaded.text)
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
      if (loaded.canonicalHash !== undefined && hash !== loaded.canonicalHash) throw new Error('file-viewer: completed source hash mismatch')
      const document = loaded.document ?? TextDocumentSnapshot.fromText(loaded.text, this.textBlockPolicy)
      if (document.blocks.length === 1) document.blocks[0]!.hash = hash
      else await document.check(this.hashText)
      loaded = { ...loaded, document }
    } catch (error: unknown) {
      if (!this.complete(record.read, operation)) return undefined
      this.releaseTextRead(record)
      const failure = toFailure('hash-failed', error)
      this.publishReadFailure(record, failure)
      return failure
    }

    if (!this.complete(record.read, operation) || this.instances.get(record.snapshot.instanceId) !== record) return undefined
    this.releaseTextRead(record)
    if (record.snapshot.loadProgress !== undefined) record.snapshot = { ...record.snapshot, loadProgress: { ...record.snapshot.loadProgress, complete: true } }
    this.applyObserved(record, source, loaded, hash, mode, restored)
    return undefined
  }

  private async readStream(record: InstanceRecord, source: FileViewerSource, operation: ActiveOperation): Promise<FileViewerLoadedText> {
    const signal = operation.controller.signal
    if (record.textRead?.source !== source || source.createTextRead === undefined) this.releaseTextRead(record)
    const state = record.textRead ??= { source, reader: source.createTextRead?.(record.snapshot.ref), blocks: [], text: '', bytesRead: 0, streamId: operation.generation }
    const preview = record.snapshot.status !== 'ready'
    let metadata: Extract<FileViewerTextStreamEvent, { kind: 'start' }> | undefined
    let completed: Extract<FileViewerTextStreamEvent, { kind: 'complete' }> | undefined
    let ranges: readonly FileViewerReceivedRange[] | undefined
    let timer: ReturnType<typeof setTimeout> | undefined
    let first = state.text === ''
    const flush = () => {
      clearTimeout(timer)
      timer = undefined
      if (!this.current(record.read, operation) || metadata === undefined) return
      const snapshot: FileViewerInstanceSnapshot = preview && (!first || completed !== undefined)
        ? { ...record.snapshot, status: 'partial' as const, text: state.text, streamId: state.streamId } : record.snapshot
      record.snapshot = { ...snapshot,
        loadProgress: { bytesRead: state.bytesRead, totalBytes: metadata.sizeBytes, complete: false,
          ...(ranges === undefined ? {} : { receivedRanges: ranges }) } }
      this.notify(record)
    }
    state.flush = flush
    try {
      const events = state.reader?.stream(signal, this.textAccess(record)) ?? source.stream!(record.snapshot.ref, signal, this.textAccess(record))
      for await (const event of events) {
        signal.throwIfAborted()
        if (!this.current(record.read, operation)) throw new Error('file-viewer: stale text stream')
        if (completed !== undefined) throw new Error('file-viewer: text stream continued after completion')
        if (event.kind === 'start') {
          if (metadata !== undefined) throw new Error('file-viewer: duplicate text stream start')
          metadata = event
          if (!event.resume) { state.blocks = []; state.text = ''; state.bytesRead = 0; state.streamId = operation.generation; first = true }
          if ((event.bytesRead ?? 0) !== state.bytesRead) throw new Error('file-viewer: inconsistent resumed prefix')
          this.observeSize(record, event.sizeBytes)
          flush()
        } else if (event.kind === 'progress') {
          ranges = event.receivedRanges
          // Positional receipt is cheap metadata; text publication remains coalesced.
          record.snapshot = { ...record.snapshot, loadProgress: { bytesRead: state.bytesRead, totalBytes: metadata!.sizeBytes,
            complete: false, receivedRanges: ranges } }
          this.notify(record)
        } else if (event.kind === 'chunk') {
          if (metadata === undefined || event.bytesRead < state.bytesRead || event.bytesRead > metadata.sizeBytes) throw new Error('file-viewer: invalid text stream progress')
          state.bytesRead = event.bytesRead
          state.text += event.text
          state.blocks.push(...(event.blocks ?? TextDocumentSnapshot.fromText(event.text, this.textBlockPolicy).blocks))
          if (first && event.text !== '') { first = false; flush() }
          else if (!first) timer ??= setTimeout(flush, this.progressiveFlushIntervalMs)
        } else {
          if (metadata === undefined || state.bytesRead !== metadata.sizeBytes || event.sizeBytes !== metadata.sizeBytes) throw new Error('file-viewer: incomplete text stream')
          completed = event
        }
      }
      signal.throwIfAborted()
      if (metadata === undefined || completed === undefined) throw new Error('file-viewer: text stream ended before completion')
      flush()
      return { text: state.text, document: TextDocumentSnapshot.fromBlocks(state.blocks, this.textBlockPolicy), sizeBytes: completed.sizeBytes, version: completed.version,
        ...(completed.canonicalHash === undefined ? {} : { canonicalHash: completed.canonicalHash }),
        ...(metadata.title === undefined ? {} : { title: metadata.title }),
        ...(metadata.location === undefined ? {} : { location: metadata.location }) }
    } catch (error: unknown) {
      flush()
      throw error
    } finally { clearTimeout(timer); if (state.flush === flush) state.flush = undefined }
  }

  private requireConfirmation(record: InstanceRecord, error: FileViewerLoadConfirmation): void {
    record.pauseReason = 'confirmation'
    this.cancel(record.read, new Error('load confirmation required'))
    this.detachWatch(record)
    this.clearAutomationTimers(record)
    this.observeSize(record, error.sizeBytes)
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
      : record.snapshot.status === 'partial' ? { ...record.snapshot, resourceMissing, failure } : {
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
    this.observeSize(record, loaded.sizeBytes ?? record.snapshot.sizeBytes)
    const { manualUpdateRequired: _manual, ...previous } = record.snapshot as FileViewerInstanceSnapshot & { manualUpdateRequired?: string }
    let next: ReadySnapshot
    if (previous.status !== 'ready') {
      const document = restored === undefined ? loaded.document ?? TextDocumentSnapshot.fromText(loaded.text, this.textBlockPolicy) : TextDocumentSnapshot.fromText(restored.localText, this.textBlockPolicy)
      const baseDocument = restored === undefined || restored.baseText === restored.localText ? document : TextDocumentSnapshot.fromText(restored.baseText, this.textBlockPolicy)
      const sourceDocument = restored === undefined || restored.localText === loaded.text ? document : TextDocumentSnapshot.fromText(loaded.text, this.textBlockPolicy)
      next = deriveSync({
        document, baseDocument, sourceDocument,
        ...(previous.sizeBytes === undefined ? {} : { sizeBytes: previous.sizeBytes }),
        sizeTier: previous.sizeTier, largeDefaultsApplied: previous.largeDefaultsApplied, draftPersistence: previous.draftPersistence,
        ...(previous.loadProgress === undefined ? {} : { loadProgress: { ...previous.loadProgress, complete: true } }),
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
        saveSupported: source.save !== undefined || source.saveDelta !== undefined,
        conditionalSaveSupported: source.saveDelta !== undefined || (source.save !== undefined && source.supportsConditionalSave === true),
        deltaSaveSupported: source.saveDelta !== undefined,
        watchSupported: source.watch !== undefined,
        externalOpenSupported: source.openExternal !== undefined,
        ...(loaded.location === undefined ? {} : { location: loaded.location }),
        automation: previous.automation,
        automationPaused: false,
      })
    } else {
      const pull = mode === 'manual' && !isFileViewerDirty(previous)
      next = replaceLatestSource({
        ...clearFailure(previous),
        resourceMissing: false,
        title: loaded.title ?? previous.ref.resourceId,
        sourceStale: false,
        saveSupported: source.save !== undefined || source.saveDelta !== undefined,
        conditionalSaveSupported: source.saveDelta !== undefined || (source.save !== undefined && source.supportsConditionalSave === true),
        deltaSaveSupported: source.saveDelta !== undefined,
        watchSupported: source.watch !== undefined,
        externalOpenSupported: source.openExternal !== undefined,
      }, loaded, hash)
      if (pull) {
        record.hashGeneration += 1
        next = replaceBase({ ...next, document: loaded.document ?? next.sourceDocument!, localHash: hash }, loaded.text, hash, loaded.version)
      }
      next = deriveSync(next)
    }
    if (missingFailure === undefined && (previous.status !== 'ready' || (mode === 'manual' && next.syncStatus === 'synced'))) {
      next = { ...next, lastSyncedAt: Date.now() }
    }
    const retainOtherChanges = mode === 'observe' && previous.status === 'ready' && previous.savedWithOtherChanges === true && next.syncStatus !== 'synced'
    next = { ...next, savedWithOtherChanges: retainOtherChanges }
    record.pauseReason = missingFailure !== undefined || retainOtherChanges ? 'failure' : undefined
    if (missingFailure !== undefined) {
      const { latestSourceText: _text, latestSourceHash: _hash, latestSourceVersion: _version, ...retained } = next
      next = { ...retained, sourceStale: true, syncStatus: 'unknown', resourceMissing: true, failure: missingFailure }
    }
    next = this.reconcilePause(record, next)
    record.snapshot = next
    this.scheduleDraftPersistence(record)
    this.reconcileWatch(record)
    this.notify(record)
    this.scheduleAutomation(record, true)
  }

  private reconcileWatch(record: InstanceRecord): void {
    const source = this.sources.get(record.snapshot.ref.sourceId)
    const value = record.snapshot
    if (source === undefined || value.status !== 'ready' || value.loadConfirmation !== undefined || value.manualUpdateRequired !== undefined
      || (value.sizeTier !== 'normal' && !value.automation.autoUpdate && !value.automation.autoSave)) {
      this.detachWatch(record)
      return
    }
    this.attachWatch(record, source)
  }

  private attachWatch(record: InstanceRecord, source: FileViewerSource): void {
    if (source.watch === undefined || record.watchSource === source) return
    this.detachWatch(record)
    record.watchSource = source
    try {
      record.watchDispose = source.watch(record.snapshot.ref, event => {
        return this.onWatch(record, source, event).catch(error => {
          if (!this.watchCurrent(record, source)) return
          record.pauseReason = 'failure'
          record.snapshot = {
            ...record.snapshot,
            automationPaused: true,
            failure: toFailure('watch-failed', error),
          }
          this.notify(record)
          this.clearAutomationTimers(record)
          throw error
        })
      }, this.textAccess(record), {
        sourceHash: () => record.snapshot.status === 'ready' ? record.snapshot.latestSourceHash : undefined,
        sizeBytes: () => record.snapshot.sizeBytes,
      })
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
    if (event.kind === 'failure') {
      this.publishReadFailure(record, toFailure('watch-failed', event.error))
      return
    }
    if (event.kind === 'invalidate') {
      record.snapshot = { ...record.snapshot, sourceStale: true, syncStatus: 'unknown' }
      this.notify(record)
      this.clearTimer(record, 'autoUpdate')
      await this.read(record, 'refreshing', 'observe')
      return
    }
    if (event.kind === 'manual-required') {
      this.detachWatch(record)
      record.pauseReason = 'failure'
      record.snapshot = { ...record.snapshot, sourceStale: true, syncStatus: 'unknown', automationPaused: true,
        manualUpdateRequired: event.reason }
      this.notify(record)
      this.clearAutomationTimers(record)
      return
    }
    if (event.kind === 'unchanged') {
      const current = record.snapshot
      if (record.read.controller !== undefined || record.save.controller !== undefined
        || current.latestSourceHash !== event.delta.canonicalHash || current.latestSourceText === undefined) return
      if (!current.sourceStale && !current.resourceMissing && current.failure === undefined
        && current.latestSourceVersion === event.delta.version && current.sizeBytes === event.delta.sizeBytes) return
      this.applyObserved(record, source, { text: current.latestSourceText, version: event.delta.version, sizeBytes: event.delta.sizeBytes }, event.delta.canonicalHash, 'observe')
      return
    }
    if (event.kind === 'delta') {
      await this.applyWatchedDelta(record, source, event)
      return
    }

    this.cancel(record.read, new Error('source snapshot superseded read'))
    const generation = record.read.generation
    this.observeSize(record, event.snapshot.sizeBytes ?? record.snapshot.sizeBytes)
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

  private async applyWatchedDelta(record: InstanceRecord & { snapshot: ReadySnapshot }, source: FileViewerSource,
    event: Extract<FileViewerWatchEvent, { kind: 'delta' }>): Promise<void> {
    const previous = record.snapshot
    if (previous.latestSourceHash !== event.baseHash || previous.latestSourceText === undefined) return
    // A foreground operation owns its result; this observation can be requested again afterward.
    if (record.read.controller !== undefined || record.save.controller !== undefined) return
    const generation = record.read.generation
    this.observeSize(record, event.delta.sizeBytes)
    this.notify(record)
    const sourceText = await applyTextPatches(previous.latestSourceText, event.delta.ranges, this.hashText)
    const sourceHash = await this.hashText(sourceText)
    if (sourceHash !== event.delta.canonicalHash) throw new Error('file-viewer: source delta hash mismatch')
    if (!this.watchHashCurrent(record, source, generation) || record.save.controller !== undefined || record.snapshot.latestSourceHash !== event.baseHash) return
    let current = record.snapshot
    if (record.pauseReason === 'failure' && !current.savedWithOtherChanges) record.pauseReason = undefined
    const automatic = current.automation.autoUpdate && record.pauseReason === undefined && record.presented
    let localText: string | undefined
    let localHash: string | undefined
    const capturedText = current.document.toString()
    if (automatic && current.baseHash === event.baseHash) {
      try {
        localText = capturedText === previous.latestSourceText ? sourceText
          : await applyTextPatches(capturedText, event.delta.ranges, this.hashText)
        localHash = localText === sourceText ? sourceHash : await this.hashText(localText)
      } catch (error: unknown) {
        if (!(error instanceof TextPatchError) || error.code !== 'stale-version') throw error
        // Exact-position local range mismatches retain Local for manual reconciliation.
      }
    }
    if (!this.watchHashCurrent(record, source, generation) || record.save.controller !== undefined || record.snapshot.latestSourceHash !== event.baseHash) return
    current = record.snapshot
    const { manualUpdateRequired: _manual, ...retained } = clearFailure(current)
    let next = replaceLatestSource({ ...retained, sourceStale: false, resourceMissing: false },
      { text: sourceText, document: previous.sourceDocument!.edit(patchOffsets(previous.latestSourceText, event.delta.ranges)), version: event.delta.version, sizeBytes: event.delta.sizeBytes }, sourceHash)
    if (automatic && localText !== undefined && localHash !== undefined && current.document.toString() === capturedText) {
      record.hashGeneration++
      next = replaceBase({ ...next, document: current.document.edit(patchOffsets(capturedText, event.delta.ranges)), localHash,
        textUpdate: { previousDocument: current.document, changes: patchOffsets(capturedText, event.delta.ranges) },
        ...(localHash === sourceHash ? { lastSyncedAt: Date.now() } : {}) }, sourceText, sourceHash, event.delta.version)
      record.pauseReason = undefined
    } else if (automatic) {
      record.pauseReason = 'conflict'
      next = { ...next, manualUpdateRequired: 'conflict' }
    }
    next = this.reconcilePause(record, deriveSync(next))
    record.snapshot = next
    this.scheduleDraftPersistence(record)
    this.reconcileWatch(record)
    this.notify(record)
    this.scheduleAutomation(record, true)
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
    if (source === undefined || (source.save === undefined && source.saveDelta === undefined)) {
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
    if (!overwrite && source.saveDelta === undefined && (value.sourceStale || value.latestSourceHash === undefined
      || value.latestSourceHash !== value.baseHash)) {
      this.publishSaveBlock(record, { code: 'save-conflict', message: 'source changed since the local base was observed' })
      return
    }
    if (!overwrite && (!isFileViewerDirty(value) || value.document.toString() === value.baseText)) return
    if (overwrite && !value.sourceStale && value.document.toString() === value.latestSourceText) return

    const operation = this.begin(record.save, 'saving')
    this.clearTimer(record, 'autoSave')
    this.notify(record)
    this.clearLocalHash(record)
    const savedText = value.document.toString()
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
    if (!overwrite && source.saveDelta === undefined && (current.sourceStale || current.latestSourceHash === undefined
      || current.latestSourceHash !== current.baseHash)) {
      if (this.complete(record.save, operation)) {
        this.publishSaveBlock(record, { code: 'save-conflict', message: 'source changed while preparing the save' })
      }
      return
    }
    if (overwrite && source.saveDelta !== undefined && (current.sourceStale || current.latestSourceText === undefined)) {
      if (this.complete(record.save, operation)) this.publishSaveBlock(record, { code: 'save-conflict', message: 'refresh the source before explicitly overwriting its changes' })
      return
    }
    const version = overwrite ? current.latestSourceVersion : current.baseVersion
    try {
      const saved = source.saveDelta !== undefined
        ? await source.saveDelta(value.ref, overwrite ? current.latestSourceText! : value.baseText, savedText, operation.controller.signal, this.textAccess(record))
        : await source.save!(value.ref, savedText, version, operation.controller.signal, this.textAccess(record))
      if (!this.complete(record.save, operation) || record.snapshot.status !== 'ready') return
      this.cancel(record.read, new Error('successful save superseded source read'))
      this.observeSize(record, saved.sizeBytes)
      if ('canonicalHash' in saved && saved.canonicalHash !== savedHash) {
        const retained = clearFailure(record.snapshot)
        record.pauseReason = 'failure'
        record.snapshot = replaceBase({ ...retained, ...(retained.document.toString() === savedText ? { localHash: savedHash } : {}), resourceMissing: false, sourceStale: true,
          syncStatus: 'unknown', savedWithOtherChanges: true, automationPaused: true }, savedText, savedHash, saved.version, value.document)
        this.clearAutomationTimers(record)
        this.scheduleDraftPersistence(record)
        this.notify(record)
        return
      }
      record.pauseReason = undefined
      const { manualUpdateRequired: _manual, ...savedSnapshot } = clearFailure(record.snapshot)
      let next = replaceLatestSource({
        ...savedSnapshot,
        ...(savedSnapshot.document.toString() === savedText ? { localHash: savedHash } : {}),
        savedWithOtherChanges: false,
        lastSyncedAt: Date.now(),
        resourceMissing: false,
        sourceStale: false,
      }, { text: savedText, document: value.document, version: saved.version }, savedHash)
      next = replaceBase(next, savedText, savedHash, saved.version, value.document)
      next = this.reconcilePause(record, deriveSync(next))
      record.snapshot = next
      this.scheduleDraftPersistence(record)
      this.reconcileWatch(record)
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
        failure: toFailure(isSaveConflictError(error) ? 'save-conflict' : 'save-failed', error),
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
      document: value.sourceDocument!,
      localHash: value.latestSourceHash,
      syncStatus: 'synced',
      lastSyncedAt: Date.now(),
      savedWithOtherChanges: false,
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
    if (this.storage === undefined || record.snapshot.status !== 'ready' || !record.snapshot.draftPersistence) return
    clearTimeout(record.draftTimer)
    record.draftTimer = setTimeout(() => {
      record.draftTimer = undefined
      this.persistDraft(record)
    }, this.persistenceDebounceMs)
  }

  private persistDraft(record: InstanceRecord): void {
    if (this.storage === undefined || record.snapshot.status !== 'ready' || !record.snapshot.draftPersistence) return
    const written = {
      baseText: record.snapshot.baseText,
      localText: record.snapshot.document.toString(),
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
      && !value.sourceStale && value.syncStatus === 'local-ahead'
      && value.latestSourceHash === value.baseHash
  }

  private textAccess(record: InstanceRecord): FileViewerTextAccess {
    return { allowLargeFile: record.allowLargeFile,
      ...(record.allowHugeFile || this.hugeFileBytes === undefined ? {} : { maxConfirmedBytes: this.hugeFileBytes }),
    }
  }

  private observeSize(record: InstanceRecord, sizeBytes: number | undefined): void {
    if (sizeBytes === undefined) return
    const sizeTier = this.hugeFileBytes !== undefined && sizeBytes > this.hugeFileBytes ? 'huge'
      : this.largeFileBytes !== undefined && sizeBytes > this.largeFileBytes ? 'large' : 'normal'
    record.snapshot = { ...record.snapshot, sizeBytes, sizeTier }
    if (sizeTier === 'normal' || record.snapshot.largeDefaultsApplied) return
    record.snapshot = { ...record.snapshot, largeDefaultsApplied: true, draftPersistence: false,
      automation: { autoUpdate: false, autoSave: false },
    }
    this.clearDraftTimer(record)
    this.clearAutomationTimers(record)
    this.detachWatch(record)
  }

  private reconcilePause(record: InstanceRecord, snapshot: ReadySnapshot): ReadySnapshot {
    const value = snapshot
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

  private releaseTextRead(record: InstanceRecord): void {
    record.textRead?.reader?.dispose()
    record.textRead = undefined
  }

  private stop(record: InstanceRecord, reason: Error): void {
    this.clearLocalHash(record)
    record.hashGeneration += 1
    this.releaseTextRead(record)
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
    return this.instances.get(record.snapshot.instanceId) === record && record.snapshot.status === 'ready'
      && this.sources.get(source.id) === source && record.read.generation === generation
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
