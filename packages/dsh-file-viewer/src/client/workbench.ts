import type { RightSidebarNavigation, RightSidebarNavigationOptions } from '@dsh-external/dsh-right-sidebar/client'
import { EditorLanguageRegistry } from './editor-languages.ts'
import type { TextBlockPolicy } from './text-document.ts'
import type { FileViewerTextChange } from './editor-module.ts'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import {
  FileViewerService,
  FileViewerSourceId,
  type FileViewerBrowserStorage,
  type FileViewerDocumentRef,
  type FileViewerServiceOptions,
  isFileViewerDirty,
  isMissingResourceError,
  type FileViewerSource,
} from './service.ts'
import {
  ResourceHandlerId,
  ResourceSourceId,
  type ResourceCapabilities,
  type ResourceLinkTarget,
  type ResourceTextPosition,
  type ResourceDescriptor,
  type ResourceHandler,
  type ResourceHandlerChoice,
  type ResourceHandlerModule,
  type ResourceLoadedBytes,
  type ResourceBytesWatchEvent,
  type ResourceNavigationTarget,
  type ResourceOpenOptions,
  type ResourceOpenTarget,
  type ResourceRef,
  type ResourceSource,
  type ResourceViewSnapshot,
  toFileViewerWatchEvent,
} from './resource.ts'

/** Static right-sidebar renderer shared by all resource handlers. */
export const RESOURCE_WORKBENCH_VIEW_ID = 'resource-workbench'
/** Built-in source-neutral text handler. */
export const TEXT_RESOURCE_HANDLER_ID = ResourceHandlerId('text')
/** Built-in byte-preserving image handler. */
export const IMAGE_RESOURCE_HANDLER_ID = ResourceHandlerId('image')

/** Sidebar methods needed by the resource-opening runtime. */
export interface ResourceViewHost {
  open(
    sessionId: SessionId,
    input: {
      readonly id: string
      readonly viewId: string
      readonly title: string
      readonly resourceMissing?: boolean
      readonly restoreDescriptor?: unknown
      readonly onClose?: () => boolean | Promise<boolean>
      readonly onClosed?: () => void
      readonly onNavigate?: (descriptor: unknown, navigation: RightSidebarNavigation) => boolean | Promise<boolean>
    },
    options?: {
      readonly target?: ResourceOpenTarget
      readonly preview?: boolean
      readonly navigation?: RightSidebarNavigation
    },
  ): Promise<string>
  /** Open a document link through the shared Client workspace-file dispatch. */
  openWorkspaceFile(request: {
    readonly sessionId: SessionId
    readonly path: string
    readonly viewId: string
    readonly replace: 'current'
    readonly sourceInstanceId?: string
    readonly signal?: AbortSignal
    readonly textSelection?: ResourceTextPosition
  }): Promise<void>
  beginNavigation(sessionId: SessionId, options?: RightSidebarNavigationOptions): RightSidebarNavigation
  update(
    sessionId: SessionId,
    viewId: string,
    update: {
      readonly title?: string
      /** Marks the tab whose exact resource the source reports as gone. */
      readonly resourceMissing?: boolean
      readonly restoreDescriptor?: unknown
    },
  ): void
  pin(sessionId: SessionId, viewId: string): void
  group(sessionId: SessionId, viewId: string): string
  resolveTarget(sessionId: SessionId, target: ResourceOpenTarget): string | undefined
  launch(sessionId: SessionId, selectorId: string, selection?: unknown): Promise<void>
  registerRestorer(
    viewId: string,
    restore: (context: { readonly sessionId: SessionId; readonly instanceId: string; readonly descriptor: unknown }) =>
      void | {
        readonly onClose?: () => boolean | Promise<boolean>
        readonly onClosed?: () => void
        readonly onRestored?: () => void
        readonly onNavigate?: (descriptor: unknown, navigation: RightSidebarNavigation) => boolean | Promise<boolean>
      } | Promise<void | {
        readonly onClose?: () => boolean | Promise<boolean>
        readonly onClosed?: () => void
        readonly onRestored?: () => void
        readonly onNavigate?: (descriptor: unknown, navigation: RightSidebarNavigation) => boolean | Promise<boolean>
      }>,
  ): () => void
  close(sessionId: SessionId, viewId: string): Promise<void>
}

interface ViewRecord {
  textSelection?: ResourceTextPosition & { readonly requestId: number }
  navigationController?: AbortController | undefined
  descriptor: ResourceDescriptor
  handlerId: ResourceHandlerId | undefined
  handlerStatus: ResourceViewSnapshot['handlerStatus']
  failure: string | undefined
  listeners: Set<() => void>
  documentId: string | undefined
  handlerStates: Map<ResourceHandlerId, unknown>
  handlerModule: ResourceHandlerModule | undefined
  handlerRequest: Promise<ResourceHandlerModule> | undefined
  closeGuards: Set<() => boolean | Promise<boolean>>
  edited: boolean
  byteGeneration: number
  byteControllers: Set<AbortController>
  byteWatchDisposers: Set<() => void>
  published: ResourceViewSnapshot | undefined
  textSubscription: (() => void) | undefined
  resourceMissing: boolean
  transitionGeneration: number
  textAttachRequest: Promise<void> | undefined
  checkpointSuppressed: boolean
  saveAsController?: AbortController | undefined
}

interface PersistedResourceView {
  readonly textSelection?: ResourceTextPosition
  readonly format: 1
  readonly ref: ResourceRef
  readonly name: string
  readonly mediaType?: string
  readonly kind?: string
  readonly size?: number
  readonly location?: NonNullable<ResourceDescriptor['location']>
  readonly handlerId?: ResourceHandlerId
}

/** Runtime options for persistence, confirmation and text synchronization. */
export interface ResourceWorkbenchOptions {
  readonly host: ResourceViewHost
  readonly storage?: FileViewerBrowserStorage
  readonly confirmDiscard?: FileViewerServiceOptions['confirmDiscard']
  readonly automationDebounceMs?: number
  readonly largeEditCheckDelayMs?: number
  readonly progressiveFlushIntervalMs?: number
  readonly persistenceDebounceMs?: number
  readonly hashText?: (text: string) => Promise<string>
  /** Canonical UTF-8 targets for shared document blocks. */
  readonly textBlockPolicy?: TextBlockPolicy
  /** Validated byte tiers for background defaults and explicit huge-file loading. */
  readonly largeFileBytes?: number
  readonly hugeFileBytes?: number
  /** @param path Prepared destination. @returns Explicit overwrite approval; omission rejects replacement. */
  readonly confirmSaveAsOverwrite?: (path: string) => boolean | Promise<boolean>
  readonly confirmHandlerSwitch?: (snapshot: ReturnType<FileViewerService['snapshot']>) => boolean | Promise<boolean>
}

const ASSOCIATIONS_KEY = 'dsh-resource-workbench:associations:1'

function defaultBrowserStorage(): FileViewerBrowserStorage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage
  } catch {
    return undefined
  }
}

function refKey(ref: ResourceRef): string {
  return JSON.stringify([ref.sessionId, ref.sourceId, ref.resourceId])
}

function extensionOf(name: string): string | undefined {
  const index = name.lastIndexOf('.')
  return index <= 0 || index === name.length - 1 ? undefined : name.slice(index + 1).toLowerCase()
}

function associationKey(descriptor: ResourceDescriptor): string | undefined {
  if (descriptor.mediaType !== undefined && descriptor.mediaType !== 'application/octet-stream') {
    return `media:${descriptor.mediaType.toLowerCase()}`
  }
  const extension = extensionOf(descriptor.name)
  if (extension !== undefined) return `extension:${extension}`
  return descriptor.kind === undefined ? undefined : `kind:${descriptor.kind}`
}

function failureMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function toTextRef(ref: ResourceRef): FileViewerDocumentRef {
  return {
    sessionId: ref.sessionId,
    sourceId: FileViewerSourceId(ref.sourceId),
    resourceId: ref.resourceId,
  }
}

function persistedDescriptor(descriptor: ResourceDescriptor, handlerId: ResourceHandlerId | undefined, textSelection?: ResourceTextPosition): PersistedResourceView {
  const location = jsonSafeLocation(descriptor.location)
  return {
    format: 1,
    ...(textSelection === undefined ? {} : { textSelection: { line: textSelection.line, ...(textSelection.column === undefined ? {} : { column: textSelection.column }) } }),
    ref: descriptor.ref,
    name: descriptor.name,
    ...(descriptor.mediaType === undefined ? {} : { mediaType: descriptor.mediaType }),
    ...(descriptor.kind === undefined ? {} : { kind: descriptor.kind }),
    ...(descriptor.size === undefined ? {} : { size: descriptor.size }),
    ...(location === undefined ? {} : { location }),
    ...(handlerId === undefined ? {} : { handlerId }),
  }
}

function jsonSafeLocation(location: ResourceDescriptor['location']): ResourceDescriptor['location'] | undefined {
  if (location === undefined) return undefined
  try {
    return JSON.parse(JSON.stringify(location)) as ResourceDescriptor['location']
  } catch {
    return {
      ...(location.label === undefined ? {} : { label: location.label }),
      ...(location.selectorId === undefined ? {} : { selectorId: location.selectorId }),
      ...(location.selectable === undefined ? {} : { selectable: location.selectable }),
      ...(location.segments === undefined ? {} : {
        segments: location.segments.map(segment => ({ label: segment.label })),
      }),
    }
  }
}

function parsePersisted(value: unknown): PersistedResourceView | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const row = value as Record<string, unknown>
  const ref = row.ref
  if (row.format !== 1 || typeof row.name !== 'string' || typeof ref !== 'object' || ref === null) return undefined
  const refRow = ref as Record<string, unknown>
  if (typeof refRow.sessionId !== 'string' || typeof refRow.sourceId !== 'string' || typeof refRow.resourceId !== 'string') return undefined
  if ((row.mediaType !== undefined && typeof row.mediaType !== 'string')
    || (row.kind !== undefined && typeof row.kind !== 'string')
    || (row.size !== undefined && (typeof row.size !== 'number' || !Number.isFinite(row.size) || row.size < 0))
    || (row.handlerId !== undefined && typeof row.handlerId !== 'string')) return undefined
  const selection = row.textSelection
  if (selection !== undefined && (typeof selection !== 'object' || selection === null
    || !('line' in selection) || typeof selection.line !== 'number' || !Number.isSafeInteger(selection.line) || selection.line < 1
    || ('column' in selection && (typeof selection.column !== 'number' || !Number.isSafeInteger(selection.column) || selection.column < 1)))) return undefined
  const textSelection = selection as ResourceTextPosition | undefined
  const location = parsePersistedLocation(row.location)
  if (location === false) return undefined
  try {
    const sourceId = ResourceSourceId(refRow.sourceId)
    const handlerId = row.handlerId === undefined ? undefined : ResourceHandlerId(row.handlerId)
    return {
      format: 1,
      ...(textSelection === undefined ? {} : { textSelection }),
      ref: { sessionId: SessionId(refRow.sessionId), sourceId, resourceId: refRow.resourceId },
      name: row.name,
      ...(row.mediaType === undefined ? {} : { mediaType: row.mediaType }),
      ...(row.kind === undefined ? {} : { kind: row.kind }),
      ...(row.size === undefined ? {} : { size: row.size }),
      ...(location === undefined ? {} : { location }),
      ...(handlerId === undefined ? {} : { handlerId }),
    }
  } catch {
    return undefined
  }
}

function parsePersistedLocation(value: unknown): ResourceDescriptor['location'] | false | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const row = value as Record<string, unknown>
  if ((row.label !== undefined && typeof row.label !== 'string')
    || (row.selectorId !== undefined && typeof row.selectorId !== 'string')
    || (row.selectable !== undefined && typeof row.selectable !== 'boolean')
    || (row.segments !== undefined && !Array.isArray(row.segments))) return false
  const segments: { label: string; selectionHint?: unknown }[] = []
  if (Array.isArray(row.segments)) {
    for (const value of row.segments) {
      if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
      const segment = value as Record<string, unknown>
      if (typeof segment.label !== 'string') return false
      segments.push({
        label: segment.label,
        ...(!Object.hasOwn(segment, 'selectionHint') ? {} : { selectionHint: segment.selectionHint }),
      })
    }
  }
  return {
    ...(row.label === undefined ? {} : { label: row.label }),
    ...(row.selectorId === undefined ? {} : { selectorId: row.selectorId }),
    ...(row.selectable === undefined ? {} : { selectable: row.selectable }),
    ...(row.segments === undefined ? {} : { segments }),
  }
}

/** One owner for resource sources, handler selection, views and shared text documents. */
export class ResourceWorkbenchRuntime {
  readonly documents: FileViewerService
  /** Language contributions shared by every editor view. */
  readonly editorLanguages = new EditorLanguageRegistry()
  readonly #host: ResourceViewHost
  readonly #storage: FileViewerBrowserStorage | undefined
  readonly #sources = new Map<ResourceSourceId, ResourceSource>()
  readonly #sourceDisposers = new Map<ResourceSourceId, () => void>()
  readonly #handlers = new Map<ResourceHandlerId, ResourceHandler>()
  readonly #views = new Map<string, ViewRecord>()
  readonly #associations = new Map<string, ResourceHandlerId>()
  readonly #confirmHandlerSwitch: NonNullable<ResourceWorkbenchOptions['confirmHandlerSwitch']>
  readonly #confirmSaveAsOverwrite: NonNullable<ResourceWorkbenchOptions['confirmSaveAsOverwrite']>
  #disposed = false
  #selectionRequest = 0

  /** @param options - Sidebar host, persistence and text synchronization policy. */
  constructor(options: ResourceWorkbenchOptions) {
    this.#host = options.host
    this.#confirmSaveAsOverwrite = options.confirmSaveAsOverwrite ?? (() => false)
    this.#confirmHandlerSwitch = options.confirmHandlerSwitch ?? (() => false)
    this.#storage = options.storage ?? defaultBrowserStorage()
    this.documents = new FileViewerService({
      ...(this.#storage === undefined ? {} : { storage: this.#storage }),
      ...(options.confirmDiscard === undefined ? {} : { confirmDiscard: options.confirmDiscard }),
      ...(options.automationDebounceMs === undefined ? {} : { automationDebounceMs: options.automationDebounceMs }),
      ...(options.persistenceDebounceMs === undefined ? {} : { persistenceDebounceMs: options.persistenceDebounceMs }),
      ...(options.progressiveFlushIntervalMs === undefined ? {} : { progressiveFlushIntervalMs: options.progressiveFlushIntervalMs }),
      ...(options.hashText === undefined ? {} : { hashText: options.hashText }),
      ...(options.textBlockPolicy === undefined ? {} : { textBlockPolicy: options.textBlockPolicy }),
      ...(options.largeEditCheckDelayMs === undefined ? {} : { largeEditCheckDelayMs: options.largeEditCheckDelayMs }),
      ...(options.largeFileBytes === undefined ? {} : { largeFileBytes: options.largeFileBytes }),
      ...(options.hugeFileBytes === undefined ? {} : { hugeFileBytes: options.hugeFileBytes }),
    })
    this.#readAssociations()
  }

  /** Register a source and connect its text capability to the shared document store. */
  registerSource(source: ResourceSource): () => void {
    this.#assertLive()
    if (this.#sources.has(source.id)) throw new Error(`resource-workbench: duplicate source "${source.id}"`)
    this.#sources.set(source.id, source)
    if (source.readText !== undefined) {
      const adapter: FileViewerSource = {
        id: FileViewerSourceId(source.id),
        ...(source.defaults === undefined ? {} : { defaults: source.defaults }),
        load: async (ref, signal, access) => {
          const resourceRef = ref as unknown as ResourceRef
          const loaded = await source.readText!(resourceRef, signal, access)
          signal.throwIfAborted()
          if (loaded.descriptor !== undefined) this.#applyLoadedDescriptor(resourceRef, loaded.descriptor)
          const title = loaded.descriptor?.name ?? this.#resourceName(resourceRef)
          return {
            text: loaded.text,
            ...(loaded.descriptor?.size === undefined ? {} : { sizeBytes: loaded.descriptor.size }),
            ...(loaded.version === undefined ? {} : { version: loaded.version }),
            ...(title === undefined ? {} : { title }),
            ...(loaded.descriptor?.location === undefined ? {} : { location: loaded.descriptor.location }),
          }
        },
        ...(source.readTextDelta === undefined ? {} : {
          loadDelta: (ref, baseHash, signal, access) => source.readTextDelta!(ref as unknown as ResourceRef, baseHash, signal, access),
        }),
        ...(source.createTextRead === undefined ? {} : {
          createTextRead: ref => {
            const reader = source.createTextRead!(ref as unknown as ResourceRef)
            return { dispose: () => reader.dispose(), stream: async function* (signal, access) {
              for await (const event of reader.stream(signal, access)) {
                if (event.kind !== 'start') { yield event; continue }
                const { descriptor, ...metadata } = event
                yield { ...metadata, ...(descriptor?.name === undefined ? {} : { title: descriptor.name }),
                  ...(descriptor?.location === undefined ? {} : { location: descriptor.location }) }
              }
            } }
          },
        }),
        ...(source.streamText === undefined ? {} : {
          stream: async function* (ref, signal, access) {
            for await (const event of source.streamText!(ref as unknown as ResourceRef, signal, access)) {
              signal.throwIfAborted()
              if (event.kind !== 'start') { yield event; continue }
              yield { kind: 'start' as const, sizeBytes: event.sizeBytes,
                ...(event.descriptor?.name === undefined ? {} : { title: event.descriptor.name }),
                ...(event.descriptor?.location === undefined ? {} : { location: event.descriptor.location }) }
            }
          },
        }),
        ...(source.saveTextDelta === undefined ? {} : {
          saveDelta: (ref, baseText, text, signal, access) => source.saveTextDelta!(ref as unknown as ResourceRef, baseText, text, signal, access),
        }),
        ...(source.saveText === undefined ? {} : {
          save: (ref, text, version, signal, access) => source.saveText!(ref as unknown as ResourceRef, text, version, signal, access),
        }),
        ...(source.supportsConditionalTextSave === undefined
          ? {}
          : { supportsConditionalSave: source.supportsConditionalTextSave }),
        ...(source.watchText === undefined ? {} : {
          watch: (ref, listener, access, context) => {
            const resourceRef = ref as unknown as ResourceRef
            return source.watchText!(resourceRef, event => {
              if (event.kind === 'snapshot' && event.snapshot.descriptor !== undefined) {
                this.#applyLoadedDescriptor(resourceRef, event.snapshot.descriptor)
              }
              const textEvent = toFileViewerWatchEvent(event)
              if (textEvent.kind !== 'snapshot' || textEvent.snapshot.title !== undefined) {
                return listener(textEvent)
              }
              const title = this.#resourceName(resourceRef)
              return listener(title === undefined
                ? textEvent
                : { ...textEvent, snapshot: { ...textEvent.snapshot, title } })
            }, access, context)
          },
        }),
        ...(source.openExternal === undefined ? {} : {
          openExternal: (ref, signal) => source.openExternal!(ref as unknown as ResourceRef, signal),
        }),
      }
      this.#sourceDisposers.set(source.id, this.documents.registerSource(adapter))
    }
    const recoveringDocuments = new Set<string>()
    for (const [viewId, view] of this.#views) {
      if (view.descriptor.ref.sourceId !== source.id) continue
      if (this.#usesText(view.handlerId) && view.documentId === undefined) {
        void this.#attachText(viewId, view)
      } else if (view.documentId !== undefined && !recoveringDocuments.has(view.documentId)) {
        recoveringDocuments.add(view.documentId)
        view.handlerStatus = view.handlerId === undefined ? 'choice' : 'loading'
        view.failure = undefined
        this.#notify(view)
        void this.documents.refresh(view.documentId)
      } else {
        view.handlerStatus = view.handlerId === undefined ? 'choice' : 'loading'
        this.#notify(view)
      }
    }
    let active = true
    return () => {
      if (!active) return
      active = false
      if (this.#sources.get(source.id) !== source) return
      this.#sources.delete(source.id)
      this.#sourceDisposers.get(source.id)?.()
      this.#sourceDisposers.delete(source.id)
      for (const view of this.#views.values()) {
        if (view.descriptor.ref.sourceId !== source.id) continue
        view.navigationController?.abort(new Error('resource source unloaded'))
        view.saveAsController?.abort(new Error('resource source unloaded'))
        this.#stopBytes(view, new Error('resource source unloaded'))
        if (view.documentId === undefined) view.handlerStatus = 'source-unavailable'
        this.#notify(view)
      }
    }
  }

  /** Register one handler until the returned disposer runs. */
  registerHandler(handler: ResourceHandler): () => void {
    this.#assertLive()
    if (this.#handlers.has(handler.id)) throw new Error(`resource-workbench: duplicate handler "${handler.id}"`)
    this.#handlers.set(handler.id, handler)
    for (const view of this.#views.values()) {
      if (view.handlerId === handler.id) {
        view.handlerStatus = this.#sources.has(view.descriptor.ref.sourceId) ? 'loading' : 'source-unavailable'
        view.failure = undefined
        view.handlerModule = undefined
        view.handlerRequest = undefined
      }
      this.#notify(view)
    }
    let active = true
    return () => {
      if (!active) return
      active = false
      if (this.#handlers.get(handler.id) !== handler) return
      this.#handlers.delete(handler.id)
      for (const view of this.#views.values()) {
        if (view.handlerId !== handler.id) continue
        view.handlerStatus = 'failed'
        view.failure = `Handler "${handler.id}" is unavailable.`
        view.handlerModule = undefined
        view.handlerRequest = undefined
        this.#notify(view)
      }
    }
  }

  /** Open through an explicit, associated, default or safe text handler. */
  async open(descriptor: ResourceDescriptor, options: ResourceOpenOptions = {}): Promise<string> {
    this.#assertLive()
    const navigation = options.navigation ?? this.#host.beginNavigation(descriptor.ref.sessionId, {
      ...(options.target === undefined ? {} : { target: options.target }),
    })
    if (!navigation.current()) throw new Error('resource navigation cancelled')
    const handlerId = this.#selectHandler(descriptor, options.textSelection === undefined ? options.handlerId : TEXT_RESOURCE_HANDLER_ID)
    const targetGroup = options.target === undefined
      ? undefined
      : this.#host.resolveTarget(descriptor.ref.sessionId, options.target)
    if (options.sideBySide !== true) {
      const existing = options.target !== undefined && targetGroup === undefined
        ? undefined
        : this.#findView(descriptor.ref, handlerId, targetGroup)
      if (existing !== undefined) {
        if (!navigation.claim(existing)) throw new Error('resource navigation cancelled')
        const existingView = this.#view(existing)
        const nextDescriptor = {
          ...existingView.descriptor,
          name: descriptor.name,
          ...(descriptor.mediaType === undefined ? {} : { mediaType: descriptor.mediaType }),
          ...(descriptor.kind === undefined ? {} : { kind: descriptor.kind }),
          ...(descriptor.size === undefined ? {} : { size: descriptor.size }),
          ...(descriptor.location === undefined ? {} : { location: descriptor.location }),
        }
        const accepted = navigation.commit(existing, {
          descriptor: persistedDescriptor(nextDescriptor, handlerId, options.textSelection ?? existingView.textSelection),
          title: descriptor.name,
          pin: options.preview === false,
        }, () => {
          existingView.descriptor = nextDescriptor
          if (options.textSelection !== undefined) {
            existingView.textSelection = { ...options.textSelection, requestId: ++this.#selectionRequest }
          }
        })
        if (!accepted) throw new Error('resource navigation cancelled')
        this.#notify(existingView)
        return existing
      }
    }

    const viewId = `resource-view-${crypto.randomUUID()}`
    const source = this.#sources.get(descriptor.ref.sourceId)
    const view: ViewRecord = {
      ...(options.textSelection === undefined ? {} : { textSelection: { ...options.textSelection, requestId: ++this.#selectionRequest } }),
      descriptor,
      handlerId,
      handlerStatus: source === undefined ? 'source-unavailable' : handlerId === undefined ? 'choice' : 'loading',
      failure: undefined,
      listeners: new Set(),
      documentId: undefined,
      handlerStates: new Map(),
      handlerModule: undefined,
      handlerRequest: undefined,
      closeGuards: new Set(),
      edited: false,
      byteGeneration: 0,
      byteControllers: new Set(),
      byteWatchDisposers: new Set(),
      published: undefined,
      textSubscription: undefined,
      resourceMissing: false,
      transitionGeneration: 0,
      textAttachRequest: undefined,
      checkpointSuppressed: false,
    }
    this.#views.set(viewId, view)
    try {
      await this.#host.open(descriptor.ref.sessionId, {
        id: viewId,
        viewId: RESOURCE_WORKBENCH_VIEW_ID,
        title: descriptor.name,
        restoreDescriptor: persistedDescriptor(descriptor, handlerId, options.textSelection),
        onClose: () => this.#canClose(viewId),
        onClosed: () => { this.#finalizeClose(viewId) },
        onNavigate: (descriptor, navigation) => this.#restoreNavigation(viewId, descriptor, navigation),
      }, {
        ...(options.target === undefined ? {} : { target: options.target }),
        ...(options.preview === undefined ? {} : { preview: options.preview }),
        navigation,
      })
      if (this.#usesText(handlerId) && source !== undefined) await this.#attachText(viewId, view)
      return viewId
    } catch (error: unknown) {
      this.#views.delete(viewId)
      throw error
    }
  }

  /** Open a source link through its declared routing capability. */
  async navigateLink(viewId: string, href: string): Promise<void> {
    await this.openWorkspaceLink(viewId, href)
  }

  /** Replace an owned view; refusal and cancellation never mean an unhandled request. */
  async navigateTo(viewId: string, target: ResourceNavigationTarget, navigation?: RightSidebarNavigation): Promise<'committed' | 'cancelled' | 'unhandled'> {
    if (navigation !== undefined && !navigation.current()) return 'cancelled'
    if (!this.#views.has(viewId)) return 'unhandled'
    if (navigation !== undefined && !navigation.claim(viewId)) return 'cancelled'
    return await this.#navigate(viewId, target, navigation) ? 'committed' : 'cancelled'
  }

  /** Resolve once under the same cancellation identity used by subsequent file dispatch. */
  async openWorkspaceLink(viewId: string, href: string): Promise<void> {
    const view = this.#view(viewId)
    const source = this.#sources.get(view.descriptor.ref.sourceId)
    if (source?.resolveLink === undefined) {
      this.#publishActionFailure(view, 'This source does not support file links.')
      return
    }
    const request = { sessionId: view.descriptor.ref.sessionId, path: href, viewId, sourceInstanceId: viewId, replace: 'current' as const }
    const navigation = this.#host.beginNavigation(request.sessionId, { request, sourceInstanceId: viewId })
    try {
      const target = await source.resolveLink(view.descriptor.ref, href, navigation.signal)
      if (!navigation.current() || this.#views.get(viewId) !== view || this.#sources.get(view.descriptor.ref.sourceId) !== source) return
      if (target.workspacePath === undefined) {
        await this.#navigate(viewId, target, navigation)
      } else {
        request.path = target.workspacePath
        if (target.textSelection !== undefined) Object.assign(request, { textSelection: target.textSelection })
        await this.#host.openWorkspaceFile(request)
      }
    } catch (error: unknown) {
      if (navigation.current() && this.#views.get(viewId) === view) this.#publishActionFailure(view, failureMessage(error))
    }
  }

  async #restoreNavigation(viewId: string, value: unknown, navigation: RightSidebarNavigation): Promise<boolean> {
    const persisted = parsePersisted(value)
    if (persisted === undefined) return false
    const { format: _format, handlerId, textSelection, ...descriptor } = persisted
    return this.#navigate(viewId, { descriptor, ...(textSelection === undefined ? {} : { textSelection }) }, navigation, { handlerId })
  }

  async #resolveNavigation(viewId: string, target: ResourceNavigationTarget, signal: AbortSignal): Promise<ResourceLinkTarget> {
    if ('href' in target) {
      const view = this.#view(viewId)
      const source = this.#sources.get(view.descriptor.ref.sourceId)
      if (source?.resolveLink === undefined) throw new Error('This source does not support file links.')
      return source.resolveLink(view.descriptor.ref, target.href, signal)
    }
    return { descriptor: target.descriptor, ...(target.textSelection === undefined ? {} : { textSelection: target.textSelection }) }
  }

  async #navigate(
    viewId: string,
    targetRequest: ResourceNavigationTarget,
    navigation?: RightSidebarNavigation,
    restoration?: { handlerId: ResourceHandlerId | undefined },
  ): Promise<boolean> {
    const view = this.#view(viewId)
    if (view.saveAsController !== undefined) return false
    const transition = navigation ?? this.#host.beginNavigation(view.descriptor.ref.sessionId, { sourceInstanceId: viewId })
    view.navigationController?.abort(new Error('resource navigation superseded'))
    const controller = new AbortController()
    view.navigationController = controller
    const generation = ++view.transitionGeneration
    const originalDocumentId = view.documentId
    let destinationId: string | undefined
    let committed = false
    const current = () => transition.current() && !controller.signal.aborted && this.#transitionCurrent(viewId, view, generation)
    try {
      const target = await this.#resolveNavigation(viewId, targetRequest, AbortSignal.any([controller.signal, transition.signal]))
      if (!current()) return false
      if (target.descriptor.ref.sessionId !== view.descriptor.ref.sessionId) throw new Error('resource-workbench: cross-Session navigation is unavailable')
      const matching = this.#matching(target.descriptor)
      const preferred = restoration === undefined ? view.handlerId : restoration.handlerId
      const handlerId = this.#selectHandler(target.descriptor, target.textSelection !== undefined
        ? TEXT_RESOURCE_HANDLER_ID : matching.some(row => row.handler.id === preferred) ? preferred : undefined)
      if (refKey(view.descriptor.ref) === refKey(target.descriptor.ref) && view.handlerId === handlerId) {
        const descriptor = persistedDescriptor(view.descriptor, handlerId, target.textSelection ?? view.textSelection)
        const accepted = transition.commit(viewId, { descriptor, title: view.descriptor.name }, () => {
          if (target.textSelection !== undefined) view.textSelection = { ...target.textSelection, requestId: ++this.#selectionRequest }
        })
        if (accepted) this.#notify(view)
        return accepted
      }
      if (!await this.#acceptGuards(view) || !current()) return false
      if (this.#usesText(handlerId)) {
        destinationId = await this.documents.open(toTextRef(target.descriptor.ref), target.descriptor.size)
        if (!current()) return false
      }
      if (originalDocumentId !== undefined && destinationId !== originalDocumentId
        && ![...this.#views.entries()].some(([id, other]) => id !== viewId && other.documentId === originalDocumentId)
        && !await this.documents.canClose(originalDocumentId)) return false
      if (!current()) return false
      committed = transition.commit(viewId, {
        descriptor: persistedDescriptor(target.descriptor, handlerId, target.textSelection),
        title: target.descriptor.name, resourceMissing: false,
      }, () => {
        this.#stopBytes(view, new Error('resource navigation'))
        view.textSubscription?.()
        view.textSubscription = undefined
        view.closeGuards.clear()
        view.descriptor = target.descriptor
        view.documentId = destinationId
        view.handlerId = handlerId
        view.handlerStates = new Map()
        view.handlerModule = undefined
        view.handlerRequest = undefined
        view.handlerStatus = handlerId === undefined ? 'choice' : 'loading'
        view.failure = undefined
        view.resourceMissing = false
        view.edited = false
        if (target.textSelection === undefined) delete view.textSelection
        else view.textSelection = { ...target.textSelection, requestId: ++this.#selectionRequest }
      })
      if (!committed) return false
      if (destinationId !== undefined) {
        this.documents.setPresented(destinationId, true)
        view.textSubscription = this.documents.subscribe(destinationId, () => { this.#syncTextDescriptor(viewId, view) })
        this.#syncTextDescriptor(viewId, view)
      }
      this.#notify(view)
      if (originalDocumentId !== undefined && originalDocumentId !== destinationId
        && ![...this.#views.values()].some(other => other.documentId === originalDocumentId)) this.documents.discard(originalDocumentId)
      return true
    } catch (error: unknown) {
      if (current()) this.#publishActionFailure(view, failureMessage(error))
      return false
    } finally {
      if (!committed && !this.#disposed && destinationId !== undefined && destinationId !== originalDocumentId
        && ![...this.#views.values()].some(other => other.documentId === destinationId)) this.documents.discard(destinationId)
      if (view.navigationController === controller) view.navigationController = undefined
    }
  }

  /** List matching handlers in deterministic id order. */
  listOpenWith(descriptor: ResourceDescriptor): readonly ResourceHandlerChoice[] {
    const associated = this.#associatedHandler(descriptor)
    return this.#matching(descriptor).map(({ handler, match }) => ({
      id: handler.id,
      label: typeof handler.label === 'function' ? handler.label() : handler.label,
      role: match.role,
      selected: false,
      associated: handler.id === associated,
    }))
  }

  /** Switch one view in place while retaining any shared text draft and editor state. */
  async switchHandler(viewId: string, handlerId: ResourceHandlerId): Promise<void> {
    const view = this.#view(viewId)
    if (view.saveAsController !== undefined || view.navigationController !== undefined) return
    const generation = ++view.transitionGeneration
    if (!this.#matching(view.descriptor).some(row => row.handler.id === handlerId)) {
      this.#publishActionFailure(view, `Handler "${handlerId}" does not support this resource.`)
      return
    }
    if (view.handlerId === handlerId) return
    try {
      if (!await this.#acceptGuards(view)) return
    } catch (error: unknown) {
      if (this.#transitionCurrent(viewId, view, generation)) this.#publishActionFailure(view, failureMessage(error))
      return
    }
    if (!this.#transitionCurrent(viewId, view, generation)) return
    if (this.#usesText(view.handlerId) && !this.#usesText(handlerId) && view.documentId !== undefined
      && !this.#hasOtherTextView(viewId, view.documentId)) {
      const snapshot = this.documents.snapshot(view.documentId)
      if (isFileViewerDirty(snapshot)) {
        let accepted: boolean
        try {
          accepted = await this.#confirmHandlerSwitch(snapshot)
        } catch (error: unknown) {
          if (this.#transitionCurrent(viewId, view, generation)) this.#publishActionFailure(view, failureMessage(error))
          return
        }
        if (!this.#transitionCurrent(viewId, view, generation) || !accepted) return
      }
    }
    if (!this.#matching(view.descriptor).some(row => row.handler.id === handlerId)) {
      this.#publishActionFailure(view, `Handler "${handlerId}" is no longer available for this resource.`)
      return
    }
    try {
      this.#host.update(view.descriptor.ref.sessionId, viewId, {
        title: view.descriptor.name,
        restoreDescriptor: persistedDescriptor(view.descriptor, handlerId, view.textSelection),
      })
    } catch (error: unknown) {
      if (this.#transitionCurrent(viewId, view, generation)) this.#publishActionFailure(view, failureMessage(error))
      return
    }
    if (!this.#transitionCurrent(viewId, view, generation)) return
    if (this.#usesText(view.handlerId) && !this.#usesText(handlerId) && view.documentId !== undefined
      && !this.#hasOtherTextView(viewId, view.documentId)) this.documents.setPresented(view.documentId, false)
    this.#stopBytes(view, new Error('resource handler switched'))
    view.closeGuards.clear()
    view.handlerId = handlerId
    view.handlerModule = undefined
    view.handlerRequest = undefined
    view.failure = undefined
    view.handlerStatus = this.#sources.has(view.descriptor.ref.sourceId) ? 'loading' : 'source-unavailable'
    this.#notify(view)
    if (this.#usesText(handlerId) && view.handlerStatus !== 'source-unavailable') {
      await this.#attachText(viewId, view)
    }
  }

  /** Persist or clear the preferred handler for the descriptor's MIME/extension key. */
  setAssociation(descriptor: ResourceDescriptor, handlerId: ResourceHandlerId | undefined): void {
    const key = associationKey(descriptor)
    if (key === undefined) return
    if (handlerId === undefined) this.#associations.delete(key)
    else {
      if (!this.#matching(descriptor).some(row => row.handler.id === handlerId)) {
        throw new Error(`resource-workbench: handler "${handlerId}" does not support this association`)
      }
      this.#associations.set(key, handlerId)
    }
    this.#persistAssociations()
    for (const view of this.#views.values()) this.#notify(view)
  }

  /** Read an immutable resource-view snapshot. */
  snapshot(viewId: string): ResourceViewSnapshot {
    const view = this.#view(viewId)
    if (view.published !== undefined) return view.published
    const source = this.#sources.get(view.descriptor.ref.sourceId)
    const capabilities = this.#capabilities(source)
    const snapshot: ResourceViewSnapshot = {
      viewId,
      ...(view.textSelection === undefined ? {} : { textSelection: view.textSelection }),
      descriptor: view.descriptor,
      ...(view.handlerId === undefined ? {} : { handlerId: view.handlerId }),
      handlerStatus: view.handlerStatus,
      ...(view.failure === undefined ? {} : { failure: view.failure }),
      openWith: this.#matching(view.descriptor).map(({ handler, match }) => ({
        id: handler.id,
        label: typeof handler.label === 'function' ? handler.label() : handler.label,
        role: match.role,
        selected: handler.id === view.handlerId,
        associated: handler.id === this.#associatedHandler(view.descriptor),
      })),
      capabilities,
      externalOpenSupported: source?.openExternal !== undefined,
    }
    view.published = snapshot
    return snapshot
  }

  /** Subscribe to one resource view. */
  subscribe(viewId: string, listener: () => void): () => void {
    const listeners = this.#view(viewId).listeners
    listeners.add(listener)
    return () => { listeners.delete(listener) }
  }

  /** Load and validate only the selected handler module. */
  async loadHandler(viewId: string): Promise<ResourceHandlerModule> {
    const view = this.#view(viewId)
    if (view.handlerId === undefined) throw new Error('resource-workbench: choose a handler first')
    const handlerId = view.handlerId
    if (this.#usesText(handlerId) && view.documentId === undefined) {
      await this.#attachText(viewId, view)
      if (this.#views.get(viewId) !== view || view.handlerId !== handlerId) {
        throw new Error('resource-workbench: stale text handler load')
      }
      if (view.documentId === undefined) {
        throw new Error(view.failure ?? 'resource-workbench: text document is unavailable')
      }
    }
    if (view.handlerModule !== undefined) return view.handlerModule
    const handler = this.#handlers.get(handlerId)
    if (handler === undefined) throw new Error(`resource-workbench: handler "${handlerId}" is unavailable`)
    const request = view.handlerRequest ?? handler.load()
    view.handlerRequest = request
    try {
      const module = await request
      if (typeof module !== 'object' || module === null || typeof module.View !== 'function') {
        throw new Error(`resource-workbench: handler "${handler.id}" module has no View`)
      }
      if (this.#views.get(viewId) !== view || view.handlerRequest !== request) return module
      view.handlerModule = module
      view.handlerStatus = 'ready'
      view.failure = undefined
      this.#notify(view)
      return module
    } catch (error: unknown) {
      if (this.#views.get(viewId) === view && view.handlerRequest === request) {
        view.handlerRequest = undefined
        view.handlerStatus = 'failed'
        view.failure = failureMessage(error)
        this.#notify(view)
      }
      throw error
    }
  }

  /** Read bytes only from a source that explicitly supplies them. */
  async readBytes(viewId: string, signal: AbortSignal): Promise<ResourceLoadedBytes> {
    const view = this.#view(viewId)
    const source = this.#sources.get(view.descriptor.ref.sourceId)
    if (source?.readBytes === undefined) throw new Error('resource-workbench: byte reading is unavailable')
    const loaded = await this.#runBytes(
      viewId,
      view,
      source,
      signal,
      async combined => {
        try {
          const loaded = await source.readBytes!(view.descriptor.ref, combined)
          if (!combined.aborted && this.#views.get(viewId) === view && this.#sources.get(source.id) === source) {
            this.#syncResourceMissing(viewId, view, false)
          }
          return loaded
        } catch (error: unknown) {
          if (!combined.aborted && this.#views.get(viewId) === view && this.#sources.get(source.id) === source
            && isMissingResourceError(error)) this.#syncResourceMissing(viewId, view, true)
          throw error
        }
      },
    )
    if (loaded.descriptor !== undefined) this.#applyDescriptor(viewId, view, loaded.descriptor)
    return loaded
  }

  /** Publish bytes without decoding or applying text synchronization semantics. */
  async writeBytes(viewId: string, bytes: Uint8Array, version: unknown, signal: AbortSignal) {
    const view = this.#view(viewId)
    const source = this.#sources.get(view.descriptor.ref.sourceId)
    if (source?.saveBytes === undefined) throw new Error('resource-workbench: byte writing is unavailable')
    if (source.supportsConditionalByteSave !== true) {
      throw new Error('resource-workbench: guarded byte writing is unavailable')
    }
    return this.#runBytes(viewId, view, source, signal, combined =>
      source.saveBytes!(view.descriptor.ref, bytes, version, combined))
  }

  /** Subscribe through a source's byte notification capability. */
  watchBytes(viewId: string, listener: (event: ResourceBytesWatchEvent) => void | Promise<void>): () => void {
    const view = this.#view(viewId)
    const source = this.#sources.get(view.descriptor.ref.sourceId)
    if (source?.watchBytes === undefined) throw new Error('resource-workbench: byte watching is unavailable')
    let active = true
    const generation = view.byteGeneration
    const disposeSource = source.watchBytes(view.descriptor.ref, event => {
      if (!active || view.byteGeneration !== generation || this.#views.get(viewId) !== view
        || this.#sources.get(source.id) !== source) return
      if (event.kind === 'snapshot' || event.kind === 'missing') this.#syncResourceMissing(viewId, view, event.kind === 'missing')
      return listener(event)
    })
    const dispose = () => {
      if (!active) return
      active = false
      view.byteWatchDisposers.delete(dispose)
      disposeSource()
    }
    view.byteWatchDisposers.add(dispose)
    return dispose
  }

  /** Pin a preview after the first handler edit, including edit-back. */
  markEdited(viewId: string): void {
    const view = this.#view(viewId)
    if (view.edited) return
    view.edited = true
    this.#host.pin(view.descriptor.ref.sessionId, viewId)
  }

  /** Register one handler-owned close and switch veto. */
  registerCloseGuard(viewId: string, guard: () => boolean | Promise<boolean>): () => void {
    const guards = this.#view(viewId).closeGuards
    guards.add(guard)
    return () => { guards.delete(guard) }
  }

  /** Resolve the shared document attached to one text-capable view. */
  textDocumentId(viewId: string): string | undefined {
    return this.#view(viewId).documentId
  }

  /** Read the shared text-document snapshot for one view. */
  textSnapshot(viewId: string) {
    return this.documents.snapshot(this.#documentId(viewId))
  }

  /** Subscribe to the shared text document attached to one view. */
  subscribeText(viewId: string, listener: () => void): () => void {
    let documentId = this.#documentId(viewId)
    let unsubscribeDocument = this.documents.subscribe(documentId, listener)
    const unsubscribeView = this.subscribe(viewId, () => {
      const next = this.#view(viewId).documentId
      if (next === undefined || next === documentId) return
      unsubscribeDocument()
      documentId = next
      unsubscribeDocument = this.documents.subscribe(documentId, listener)
      listener()
    })
    return () => { unsubscribeView(); unsubscribeDocument() }
  }

  /** Edit shared text and pin the first edited preview. */
  editText(viewId: string, text: string): void {
    this.documents.edit(this.#documentId(viewId), text)
    this.markEdited(viewId)
  }

  /** @param viewId Text view. @param changes Ordered UTF-16 replacements in its current shared document. */
  editTextChanges(viewId: string, changes: readonly FileViewerTextChange[]): void {
    this.documents.editChanges(this.#documentId(viewId), changes)
    this.markEdited(viewId)
  }

  /** Save shared text. */
  saveText(viewId: string): Promise<void> {
    return this.documents.save(this.#documentId(viewId))
  }

  /** Publish Local under a prepared identity, then move only this view in its existing sidebar instance. */
  async saveTextAs(viewId: string, path: string): Promise<void> {
    const view = this.#view(viewId)
    if (view.saveAsController !== undefined || view.navigationController !== undefined) return
    const source = this.#sources.get(view.descriptor.ref.sourceId)
    if (source?.prepareTextSaveAs === undefined || source.saveTextAs === undefined) {
      this.#publishActionFailure(view, 'Save As is unavailable for this source.')
      return
    }
    const originalId = this.#documentId(viewId)
    const controller = new AbortController()
    view.saveAsController = controller
    view.transitionGeneration++
    let destinationId: string | undefined
    view.failure = undefined
    this.#notify(view)
    try {
      const target = await source.prepareTextSaveAs(view.descriptor.ref, path, controller.signal)
      controller.signal.throwIfAborted()
      if (target.descriptor.ref.sessionId !== view.descriptor.ref.sessionId || target.descriptor.ref.sourceId !== source.id) {
        throw new Error('resource-workbench: Save As destination must belong to the same Session and source')
      }
      if (target.exists && !await this.#confirmSaveAsOverwrite(target.descriptor.ref.resourceId)) return
      controller.signal.throwIfAborted()
      const documentId = await this.documents.saveAs(originalId, toTextRef(target.descriptor.ref), async (text, signal) => {
        const saved = await source.saveTextAs!(view.descriptor.ref, target, text, signal)
        return { ...saved, title: target.descriptor.name,
          ...(target.descriptor.location === undefined ? {} : { location: target.descriptor.location }) }
      }, controller.signal)
      destinationId = documentId
      controller.signal.throwIfAborted()
      const saved = this.documents.snapshot(documentId)
      const descriptor = { ...target.descriptor, ...(saved.sizeBytes === undefined ? {} : { size: saved.sizeBytes }) }
      this.#host.update(descriptor.ref.sessionId, viewId, {
        title: descriptor.name, resourceMissing: false, restoreDescriptor: persistedDescriptor(descriptor, view.handlerId, view.textSelection),
      })
      view.textSubscription?.()
      view.descriptor = descriptor
      view.documentId = documentId
      view.resourceMissing = false
      view.textSubscription = this.documents.subscribe(documentId, () => { this.#syncTextDescriptor(viewId, view) })
      this.markEdited(viewId)
      this.#notify(view)
      if (originalId !== documentId && ![...this.#views.values()].some(other => other.documentId === originalId)) {
        this.documents.discard(originalId)
      }
    } catch (error: unknown) {
      if (!this.#disposed && destinationId !== undefined && destinationId !== originalId
        && ![...this.#views.values()].some(other => other.documentId === destinationId)) this.documents.discard(destinationId)
      if (this.#views.get(viewId) === view && !controller.signal.aborted) this.#publishActionFailure(view, failureMessage(error))
    } finally {
      if (view.saveAsController === controller) view.saveAsController = undefined
    }
  }

  /** Observe shared text source state. */
  refreshText(viewId: string): Promise<void> {
    return this.documents.refresh(this.#documentId(viewId))
  }

  /** @param viewId Text view accepting its shared document's pending large-file load. @returns Nothing after loading. */
  confirmTextLoad(viewId: string): Promise<void> {
    return this.documents.confirmLoad(this.#documentId(viewId))
  }

  /** @param viewId Text view whose initial load should stop. */
  cancelTextLoad(viewId: string): void { this.documents.cancelLoad(this.#documentId(viewId)) }

  /** @param viewId Text view. @param enabled Shared document browser draft writing choice. */
  setTextDraftPersistence(viewId: string, enabled: boolean): void {
    this.documents.setDraftPersistence(this.#documentId(viewId), enabled)
  }

  /** Explicitly publish shared local text over the source. */
  overwriteSourceText(viewId: string): Promise<void> {
    return this.documents.overwriteSource(this.#documentId(viewId))
  }

  /** Replace shared local text with the last observed source. */
  discardLocalText(viewId: string): void {
    this.documents.discardLocal(this.#documentId(viewId))
  }

  /** Change one shared document's text automation choice. */
  setTextAutomation(viewId: string, name: 'autoUpdate' | 'autoSave', enabled: boolean): void {
    this.documents.setAutomation(this.#documentId(viewId), name, enabled)
  }

  /** Read persisted global automation defaults. */
  automationDefaults() {
    return this.documents.automationDefaults()
  }

  /** @param listener Global-default change listener. @returns Subscription disposer. */
  subscribeAutomationDefaults(listener: () => void): () => void {
    return this.documents.subscribeAutomationDefaults(listener)
  }

  /** Change one global automation default. */
  setGlobalAutomation(name: 'autoUpdate' | 'autoSave', enabled: boolean): void {
    this.documents.setGlobalAutomation(name, enabled)
  }

  /** Read one view's opaque editor state. */
  getViewState(viewId: string, handlerId: ResourceHandlerId): unknown {
    return this.#view(viewId).handlerStates.get(handlerId)
  }

  /** Retain a handler checkpoint, ignoring cleanup that arrives after the view lifetime. */
  setViewState(viewId: string, handlerId: ResourceHandlerId, state: unknown): void {
    if (this.#disposed) return
    this.#views.get(viewId)?.handlerStates.set(handlerId, state)
  }

  /** Delegate source-owned selection or launch its registered sidebar selector. */
  async selectLocation(viewId: string, selection?: unknown): Promise<void> {
    const view = this.#view(viewId)
    view.failure = undefined
    this.#notify(view)
    try {
      const source = this.#sources.get(view.descriptor.ref.sourceId)
      if (source?.selectLocation !== undefined) {
        await source.selectLocation(view.descriptor.ref, selection, viewId)
        return
      }
      const location = view.descriptor.location
      if (location?.selectorId !== undefined) {
        await this.#host.launch(view.descriptor.ref.sessionId, location.selectorId, selection)
        return
      }
      if (view.documentId !== undefined) {
        const snapshot = this.documents.snapshot(view.documentId)
        if (snapshot.status === 'ready' && snapshot.location?.selectorId !== undefined) {
          await this.#host.launch(snapshot.ref.sessionId, snapshot.location.selectorId, selection)
        }
      }
    } catch (error: unknown) {
      if (this.#views.get(viewId) === view) this.#publishActionFailure(view, failureMessage(error))
    }
  }

  /** Run the source's explicit external-open action. */
  async openExternal(viewId: string): Promise<void> {
    const view = this.#view(viewId)
    const source = this.#sources.get(view.descriptor.ref.sourceId)
    if (source?.openExternal === undefined) {
      this.#publishActionFailure(view, 'External opening is unavailable.')
      return
    }
    view.failure = undefined
    this.#notify(view)
    try {
      await this.#runBytes(
        viewId,
        view,
        source,
        new AbortController().signal,
        signal => source.openExternal!(view.descriptor.ref, signal),
      )
    } catch (error: unknown) {
      if (this.#views.get(viewId) !== view) return
      view.failure = failureMessage(error)
      this.#notify(view)
    }
  }

  /** @param viewId Resource view. @returns Nothing after the sidebar resolves the close request. */
  async close(viewId: string): Promise<void> {
    const view = this.#view(viewId)
    await this.#host.close(view.descriptor.ref.sessionId, viewId)
  }

  async #canClose(viewId: string): Promise<boolean> {
    const view = this.#views.get(viewId)
    if (view === undefined) return true
    if (view.saveAsController !== undefined) return false
    const generation = ++view.transitionGeneration
    try {
      if (!await this.#acceptGuards(view)) return false
    } catch (error: unknown) {
      if (this.#transitionCurrent(viewId, view, generation)) this.#publishActionFailure(view, failureMessage(error))
      return false
    }
    if (!this.#transitionCurrent(viewId, view, generation)) return false
    if (view.documentId !== undefined) {
      const sharedElsewhere = [...this.#views.entries()].some(([id, other]) =>
        id !== viewId && other.documentId === view.documentId)
      if (!sharedElsewhere && !await this.documents.canClose(view.documentId)) return false
    }
    return this.#transitionCurrent(viewId, view, generation)
  }

  #finalizeClose(viewId: string): void {
    const view = this.#views.get(viewId)
    if (view === undefined) return
    this.#views.delete(viewId)
    view.navigationController?.abort(new Error('resource view closed'))
    view.saveAsController?.abort(new Error('resource view closed'))
    this.#stopBytes(view, new Error('resource view closed'))
    view.closeGuards.clear()
    view.textSubscription?.()
    view.textSubscription = undefined
    view.listeners.clear()
    if (view.documentId !== undefined) {
      const shared = [...this.#views.values()].filter(other => other.documentId === view.documentId)
      if (shared.length === 0) {
        this.documents.discard(view.documentId)
      } else if (!shared.some(other => this.#usesText(other.handlerId))) {
        this.documents.setPresented(view.documentId, false)
      }
    }
  }

  /** Register restoration and flush retained text before page suspension. */
  registerRestorer(): () => void {
    return this.#host.registerRestorer(RESOURCE_WORKBENCH_VIEW_ID, async context => {
      const persisted = parsePersisted(context.descriptor)
      if (persisted === undefined || persisted.ref.sessionId !== context.sessionId) {
        throw new Error('resource-workbench: invalid persisted resource descriptor')
      }
      if (this.#views.has(context.instanceId)) {
        throw new Error(`resource-workbench: duplicate restored view "${context.instanceId}"`)
      }
      const descriptor: ResourceDescriptor = {
        ref: persisted.ref,
        name: persisted.name,
        ...(persisted.mediaType === undefined ? {} : { mediaType: persisted.mediaType }),
        ...(persisted.kind === undefined ? {} : { kind: persisted.kind }),
        ...(persisted.size === undefined ? {} : { size: persisted.size }),
        ...(persisted.location === undefined ? {} : { location: persisted.location }),
      }
      const view: ViewRecord = {
        descriptor,
        ...(persisted.textSelection === undefined ? {} : { textSelection: { ...persisted.textSelection, requestId: ++this.#selectionRequest } }),
        handlerId: persisted.handlerId,
        handlerStatus: this.#sources.has(descriptor.ref.sourceId) ? 'loading' : 'source-unavailable',
        failure: undefined,
        listeners: new Set(),
        documentId: undefined,
        handlerStates: new Map(),
        handlerModule: undefined,
        handlerRequest: undefined,
        closeGuards: new Set(),
        edited: false,
        byteGeneration: 0,
        byteControllers: new Set(),
        byteWatchDisposers: new Set(),
        published: undefined,
        textSubscription: undefined,
        resourceMissing: false,
        transitionGeneration: 0,
        textAttachRequest: undefined,
        checkpointSuppressed: true,
      }
      this.#views.set(context.instanceId, view)
      if (this.#usesText(persisted.handlerId) && this.#sources.has(descriptor.ref.sourceId)) {
        await this.#attachText(context.instanceId, view)
      }
      return {
        onClose: () => this.#canClose(context.instanceId),
        onClosed: () => { this.#finalizeClose(context.instanceId) },
        onRestored: () => { this.#checkpointRestoredView(context.instanceId, view) },
        onNavigate: (descriptor, navigation) => this.#restoreNavigation(context.instanceId, descriptor, navigation),
      }
    })
  }

  /** Flush exact text drafts without destroying reusable views. */
  flushDrafts(): void {
    this.documents.flushDrafts()
  }

  /** Abort reads and release every registration owned by the runtime. */
  dispose(): void {
    if (this.#disposed) return
    this.#disposed = true
    for (const dispose of this.#sourceDisposers.values()) dispose()
    this.#sourceDisposers.clear()
    this.#sources.clear()
    this.#handlers.clear()
    for (const view of this.#views.values()) {
      view.navigationController?.abort(new Error('resource workbench disposed'))
      view.saveAsController?.abort(new Error('resource workbench disposed'))
      this.#stopBytes(view, new Error('resource workbench disposed'))
      view.closeGuards.clear()
      view.textSubscription?.()
      view.listeners.clear()
    }
    this.#views.clear()
    this.documents.dispose()
    this.editorLanguages.dispose()
  }

  async #attachText(viewId: string, view: ViewRecord): Promise<void> {
    if (view.textAttachRequest !== undefined) return view.textAttachRequest
    const request = this.#performAttachText(viewId, view)
    view.textAttachRequest = request
    try {
      await request
    } finally {
      if (view.textAttachRequest === request) view.textAttachRequest = undefined
    }
  }

  async #performAttachText(viewId: string, view: ViewRecord): Promise<void> {
    if (view.documentId !== undefined) {
      this.documents.setPresented(view.documentId, true)
      view.handlerStatus = 'loading'
      this.#notify(view)
      return
    }
    try {
      const documentId = await this.documents.open(toTextRef(view.descriptor.ref), view.descriptor.size)
      if (this.#views.get(viewId) !== view) {
        const shared = [...this.#views.values()].some(other => other.documentId === documentId)
        if (!shared) this.documents.discard(documentId)
        return
      }
      view.documentId = documentId
      view.textSubscription ??= this.documents.subscribe(documentId, () => {
        this.#syncTextDescriptor(viewId, view)
      })
      this.#syncTextDescriptor(viewId, view)
      if (!this.#usesText(view.handlerId)) {
        if (!this.#hasOtherTextView(viewId, documentId)) this.documents.setPresented(documentId, false)
        return
      }
      this.documents.setPresented(documentId, true)
      view.handlerStatus = 'loading'
      this.#notify(view)
    } catch (error: unknown) {
      if (this.#views.get(viewId) !== view) return
      const documentId = this.documents.find(toTextRef(view.descriptor.ref))
      if (documentId !== undefined && view.documentId === undefined) {
        view.documentId = documentId
        view.textSubscription ??= this.documents.subscribe(documentId, () => {
          this.#syncTextDescriptor(viewId, view)
        })
      }
      this.#syncTextDescriptor(viewId, view)
      if (this.#usesText(view.handlerId)) {
        view.handlerStatus = 'failed'
        view.failure = failureMessage(error)
      } else if (documentId !== undefined) {
        if (!this.#hasOtherTextView(viewId, documentId)) this.documents.setPresented(documentId, false)
      }
      this.#notify(view)
    }
  }

  #selectHandler(descriptor: ResourceDescriptor, explicit: ResourceHandlerId | undefined): ResourceHandlerId | undefined {
    const matches = this.#matching(descriptor)
    if (explicit !== undefined) {
      if (!matches.some(row => row.handler.id === explicit)) {
        throw new Error(`resource-workbench: handler "${explicit}" does not support this resource`)
      }
      return explicit
    }
    const associated = this.#associatedHandler(descriptor)
    if (associated !== undefined && matches.some(row => row.handler.id === associated)) return associated
    const defaults = matches.filter(row => row.match.role === 'default')
    if (defaults.length > 0) {
      const priority = Math.max(...defaults.map(row => row.match.priority ?? 0))
      const winners = defaults.filter(row => (row.match.priority ?? 0) === priority)
      return winners.length === 1 ? winners[0]!.handler.id : undefined
    }
    const source = this.#sources.get(descriptor.ref.sourceId)
    const text = matches.find(row => row.handler.id === TEXT_RESOURCE_HANDLER_ID)
    return source?.readText !== undefined && text !== undefined ? text.handler.id : undefined
  }

  #matching(descriptor: ResourceDescriptor): readonly { handler: ResourceHandler; match: Exclude<ReturnType<ResourceHandler['match']>, false> }[] {
    const source = this.#sources.get(descriptor.ref.sourceId)
    const capabilities = this.#capabilities(source)
    return [...this.#handlers.values()]
      .map(handler => ({ handler, match: handler.match(descriptor, capabilities) }))
      .filter((row): row is { handler: ResourceHandler; match: Exclude<typeof row.match, false> } => row.match !== false)
      .sort((left, right) => left.handler.id.localeCompare(right.handler.id))
  }

  #associatedHandler(descriptor: ResourceDescriptor): ResourceHandlerId | undefined {
    const key = associationKey(descriptor)
    return key === undefined ? undefined : this.#associations.get(key)
  }

  #capabilities(source: ResourceSource | undefined): ResourceCapabilities {
    return {
      text: source?.readText !== undefined,
      textSaveAs: source?.prepareTextSaveAs !== undefined && source.saveTextAs !== undefined,
      bytes: source?.readBytes !== undefined,
      byteWrite: source?.saveBytes !== undefined,
      conditionalByteWrite: source?.saveBytes !== undefined && source.supportsConditionalByteSave === true,
      byteWatch: source?.watchBytes !== undefined,
      externalOpen: source?.openExternal !== undefined,
    }
  }

  #applyDescriptor(
    viewId: string,
    view: ViewRecord,
    update: Partial<Omit<ResourceDescriptor, 'ref'>>,
  ): void {
    if (this.#views.get(viewId) !== view) return
    const descriptor = { ...view.descriptor, ...update, ref: view.descriptor.ref }
    if (view.checkpointSuppressed) {
      view.descriptor = descriptor
      this.#notify(view)
      return
    }
    this.#host.update(descriptor.ref.sessionId, viewId, {
      title: descriptor.name,
      restoreDescriptor: persistedDescriptor(descriptor, view.handlerId, view.textSelection),
    })
    view.descriptor = descriptor
    this.#notify(view)
  }

  #checkpointRestoredView(viewId: string, view: ViewRecord): void {
    if (this.#views.get(viewId) !== view) return
    view.checkpointSuppressed = false
    try {
      this.#host.update(view.descriptor.ref.sessionId, viewId, {
        title: view.descriptor.name,
        resourceMissing: view.resourceMissing,
        restoreDescriptor: persistedDescriptor(view.descriptor, view.handlerId, view.textSelection),
      })
    } catch (error: unknown) {
      this.#publishActionFailure(view, failureMessage(error))
    }
  }

  #syncTextDescriptor(viewId: string, view: ViewRecord): void {
    if (view.documentId === undefined) return
    const snapshot = this.documents.snapshot(view.documentId)
    this.#syncResourceMissing(viewId, view, snapshot.resourceMissing)
    if (snapshot.sizeBytes !== undefined && snapshot.sizeBytes !== view.descriptor.size) {
      this.#applyDescriptor(viewId, view, { size: snapshot.sizeBytes })
    }
    if (snapshot.status !== 'ready' || snapshot.resourceMissing) return
    if (snapshot.title === view.descriptor.name && snapshot.location === view.descriptor.location && snapshot.sizeBytes === view.descriptor.size) return
    this.#applyDescriptor(viewId, view, {
      name: snapshot.title,
      ...(snapshot.sizeBytes === undefined ? {} : { size: snapshot.sizeBytes }),
      ...(snapshot.location === undefined ? {} : { location: snapshot.location }),
    })
  }

  /** Publish only actual changes, so an unrelated document notification never rewrites the tab. */
  #syncResourceMissing(viewId: string, view: ViewRecord, missing: boolean): void {
    if (view.resourceMissing === missing) return
    if (view.checkpointSuppressed) {
      view.resourceMissing = missing
      return
    }
    try {
      this.#host.update(view.descriptor.ref.sessionId, viewId, { resourceMissing: missing })
      view.resourceMissing = missing
    } catch (error: unknown) {
      this.#publishActionFailure(view, failureMessage(error))
    }
  }

  #applyLoadedDescriptor(ref: ResourceRef, update: Partial<Omit<ResourceDescriptor, 'ref'>>): void {
    for (const [viewId, view] of this.#views) {
      if (refKey(view.descriptor.ref) === refKey(ref)) this.#applyDescriptor(viewId, view, update)
    }
  }

  #resourceName(ref: ResourceRef): string | undefined {
    for (const view of this.#views.values()) {
      if (refKey(view.descriptor.ref) === refKey(ref)) return view.descriptor.name
    }
    return undefined
  }

  #findView(ref: ResourceRef, handlerId: ResourceHandlerId | undefined, groupId: string | undefined): string | undefined {
    for (const [viewId, view] of this.#views) {
      if (refKey(view.descriptor.ref) !== refKey(ref) || view.handlerId !== handlerId) continue
      if (groupId === undefined || this.#host.group(ref.sessionId, viewId) === groupId) return viewId
    }
    return undefined
  }

  #usesText(handlerId: ResourceHandlerId | undefined): boolean {
    return handlerId !== undefined
      && (handlerId === TEXT_RESOURCE_HANDLER_ID || this.#handlers.get(handlerId)?.document === 'text')
  }

  #hasOtherTextView(viewId: string, documentId: string): boolean {
    return [...this.#views].some(([id, view]) =>
      id !== viewId && view.documentId === documentId && this.#usesText(view.handlerId))
  }

  #view(viewId: string): ViewRecord {
    this.#assertLive()
    const view = this.#views.get(viewId)
    if (view === undefined) throw new Error(`resource-workbench: unknown view "${viewId}"`)
    return view
  }

  #documentId(viewId: string): string {
    const documentId = this.#view(viewId).documentId
    if (documentId === undefined) throw new Error(`resource-workbench: view "${viewId}" has no text document`)
    return documentId
  }

  #notify(view: ViewRecord): void {
    view.published = undefined
    for (const listener of view.listeners) {
      try {
        listener()
      } catch {
        // A view subscriber cannot starve later subscribers.
      }
    }
  }

  #publishActionFailure(view: ViewRecord, message: string): void {
    view.failure = message
    this.#notify(view)
  }

  #transitionCurrent(viewId: string, view: ViewRecord, generation: number): boolean {
    return this.#views.get(viewId) === view && view.transitionGeneration === generation
  }

  async #acceptGuards(view: ViewRecord): Promise<boolean> {
    for (const guard of view.closeGuards) {
      if (!await guard()) return false
    }
    return true
  }

  async #runBytes<T>(
    viewId: string,
    view: ViewRecord,
    source: ResourceSource,
    callerSignal: AbortSignal,
    operation: (signal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    const generation = view.byteGeneration
    const controller = new AbortController()
    view.byteControllers.add(controller)
    const signal = AbortSignal.any([callerSignal, controller.signal])
    try {
      const result = await operation(signal)
      if (this.#views.get(viewId) !== view || view.byteGeneration !== generation
        || this.#sources.get(source.id) !== source) {
        throw new Error('resource-workbench: stale byte operation')
      }
      return result
    } finally {
      view.byteControllers.delete(controller)
    }
  }

  #stopBytes(view: ViewRecord, reason: Error): void {
    view.byteGeneration += 1
    for (const controller of view.byteControllers) controller.abort(reason)
    view.byteControllers.clear()
    for (const dispose of [...view.byteWatchDisposers]) {
      try {
        dispose()
      } catch {
        // A source-owned byte watcher cannot prevent the view from detaching.
      }
    }
    view.byteWatchDisposers.clear()
  }

  #readAssociations(): void {
    try {
      const raw = this.#storage?.getItem(ASSOCIATIONS_KEY)
      if (raw === null || raw === undefined) return
      const parsed: unknown = JSON.parse(raw)
      if (typeof parsed !== 'object' || parsed === null) return
      for (const [key, value] of Object.entries(parsed)) {
        if (typeof value === 'string') this.#associations.set(key, ResourceHandlerId(value))
      }
    } catch {
      // Malformed or unavailable browser persistence leaves associations empty.
    }
  }

  #persistAssociations(): void {
    try {
      this.#storage?.setItem(ASSOCIATIONS_KEY, JSON.stringify(Object.fromEntries(this.#associations)))
    } catch {
      // The in-memory association remains effective when browser persistence is unavailable.
    }
  }

  #assertLive(): void {
    if (this.#disposed) throw new Error('resource-workbench: service is disposed')
  }
}
