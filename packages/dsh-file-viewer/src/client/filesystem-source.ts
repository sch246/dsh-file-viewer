import type { SessionId } from '@deepseek-ai/dsh-session/types'
import {
  ResourceSourceId,
  ResourceMissingError,
  ResourceConfirmationRequiredError,
  type ResourceTextAccess,
  type ResourceBytesWatchEvent,
  type ResourceLoadedBytes,
  type ResourceLoadedText,
  type ResourceRef,
  type ResourceSource,
  type ResourceTextWatchEvent,
} from './resource.ts'
import { isMissingResourceError, isConfirmationRequiredError } from './service.ts'
import type {
  UserFileBytesDocument, UserFileRevision, UserFileTextDocument, UserFileSaveResult,
} from '@dsh-external/dsh-user-files/types'

/** Filesystem-source operations implemented by the generated Remote adapter. */
export interface FilesystemSourceGateway {
  readText(sessionId: SessionId, path: string, signal: AbortSignal, access?: ResourceTextAccess): Promise<UserFileTextDocument>
  readBytes(sessionId: SessionId, path: string, signal: AbortSignal): Promise<UserFileBytesDocument>
  saveText(
    sessionId: SessionId,
    path: string,
    text: string,
    version: UserFileRevision,
    signal: AbortSignal,
    access?: ResourceTextAccess,
  ): Promise<UserFileSaveResult>
  saveBytes(
    sessionId: SessionId,
    path: string,
    dataBase64: string,
    version: UserFileRevision,
    signal: AbortSignal,
  ): Promise<UserFileSaveResult>
  openLocation?(sessionId: SessionId, path: string): Promise<void>
  openExternal?(sessionId: SessionId, path: string, signal: AbortSignal): Promise<void>
}

async function readResource<T>(read: () => Promise<T>): Promise<T> {
  try {
    return await read()
  } catch (error: unknown) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'user-files/not-found') {
      const message = 'message' in error && typeof error.message === 'string' ? error.message : undefined
      throw new ResourceMissingError(message, { cause: error })
    }
    if (typeof error === 'object' && error !== null && 'code' in error
      && error.code === 'user-files/confirmation-required' && 'details' in error) {
      const details = error.details
      if (typeof details === 'object' && details !== null
        && 'sizeBytes' in details && typeof details.sizeBytes === 'number' && Number.isFinite(details.sizeBytes)
        && 'thresholdBytes' in details && typeof details.thresholdBytes === 'number' && Number.isFinite(details.thresholdBytes)
        && details.sizeBytes > details.thresholdBytes && details.thresholdBytes > 0) {
        throw new ResourceConfirmationRequiredError(details.sizeBytes, details.thresholdBytes, { cause: error })
      }
    }
    throw error
  }
}

function refKey(ref: ResourceRef): string {
  return JSON.stringify([ref.sessionId, ref.resourceId])
}

function pathSegments(path: string): readonly { readonly label: string; readonly selectionHint: { readonly path: string } }[] {
  const windows = /^[A-Za-z]:[\\/]/.test(path)
  const separator = windows ? '\\' : '/'
  const normalized = path.replaceAll(windows ? '/' : '\\', separator)
  const root = windows ? normalized.slice(0, 3) : normalized.startsWith('/') ? '/' : ''
  const rest = normalized.slice(root.length).split(separator).filter(Boolean)
  const segments: { label: string; selectionHint: { path: string } }[] = []
  let current = root
  if (root !== '') segments.push({ label: root, selectionHint: { path: root } })
  for (const part of rest) {
    current = current === '' || current.endsWith(separator) ? `${current}${part}` : `${current}${separator}${part}`
    segments.push({ label: part, selectionHint: { path: current } })
  }
  return segments
}

function descriptor(path: string): NonNullable<ResourceLoadedText['descriptor']> {
  const segments = pathSegments(path)
  return {
    name: segments.at(-1)?.label ?? path,
    kind: 'file',
    location: { segments, selectable: true },
  }
}

function loadedText(document: UserFileTextDocument): ResourceLoadedText {
  return { text: document.text, version: document.version, descriptor: { ...descriptor(document.path), size: document.sizeBytes } }
}

function loadedBytes(document: UserFileBytesDocument): ResourceLoadedBytes {
  const binary = atob(document.dataBase64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return { bytes, version: document.version, descriptor: descriptor(document.path) }
}

function encodeBytes(bytes: Uint8Array): string {
  const chunks: string[] = []
  const chunkSize = 0x8000
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + chunkSize)))
  }
  return btoa(chunks.join(''))
}

function watchLoaded<T extends { readonly version?: unknown }>(
  pollIntervalMs: number,
  initialVersion: unknown,
  read: (signal: AbortSignal) => Promise<T>,
  onVersion: (version: unknown) => void,
  listener: (event: { readonly kind: 'invalidate' } | { readonly kind: 'missing'; readonly error: ResourceMissingError } | { readonly kind: 'snapshot'; readonly snapshot: T }) => void,
  onConfirmation?: (error: ResourceConfirmationRequiredError) => void,
): () => void {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  let lastVersion = initialVersion
  let invalidated = false
  const poll = async (): Promise<void> => {
    try {
      const document = await read(controller.signal)
      if (controller.signal.aborted) return
      if (invalidated || document.version !== lastVersion) {
        invalidated = false
        lastVersion = document.version
        onVersion(document.version)
        listener({ kind: 'snapshot', snapshot: document })
      }
    } catch (error: unknown) {
      if (!controller.signal.aborted) {
        if (isConfirmationRequiredError(error) && onConfirmation !== undefined) {
          onConfirmation(error)
          return
        }
        invalidated = true
        listener(isMissingResourceError(error)
          ? { kind: 'missing', error: error as ResourceMissingError }
          : { kind: 'invalidate' })
      }
    } finally {
      if (!controller.signal.aborted) timer = setTimeout(() => { void poll() }, pollIntervalMs)
    }
  }
  timer = setTimeout(() => { void poll() }, pollIntervalMs)
  return () => {
    controller.abort(new Error('filesystem source watch disposed'))
    if (timer !== undefined) clearTimeout(timer)
  }
}

/** Generic resource source backed by the authenticated user-filesystem Remote. */
export class FilesystemResourceSource implements ResourceSource {
  readonly id = ResourceSourceId('filesystem')
  readonly supportsConditionalTextSave = true
  readonly supportsConditionalByteSave = true
  readonly openExternal?: (ref: ResourceRef, signal: AbortSignal) => Promise<void>
  readonly #gateway: FilesystemSourceGateway
  readonly #pollIntervalMs: number
  readonly #textVersions = new Map<string, unknown>()
  readonly #byteVersions = new Map<string, unknown>()

  /** @param gateway - Remote and optional native-open operations. @param pollIntervalMs - Delay between completed resource polls. */
  constructor(gateway: FilesystemSourceGateway, pollIntervalMs: number) {
    this.#gateway = gateway
    this.#pollIntervalMs = pollIntervalMs
    if (gateway.openExternal !== undefined) {
      this.openExternal = async (ref, signal) => {
        await gateway.openExternal?.(ref.sessionId, ref.resourceId, signal)
      }
    }
  }

  /** Open a breadcrumb through the common Host opening policy. */
  async selectLocation(ref: ResourceRef, selection?: unknown): Promise<void> {
    if (typeof selection !== 'object' || selection === null || !('path' in selection)
      || typeof selection.path !== 'string') throw new Error('file-viewer: invalid filesystem location')
    if (this.#gateway.openLocation === undefined) throw new Error('file-viewer: filesystem location opening unavailable')
    await this.#gateway.openLocation(ref.sessionId, selection.path)
  }

  /** Load canonical LF text and retain its revision for the first watch comparison. */
  async readText(ref: ResourceRef, signal: AbortSignal, access?: ResourceTextAccess): Promise<ResourceLoadedText> {
    const document = await readResource(() => this.#gateway.readText(ref.sessionId, ref.resourceId, signal, access))
    signal.throwIfAborted()
    this.#textVersions.set(refKey(ref), document.version)
    return loadedText(document)
  }

  /** Load exact bounded bytes without decoding or text rejection. */
  async readBytes(ref: ResourceRef, signal: AbortSignal): Promise<ResourceLoadedBytes> {
    const loaded = loadedBytes(await readResource(() => this.#gateway.readBytes(ref.sessionId, ref.resourceId, signal)))
    this.#byteVersions.set(refKey(ref), loaded.version)
    return loaded
  }

  /** Publish text with the opaque revision supplied by the text document owner. */
  async saveText(
    ref: ResourceRef,
    text: string,
    version: unknown,
    signal: AbortSignal,
    access?: ResourceTextAccess,
  ): Promise<UserFileSaveResult> {
    if (typeof version !== 'string' || version === '') throw new Error('file-viewer: save requires a filesystem revision')
    const result = await readResource(() => this.#gateway.saveText(
      ref.sessionId,
      ref.resourceId,
      text,
      version as UserFileRevision,
      signal,
      access,
    ))
    this.#textVersions.set(refKey(ref), result.version)
    return result
  }

  /** Publish exact bytes with the opaque revision supplied by the byte editor. */
  async saveBytes(
    ref: ResourceRef,
    bytes: Uint8Array,
    version: unknown,
    signal: AbortSignal,
  ): Promise<UserFileSaveResult> {
    if (typeof version !== 'string' || version === '') throw new Error('file-viewer: save requires a filesystem revision')
    const result = await this.#gateway.saveBytes(
      ref.sessionId,
      ref.resourceId,
      encodeBytes(bytes),
      version as UserFileRevision,
      signal,
    )
    this.#byteVersions.set(refKey(ref), result.version)
    return result
  }

  /** Poll only while subscribed, never overlap reads, and stop after disposal. */
  watchText(ref: ResourceRef, listener: (event: ResourceTextWatchEvent) => void, access?: ResourceTextAccess): () => void {
    const key = refKey(ref)
    return watchLoaded(
      this.#pollIntervalMs,
      this.#textVersions.get(key),
      async signal => loadedText(await readResource(() => this.#gateway.readText(ref.sessionId, ref.resourceId, signal, access))),
      version => { this.#textVersions.set(key, version) },
      listener,
      error => { listener({ kind: 'confirmation-required', error }) },
    )
  }

  /** Poll bounded bytes while subscribed without overlapping reads. */
  watchBytes(ref: ResourceRef, listener: (event: ResourceBytesWatchEvent) => void): () => void {
    const key = refKey(ref)
    return watchLoaded(
      this.#pollIntervalMs,
      this.#byteVersions.get(key),
      async signal => loadedBytes(await readResource(() => this.#gateway.readBytes(ref.sessionId, ref.resourceId, signal))),
      version => { this.#byteVersions.set(key, version) },
      listener,
    )
  }
}
