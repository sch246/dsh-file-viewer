import { downloadBrowserFile } from '@dsh-external/dsh-user-files/download'
import { userFileTransferUrl } from '@dsh-external/dsh-user-files/transfer'
import { parseFileLocation } from '@dsh-external/dsh-user-files/file-location'
import { SegmentedTextRead, type SegmentedTextGateway } from './segmented-text-read.ts'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import {
  ResourceSourceId,
  ResourceMissingError,
  ResourceSaveConflictError,
  ResourceConfirmationRequiredError,
  type ResourceTextAccess,
  type ResourceDescriptor,
  type ResourceLinkTarget,
  type ResourceTextSaveAsTarget,
  type ResourceBytesWatchEvent,
  type ResourceLoadedBytes,
  type ResourceStream,
  type ResourceLoadedText,
  type ResourceRef,
  type ResourceSource,
  type ResourceTextWatchEvent,
} from './resource.ts'
import { diffTextLines } from '@dsh-external/dsh-user-files/text-patch'
import type { FileViewerWatchContext } from './service.ts'
import type { FileViewerMetadata } from '../types.ts'
import { hashFileViewerText, isMissingResourceError, isConfirmationRequiredError } from './service.ts'
import type {
  UserFileTextSaveAsPlan, UserFileSaveAsResult, UserFileBytesDocument, UserFileRevision, UserFileSaveResult, UserFileTextPatch, UserFilePatchResult, UserFileDeltaResult,
} from '@dsh-external/dsh-user-files/types'

/** Filesystem-source operations implemented by the generated Remote adapter. */
export interface FilesystemSourceGateway extends SegmentedTextGateway {
  resolveLink?(sessionId: SessionId, path: string, signal: AbortSignal): Promise<ResourceDescriptor>
  deltaText(sessionId: SessionId, path: string, baseHash: string, background: boolean, maxPatchBytes: number, signal: AbortSignal, access?: ResourceTextAccess): Promise<UserFileDeltaResult>
  prepareTextSaveAs(sessionId: SessionId, path: string, signal: AbortSignal): Promise<UserFileTextSaveAsPlan>
  saveTextAs(sessionId: SessionId, path: string, text: string, expectedRevision: UserFileRevision | undefined, signal: AbortSignal): Promise<UserFileSaveAsResult>
  readBytes(sessionId: SessionId, path: string, signal: AbortSignal): Promise<UserFileBytesDocument>
  patchText(sessionId: SessionId, path: string, ranges: readonly UserFileTextPatch[], signal: AbortSignal, access?: ResourceTextAccess): Promise<UserFilePatchResult>
  saveBytes(
    sessionId: SessionId,
    path: string,
    dataBase64: string,
    version: UserFileRevision,
    signal: AbortSignal,
  ): Promise<UserFileSaveResult>
  openLocation?(sessionId: SessionId, path: string, viewId?: string): Promise<void>
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
  if (root !== '') segments.push({ label: root.replaceAll('\\', '/'), selectionHint: { path: root } })
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

/** Generic resource source backed by the authenticated user-filesystem Remote. */
export class FilesystemResourceSource implements ResourceSource {
  readonly id = ResourceSourceId('filesystem')
  readonly supportsConditionalByteSave = true
  readonly openExternal?: (ref: ResourceRef, signal: AbortSignal) => Promise<void>
  readonly #gateway: FilesystemSourceGateway
  readonly #policy: FileViewerMetadata
  #backgroundBusy = false
  readonly #byteVersions = new Map<string, unknown>()

  /** @param gateway Remote and optional native-open operations. @param policy Validated deployment timing, size and transfer policy. */
  constructor(gateway: FilesystemSourceGateway, policy: FileViewerMetadata) {
    this.#gateway = gateway
    this.#policy = policy
    if (gateway.openExternal !== undefined) {
      this.openExternal = async (ref, signal) => {
        await gateway.openExternal?.(ref.sessionId, ref.resourceId, signal)
      }
    }
  }

  /** Resolve a file hyperlink relative to the containing document, never the Session working directory. */
  async resolveLink(ref: ResourceRef, href: string, signal: AbortSignal): Promise<ResourceLinkTarget> {
    if (this.#gateway.resolveLink === undefined) throw new Error('file-viewer: file link resolution unavailable')
    let value = href
    if (/^file:/i.test(value)) {
      const url = new URL(value)
      if (url.hostname !== '' && url.hostname !== 'localhost') throw new Error('file-viewer: remote file URLs are unsupported')
      value = url.pathname + url.hash
      if (/^\/[a-z]:\//i.test(value)) value = value.slice(1)
    } else if (/^[a-z][a-z\d+.-]*:/i.test(value) && !/^[a-z]:[\\/]/i.test(value)) {
      throw new Error('file-viewer: unsupported file link protocol')
    }
    // Strip an authored fragment before decoding so %23 remains part of a filename.
    if (parseFileLocation(value).textSelection === undefined) value = value.split('#', 1)[0]!
    const parsed = parseFileLocation(decodeURIComponent(value))
    const path = parsed.path
    if (path === '' || /[\u0000-\u001f\u007f]/.test(path)) throw new Error('file-viewer: invalid file link')
    const absolute = /^(?:[a-z]:[\\/]|[\\/])/i.test(path)
    const base = ref.resourceId.slice(0, Math.max(ref.resourceId.lastIndexOf('/'), ref.resourceId.lastIndexOf('\\')) + 1)
    const descriptor = await this.#gateway.resolveLink(ref.sessionId, absolute ? path : base + path, signal)
    return { descriptor, workspacePath: descriptor.ref.resourceId, ...(parsed.textSelection === undefined ? {} : { textSelection: parsed.textSelection }) }
  }

  /** Open a breadcrumb through shared file dispatch, which routes directories to a directory handler. */
  async selectLocation(ref: ResourceRef, selection?: unknown, viewId?: string): Promise<void> {
    if (typeof selection !== 'object' || selection === null || !('path' in selection)
      || typeof selection.path !== 'string') throw new Error('file-viewer: invalid filesystem location')
    if (this.#gateway.openLocation === undefined) throw new Error('file-viewer: filesystem location opening unavailable')
    await this.#gateway.openLocation(ref.sessionId, selection.path, viewId)
  }

  /** Load canonical LF text with exact source size, location and revision. */
  async readText(ref: ResourceRef, signal: AbortSignal, access?: ResourceTextAccess): Promise<ResourceLoadedText> {
    const reader = this.createTextRead(ref)
    let text = ''
    let result: ResourceLoadedText | undefined
    try {
      for await (const event of reader.stream(signal, access)) {
        if (event.kind === 'chunk') text += event.text
        if (event.kind === 'complete') {
          if (await hashFileViewerText(text) !== event.canonicalHash) throw new Error('file-viewer: completed source hash mismatch')
          result = { text, version: event.version, descriptor: { ...descriptor(ref.resourceId), size: event.sizeBytes } }
        }
      }
      if (result === undefined) throw new Error('file-viewer: incomplete text read')
      return result
    } finally { reader.dispose() }
  }

  /** Retain resumable transport state for one shared document until its owner releases it. */
  createTextRead(ref: ResourceRef): import('./resource.ts').ResourceTextRead {
    const reader = new SegmentedTextRead(this.#gateway, { sessionId: ref.sessionId, path: ref.resourceId }, this.#policy)
    return { dispose: () => reader.dispose(), stream: async function* (signal, access) {
      const iterator = reader.stream(signal, access)[Symbol.asyncIterator]()
      try {
        while (true) {
          const item = await readResource(() => iterator.next())
          if (item.done) break
          yield item.value.kind === 'start'
            ? { ...item.value, descriptor: { ...descriptor(ref.resourceId), size: item.value.sizeBytes } } : item.value
        }
      } finally { await iterator.return?.() }
    } }
  }

  /** Check authenticated access without buffering the file or entering text synchronization. */
  async getStream(ref: ResourceRef, signal: AbortSignal): Promise<ResourceStream> {
    const request = { sessionId: ref.sessionId, path: ref.resourceId }
    const url = userFileTransferUrl({ ...request, disposition: 'inline' })
    const response = await fetch(url, { method: 'HEAD', credentials: 'same-origin', signal })
    if (response.status === 404) throw new ResourceMissingError('File not found.')
    if (!response.ok) throw new Error(`File stream: HTTP ${response.status} ${response.statusText}`)
    signal.throwIfAborted()
    return { url, downloadUrl: userFileTransferUrl(request),
      download: (signal, progress) => downloadBrowserFile(userFileTransferUrl(request), ref.resourceId.split(/[/\\]/u).at(-1)!, signal, progress),
      mediaType: response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() ?? 'application/octet-stream',
      inline: /^inline(?:;|$)/i.test(response.headers.get('content-disposition') ?? ''),
    }
  }

  /** Load exact bounded bytes without decoding or text rejection. */
  async readBytes(ref: ResourceRef, signal: AbortSignal): Promise<ResourceLoadedBytes> {
    const loaded = loadedBytes(await readResource(() => this.#gateway.readBytes(ref.sessionId, ref.resourceId, signal)))
    this.#byteVersions.set(refKey(ref), loaded.version)
    return loaded
  }

  /** @param ref Resource identity. @param baseText Original canonical Base. @param text Captured Local. @param signal Cancellation. @param access Disk-read approval. @returns Actual source revision/hash after guarded range publication. */
  async saveTextDelta(ref: ResourceRef, baseText: string, text: string, signal: AbortSignal, access?: ResourceTextAccess): Promise<UserFilePatchResult> {
    const changes = diffTextLines(baseText, text)
    if (changes === undefined) throw new Error('file-viewer: line diff computation exceeded its budget')
    const ranges = await Promise.all(changes.map(async change => ({ startLine: change.startLine, lineCount: change.lineCount,
      expectedHash: await hashFileViewerText(change.oldText), replacement: change.replacement })))
    signal.throwIfAborted()
    let result: UserFilePatchResult
    try {
      result = await readResource(() => this.#gateway.patchText(ref.sessionId, ref.resourceId, ranges, signal, access))
    } catch (error: unknown) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'user-files/stale-version') {
        throw new ResourceSaveConflictError(error instanceof Error ? error.message : 'filesystem patch range changed', { cause: error })
      }
      throw error
    }
    return result
  }

  /** Resolve a destination through the independent authenticated filesystem provider. */
  async prepareTextSaveAs(ref: ResourceRef, path: string, signal: AbortSignal): Promise<ResourceTextSaveAsTarget> {
    const plan = await this.#gateway.prepareTextSaveAs(ref.sessionId, path, signal)
    return { descriptor: { ...descriptor(plan.path), name: plan.name, ref: { ...ref, resourceId: plan.path } },
      exists: plan.exists, ...(plan.revision === undefined ? {} : { version: plan.revision }) }
  }

  /** Publish captured Local only while the prepared destination still has its observed revision or absence. */
  async saveTextAs(ref: ResourceRef, target: ResourceTextSaveAsTarget, text: string, signal: AbortSignal): Promise<UserFileSaveAsResult> {
    if (target.exists && (typeof target.version !== 'string' || target.version === '')) throw new Error('file-viewer: overwrite requires a destination revision')
    try {
      return await this.#gateway.saveTextAs(ref.sessionId, target.descriptor.ref.resourceId, text,
        target.version as UserFileRevision | undefined, signal)
    } catch (error: unknown) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'user-files/stale-version') {
        throw new ResourceSaveConflictError(error instanceof Error ? error.message : 'filesystem destination changed', { cause: error })
      }
      throw error
    }
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

  /** @param ref Resource identity. @param baseHash Known canonical Source hash. @param signal Cancellation. @param access Read approval. @returns Delta-first explicit observation; the document owner controls any full-load fallback. */
  async readTextDelta(ref: ResourceRef, baseHash: string, signal: AbortSignal, access?: ResourceTextAccess): Promise<UserFileDeltaResult> {
    return readResource(() => this.#gateway.deltaText(ref.sessionId, ref.resourceId, baseHash, false, this.#policy.maxDeltaBytes, signal, access))
  }

  #interval(size: number | undefined): number {
    return size !== undefined && size > this.#policy.hugeFileBytes ? this.#policy.hugeResourcePollIntervalMs
      : size !== undefined && size > this.#policy.largeFileBytes ? this.#policy.largeResourcePollIntervalMs : this.#policy.resourcePollIntervalMs
  }

  #watch(size: () => number | undefined, cycle: (signal: AbortSignal) => Promise<'continue' | 'stop' | 'busy'>,
    failure: (error: unknown) => void | Promise<void>): () => void {
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    let failures = 0
    const poll = async (): Promise<void> => {
      if (controller.signal.aborted) return
      if (this.#backgroundBusy) { schedule(this.#interval(size())); return }
      this.#backgroundBusy = true
      const started = performance.now()
      let stopped = false
      try {
        const result = await cycle(controller.signal)
        stopped = result === 'stop'
        failures = result === 'busy' ? Math.min(failures + 1, 30) : 0
      } catch (error: unknown) {
        failures = Math.min(failures + 1, 30)
        if (!controller.signal.aborted) {
          try { await failure(error) } catch { /* The document already owns the failed consumer diagnostic; polling still backs off. */ }
        }
      } finally {
        this.#backgroundBusy = false
        const idle = this.#interval(size())
        if (!stopped) schedule(Math.max(performance.now() - started,
          failures === 0 ? idle : Math.min(this.#policy.resourcePollBackoffMaxMs, idle * 2 ** failures)))
      }
    }
    const schedule = (delay: number) => {
      if (!controller.signal.aborted) timer = setTimeout(() => { void poll() }, delay)
    }
    schedule(this.#interval(size()))
    return () => { controller.abort(new Error('filesystem source watch disposed')); clearTimeout(timer) }
  }

  /** Await read, validation and consumer application under one source-wide background permit. */
  watchText(ref: ResourceRef, listener: (event: ResourceTextWatchEvent) => void | Promise<void>, access?: ResourceTextAccess, context?: FileViewerWatchContext): () => void {
    return this.#watch(() => context?.sizeBytes(), async signal => {
      const baseHash = context?.sourceHash()
      if (baseHash === undefined) {
        await listener({ kind: 'manual-required', reason: 'base-missing' })
        return 'stop'
      }
      let delta: UserFileDeltaResult
      try {
        delta = await readResource(() => this.#gateway.deltaText(ref.sessionId, ref.resourceId, baseHash, true, this.#policy.maxDeltaBytes, signal, access))
      } catch (error: unknown) {
        if (!signal.aborted && isConfirmationRequiredError(error)) {
          await listener({ kind: 'confirmation-required', error })
          return 'stop'
        }
        throw error
      }
      if (signal.aborted) return 'stop'
      if (delta.kind === 'busy') return 'busy'
      if (delta.kind === 'manual-required') { await listener(delta); return 'stop' }
      if (delta.kind === 'patch') await listener({ kind: 'delta', baseHash, delta })
      else await listener({ kind: 'unchanged', delta })
      return 'continue'
    }, async error => {
      await listener(isMissingResourceError(error) ? { kind: 'missing', error: error as ResourceMissingError } : { kind: 'failure', error })
    })
  }

  /** Poll exact bytes with the same source-wide admission and awaited consumer processing. */
  watchBytes(ref: ResourceRef, listener: (event: ResourceBytesWatchEvent) => void | Promise<void>): () => void {
    const key = refKey(ref)
    let size: number | undefined
    let invalidated = false
    return this.#watch(() => size, async signal => {
      const loaded = loadedBytes(await readResource(() => this.#gateway.readBytes(ref.sessionId, ref.resourceId, signal)))
      if (signal.aborted) return 'stop'
      size = loaded.bytes.length
      if (invalidated || loaded.version !== this.#byteVersions.get(key)) {
        await listener({ kind: 'snapshot', snapshot: loaded })
        if (!signal.aborted) this.#byteVersions.set(key, loaded.version)
      }
      invalidated = false
      return 'continue'
    }, async error => {
      invalidated = true
      await listener(isMissingResourceError(error) ? { kind: 'missing', error: error as ResourceMissingError } : { kind: 'failure', error })
    })
  }
}
