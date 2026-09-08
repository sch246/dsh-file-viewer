import type { EditorLanguage } from './editor-languages.ts'
import type { FileViewerTextChange } from './editor-module.ts'
import type { ComponentType } from 'react'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type {
  FileViewerInstanceSnapshot,
  FileViewerTextStreamEvent,
  FileViewerSavedDelta,
  FileViewerTextAccess,
  FileViewerConfirmationRequiredError,
  FileViewerMissingResourceError,
  FileViewerWatchEvent,
  FileViewerWatchContext,
  FileViewerDeltaResult,
} from './service.ts'

/**
 * Rejection a source raises from `readText` or `readBytes` when its resource no longer exists.
 * The workbench keeps the view and its local text, marks the tab, and pauses automation.
 */
export { FileViewerMissingResourceError as ResourceMissingError } from './service.ts'

/** A source rejects a guarded save because an addressed range no longer matches. */
export { FileViewerSaveConflictError as ResourceSaveConflictError } from './service.ts'

/** Source request for a document-scoped decision before loading large text content. */
export { FileViewerConfirmationRequiredError as ResourceConfirmationRequiredError } from './service.ts'

/** Explicit large-file permission scoped to one open text document. */
export type ResourceTextAccess = FileViewerTextAccess

/** Stable source identifier contributed by a resource provider. */
export type ResourceSourceId = string & { readonly __resourceSourceId: unique symbol }

/** @param value Non-empty provider-stable value. @returns Branded resource source id. */
export function ResourceSourceId(value: string): ResourceSourceId {
  if (value.trim() === '') throw new Error('resource-workbench: source id must not be empty')
  return value as ResourceSourceId
}

/** Stable resource-handler identifier. */
export type ResourceHandlerId = string & { readonly __resourceHandlerId: unique symbol }

/** @param value Non-empty handler-stable value. @returns Branded resource handler id. */
export function ResourceHandlerId(value: string): ResourceHandlerId {
  if (value.trim() === '') throw new Error('resource-workbench: handler id must not be empty')
  return value as ResourceHandlerId
}

/** Exact identity of one source-owned resource. */
export interface ResourceRef {
  readonly sessionId: SessionId
  readonly sourceId: ResourceSourceId
  readonly resourceId: string
}

/** Optional source-owned location projection. */
export interface ResourceLocation {
  readonly label?: string
  readonly segments?: readonly { readonly label: string; readonly selectionHint?: unknown }[]
  readonly selectorId?: string
  /** The source supplies location selection without a sidebar launcher. */
  readonly selectable?: boolean
}

/** Metadata used for handler selection and workbench presentation. */
export interface ResourceDescriptor {
  readonly ref: ResourceRef
  readonly name: string
  readonly mediaType?: string
  readonly kind?: string
  readonly size?: number
  readonly location?: ResourceLocation
}

/** Exact source text with an opaque revision and optional refreshed metadata. */
export interface ResourceLoadedText {
  readonly text: string
  readonly version?: unknown
  readonly descriptor?: Partial<Omit<ResourceDescriptor, 'ref'>>
}

/** Sequential text events with source-owned opening metadata. */
export type ResourceTextStreamEvent = Exclude<FileViewerTextStreamEvent, { kind: 'start' }>
  | { readonly kind: 'start'; readonly sizeBytes: number; readonly resume?: boolean; readonly bytesRead?: number; readonly descriptor?: Partial<Omit<ResourceDescriptor, 'ref'>> }

/** Document-owned source read that retains only transport state between attempts. */
export interface ResourceTextRead {
  /** @param signal Attempt cancellation; completed chunks remain resumable. @param access Document permission. @returns Contiguous text, independent receipt ranges and final revision/digest. */
  stream(signal: AbortSignal, access?: ResourceTextAccess): AsyncIterable<ResourceTextStreamEvent>
  /** Abort outstanding requests and release retained transfer state. */
  dispose(): void
}

/** Source bytes with an opaque revision and optional refreshed metadata. */
export interface ResourceLoadedBytes {
  readonly bytes: Uint8Array
  readonly version?: unknown
  readonly descriptor?: Partial<Omit<ResourceDescriptor, 'ref'>>
}

/** Result of publishing text to a source. */
export interface ResourceSavedText { readonly version?: unknown; readonly sizeBytes?: number }

/** Prepared destination identity and the source-owned revision required for publication. */
export interface ResourceTextSaveAsTarget {
  readonly descriptor: ResourceDescriptor
  readonly exists: boolean
  readonly version?: unknown
}

/** Actual canonical source hash after a guarded delta publication. */
export type ResourceSavedDelta = FileViewerSavedDelta

/** Result of publishing bytes to a source. */
export interface ResourceSavedBytes { readonly version?: unknown }

/** Resolved automatic update and save preferences. */
export interface ResourceAutomationPreferences {
  readonly autoUpdate: boolean
  readonly autoSave: boolean
}

/** Shared text-document projection exposed to text handlers. */
export type TextDocumentSnapshot = FileViewerInstanceSnapshot

/** A resource provider; text and byte reading are independent capabilities. */
export interface ResourceSource {
  readonly id: ResourceSourceId
  readonly defaults?: Partial<ResourceAutomationPreferences>
  /** @param ref Exact resource identity. @param selection Persisted source-owned hint. @returns Nothing after opening the location. */
  selectLocation?(ref: ResourceRef, selection?: unknown): Promise<void>
  /** @param ref Exact resource identity. @returns In-page resumable read retained by the shared document, released on completion, last close or source disposal. */
  createTextRead?(ref: ResourceRef): ResourceTextRead
  /** @param ref Exact resource identity. @param signal Cancellation signal. @param access Explicit document permission. @returns Ordered provisional chunks and a completion revision, used for approved initial loads. */
  streamText?(ref: ResourceRef, signal: AbortSignal, access?: ResourceTextAccess): AsyncIterable<ResourceTextStreamEvent>
  /** @param ref Exact resource identity. @param signal Cancellation signal. @param access Explicit document permission; approval rejection precedes content reads. @returns Complete canonical source text and revision. */
  readText?(ref: ResourceRef, signal: AbortSignal, access?: ResourceTextAccess): Promise<ResourceLoadedText>
  /** @param ref Exact resource identity. @param baseHash Verified Source hash. @param signal Cancellation. @param access Read approval. @returns Delta-first explicit observation. */
  readTextDelta?(ref: ResourceRef, baseHash: string, signal: AbortSignal, access?: ResourceTextAccess): Promise<FileViewerDeltaResult>
  /** @param ref Exact resource identity. @param signal Cancellation signal. @returns Opaque source bytes and revision. */
  readBytes?(ref: ResourceRef, signal: AbortSignal): Promise<ResourceLoadedBytes>
  /** @param ref Exact resource identity. @param text Canonical text to publish. @param version Caller-observed revision. @param signal Cancellation signal. @param access Explicit document permission, also covering large saves. @returns Published revision. */
  saveText?(ref: ResourceRef, text: string, version: unknown, signal: AbortSignal, access?: ResourceTextAccess): Promise<ResourceSavedText>
  /** @param ref Exact identity. @param baseText Canonical original Base held locally. @param text Captured Local. @param signal Cancellation. @param access Read approval. @returns Actual published hash; differing source content outside guarded changes may remain. */
  saveTextDelta?(ref: ResourceRef, baseText: string, text: string, signal: AbortSignal, access?: ResourceTextAccess): Promise<ResourceSavedDelta>
  /** @param ref Current resource. @param path User-selected destination. @param signal Cancellation. @returns Canonical destination and observed existence/revision; does not publish text. */
  prepareTextSaveAs?(ref: ResourceRef, path: string, signal: AbortSignal): Promise<ResourceTextSaveAsTarget>
  /** @param ref Current resource. @param target Prepared destination; publication must reject changed existence or revision. @param text Exact captured Local. @param signal Cancellation. @returns Published revision and exact canonical hash, without changing canonical text. */
  saveTextAs?(ref: ResourceRef, target: ResourceTextSaveAsTarget, text: string, signal: AbortSignal): Promise<ResourceSavedDelta>
  /** Provider declaration that `saveText` rejects its recognized revision mismatch before publishing. */
  readonly supportsConditionalTextSave?: boolean
  /** @param ref Exact resource identity. @param listener Text notification receiver; confirmation-required pauses the subscription until explicit approval. @param access Permission retained by this document subscription. @returns Source watch disposer. */
  watchText?(ref: ResourceRef, listener: (event: ResourceTextWatchEvent) => void | Promise<void>, access?: ResourceTextAccess, context?: FileViewerWatchContext): () => void
  /** @param ref Exact resource identity. @param bytes Opaque bytes to publish. @param version Caller-observed revision. @param signal Cancellation signal. @returns Published revision. */
  saveBytes?(ref: ResourceRef, bytes: Uint8Array, version: unknown, signal: AbortSignal): Promise<ResourceSavedBytes>
  /** Provider declaration that `saveBytes` rejects its recognized revision mismatch before publishing. */
  readonly supportsConditionalByteSave?: boolean
  /** @param ref Exact resource identity. @param listener Byte notification receiver. @returns Source watch disposer. */
  watchBytes?(ref: ResourceRef, listener: (event: ResourceBytesWatchEvent) => void | Promise<void>): () => void
  /** @param ref Exact resource identity. @param signal Cancellation signal. @returns Nothing after source-owned external opening. */
  openExternal?(ref: ResourceRef, signal: AbortSignal): Promise<void>
}

/** Text watch notification with source-owned metadata. */
export type ResourceTextWatchEvent =
  | Extract<FileViewerWatchEvent, { kind: 'delta' | 'unchanged' | 'manual-required' | 'failure' }>
  | { readonly kind: 'confirmation-required'; readonly error: FileViewerConfirmationRequiredError }
  | { readonly kind: 'invalidate' }
  | { readonly kind: 'missing'; readonly error: FileViewerMissingResourceError }
  | { readonly kind: 'snapshot'; readonly snapshot: ResourceLoadedText }

/** Byte watch notification; invalidation never implies decoded content. */
export type ResourceBytesWatchEvent =
  | { readonly kind: 'failure'; readonly error: unknown }
  | { readonly kind: 'invalidate' }
  | { readonly kind: 'missing'; readonly error: FileViewerMissingResourceError }
  | { readonly kind: 'snapshot'; readonly snapshot: ResourceLoadedBytes }

/** Handler-visible source capabilities without exposing the source registry. */
export interface ResourceCapabilities {
  readonly text: boolean
  readonly textSaveAs: boolean
  readonly bytes: boolean
  readonly byteWrite: boolean
  readonly conditionalByteWrite: boolean
  readonly byteWatch: boolean
  readonly externalOpen: boolean
}

/** Handler match role; priority resolves unequal defaults only. */
export interface ResourceHandlerMatch {
  readonly role: 'default' | 'available'
  readonly priority?: number
}

/** Props supplied to a lazily loaded resource handler. */
export interface ResourceHandlerProps {
  readonly viewId: string
  readonly handlerId: ResourceHandlerId
  readonly service: ResourceWorkbenchClientService
}

/** Lazily loaded renderer for one handler. */
export interface ResourceHandlerModule {
  readonly View: ComponentType<ResourceHandlerProps>
}

/** One pluggable resource presentation. */
export interface ResourceHandler {
  readonly id: ResourceHandlerId
  readonly label: string | (() => string)
  /** Attach the shared Base/Local/Source document; switching between text participants retains automation. */
  readonly document?: 'text'
  /** @param descriptor Resource metadata. @param capabilities Available source operations. @returns Match role or false when unsupported. */
  match(descriptor: ResourceDescriptor, capabilities: ResourceCapabilities): ResourceHandlerMatch | false
  /** @returns Lazily imported renderer module. */
  load(): Promise<ResourceHandlerModule>
}

/** User-facing handler choice for one descriptor. */
export interface ResourceHandlerChoice {
  readonly id: ResourceHandlerId
  readonly label: string
  readonly role: 'default' | 'available'
  readonly selected: boolean
  readonly associated: boolean
}

/** Relative or explicit sidebar destination for a resource view. */
export type ResourceOpenTarget =
  | { readonly groupId: string }
  | {
    readonly fromInstanceId: string
    readonly direction: 'center' | 'left' | 'right' | 'up' | 'down'
  }

/** Placement and presentation intent for one open request. */
export interface ResourceOpenOptions {
  readonly handlerId?: ResourceHandlerId
  readonly target?: ResourceOpenTarget
  readonly preview?: boolean
  /** Force another view even when the target group already contains the same resource and handler. */
  readonly sideBySide?: boolean
}

/** Generic view state owned by the resource workbench. */
export interface ResourceViewSnapshot {
  readonly viewId: string
  readonly descriptor: ResourceDescriptor
  readonly handlerId?: ResourceHandlerId
  readonly handlerStatus: 'choice' | 'loading' | 'ready' | 'failed' | 'source-unavailable'
  readonly failure?: string
  readonly openWith: readonly ResourceHandlerChoice[]
  readonly capabilities: ResourceCapabilities
  readonly externalOpenSupported: boolean
}

/** Frozen generic resource-opening service exposed as `ctx.resourceWorkbench`. */
export interface ResourceWorkbenchClientService {
  /** @param language Lazy syntax parser contribution. @returns Idempotent registration disposer. */
  registerEditorLanguage(language: EditorLanguage): () => void
  /** @param source Source contribution. @returns Idempotent registration disposer. */
  registerSource(source: ResourceSource): () => void
  /** @param handler Lazy handler contribution. @returns Idempotent registration disposer. */
  registerHandler(handler: ResourceHandler): () => void
  /** @param descriptor Resource identity and selection metadata. @param options Target and handler intent. @returns Opened or activated view id. */
  open(descriptor: ResourceDescriptor, options?: ResourceOpenOptions): Promise<string>
  /** @param descriptor Resource to match. @returns Deterministically ordered handler choices. */
  listOpenWith(descriptor: ResourceDescriptor): readonly ResourceHandlerChoice[]
  /** @param viewId Existing resource view. @param handlerId Selected matching handler. @returns Nothing after the switch or veto. */
  switchHandler(viewId: string, handlerId: ResourceHandlerId): Promise<void>
  /** @param descriptor Association subject. @param handlerId Preferred handler, or undefined to inherit defaults. */
  setAssociation(descriptor: ResourceDescriptor, handlerId: ResourceHandlerId | undefined): void
  /** @param viewId Resource view. @returns Stable immutable snapshot until notification. */
  snapshot(viewId: string): ResourceViewSnapshot
  /** @param viewId Resource view. @param listener Change listener. @returns Subscription disposer. */
  subscribe(viewId: string, listener: () => void): () => void
  /** @param viewId Resource view. @returns Validated selected handler module. */
  loadHandler(viewId: string): Promise<ResourceHandlerModule>
  /** @param viewId Resource view. @param signal Cancellation signal. @returns Opaque source bytes and revision. */
  readBytes(viewId: string, signal: AbortSignal): Promise<ResourceLoadedBytes>
  /** @param viewId Resource view. @param bytes Bytes to publish. @param version Caller-observed revision. @param signal Cancellation signal. @returns Published revision from a provider-declared guarded write. */
  writeBytes(viewId: string, bytes: Uint8Array, version: unknown, signal: AbortSignal): Promise<ResourceSavedBytes>
  /** @param viewId Resource view. @param listener Byte notification listener. @returns Source watch disposer. */
  watchBytes(viewId: string, listener: (event: ResourceBytesWatchEvent) => void | Promise<void>): () => void
  /** @param viewId Edited resource view. Permanently pins its preview after the first edit. */
  markEdited(viewId: string): void
  /**
   * Retain a handler-owned close/switch guard until the returned disposer or committed handler exit.
   * Register from the retained handler controller, not a renderer effect that ends on group remount.
   * @param viewId Resource view.
   * @param guard Confirmation callback that returns false to retain the handler.
   * @returns Guard disposer.
   */
  registerCloseGuard(viewId: string, guard: () => boolean | Promise<boolean>): () => void
  /** @param viewId Resource view. @returns Shared text-document id when attached. */
  textDocumentId(viewId: string): string | undefined
  /** @param viewId Resource view. @returns Shared text-document snapshot. */
  textSnapshot(viewId: string): TextDocumentSnapshot
  /** @param viewId Resource view. @param listener Document listener. @returns Subscription disposer. */
  subscribeText(viewId: string, listener: () => void): () => void
  /** @param viewId Text resource view. @param text New shared local text. Pins the view after its first edit. */
  editText(viewId: string, text: string): void
  /** @param viewId Text resource view. @param changes Ordered UTF-16 ranges in the current shared document. Pins its first edit. */
  editTextChanges(viewId: string, changes: readonly FileViewerTextChange[]): void
  /** @param viewId Text resource view. @returns Nothing after guarded saving. */
  saveText(viewId: string): Promise<void>
  /** @param viewId Text resource view. @param path Source-owned destination path. @returns Nothing after guarded publication and moving this view to the destination; errors retain its original identity and Local. */
  saveTextAs(viewId: string, path: string): Promise<void>
  /** @param viewId Text resource view. @returns Nothing after source observation. */
  refreshText(viewId: string): Promise<void>
  /** @param viewId Text view showing a large-file prompt. @returns Nothing after the explicitly approved load. */
  confirmTextLoad(viewId: string): Promise<void>
  /** @param viewId Text view whose in-progress initial load should stop. */
  cancelTextLoad(viewId: string): void
  /** @param viewId Text view. @param enabled Whether its shared document writes browser drafts; disabling retains existing records. */
  setTextDraftPersistence(viewId: string, enabled: boolean): void
  /** @param viewId Text resource view. @returns Nothing after explicit publication. */
  overwriteSourceText(viewId: string): Promise<void>
  /** @param viewId Text resource view. Replaces local text with the last observed source. */
  discardLocalText(viewId: string): void
  /** @param viewId Text resource view. @param name Shared document automation choice. @param enabled Value retained with the document until its last view closes. */
  setTextAutomation(viewId: string, name: keyof ResourceAutomationPreferences, enabled: boolean): void
  /** @returns Stable persisted global defaults used only to initialize newly opened documents, below source defaults. */
  automationDefaults(): ResourceAutomationPreferences
  /** @param listener Global-default change listener, independent of document notifications. @returns Subscription disposer. */
  subscribeAutomationDefaults(listener: () => void): () => void
  /** @param name Automation preference. @param enabled New persisted global default; existing documents retain their choices. */
  setGlobalAutomation(name: keyof ResourceAutomationPreferences, enabled: boolean): void
  /** @param viewId Resource view. @param handlerId State owner. @returns Memory-only state for that handler. */
  getViewState(viewId: string, handlerId: ResourceHandlerId): unknown
  /** @param viewId Resource view. @param handlerId State owner. @param state Memory-only state retained across renderer remounts. */
  setViewState(viewId: string, handlerId: ResourceHandlerId, state: unknown): void
  /** @param viewId Resource view. @param selection Optional source-owned hint. @returns Nothing after selector launch. */
  selectLocation(viewId: string, selection?: unknown): Promise<void>
  /** @param viewId Resource view. @returns Nothing after external opening. */
  openExternal(viewId: string): Promise<void>
  /** @param viewId Resource view. @returns Nothing after the sidebar commits, vetoes or invalidates the close request. */
  close(viewId: string): Promise<void>
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Generic resource opening, handler selection and source registry. */
    resourceWorkbench: ResourceWorkbenchClientService
  }
}

/** @param event Resource text notification. @returns Shared text-document notification. */
export function toFileViewerWatchEvent(event: ResourceTextWatchEvent): FileViewerWatchEvent {
  if (event.kind !== 'snapshot') return event
  return {
    kind: 'snapshot',
    snapshot: {
      text: event.snapshot.text,
      ...(event.snapshot.descriptor?.size === undefined ? {} : { sizeBytes: event.snapshot.descriptor.size }),
      ...(event.snapshot.version === undefined ? {} : { version: event.snapshot.version }),
      ...(event.snapshot.descriptor?.name === undefined ? {} : { title: event.snapshot.descriptor.name }),
      ...(event.snapshot.descriptor?.location === undefined ? {} : { location: event.snapshot.descriptor.location }),
    },
  }
}
