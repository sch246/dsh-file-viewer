import { splitTextBlocks } from './text-document.ts'
import type {
  UserFileReadTextRequest, UserFileTextReadPlan, UserFileTextChunkRequest, UserFileTextChunk,
  UserFileFinishTextReadRequest, UserFilePatchResult,
} from '@dsh-external/dsh-user-files/types'
import type { FileViewerMetadata } from '../types.ts'
import type { ResourceTextRead, ResourceTextStreamEvent } from './resource.ts'

/** Bounded unary filesystem transport; every request carries the document's read approval. */
export interface SegmentedTextGateway {
  /** @param request Resource and approval. @param signal Cancellation. @returns Metadata-only stable read plan. */
  prepareTextRead(request: UserFileReadTextRequest, signal: AbortSignal): Promise<UserFileTextReadPlan>
  /** @param request Prepared version and aligned offset. @param signal Cancellation. @returns Raw bytes with their expected SHA-256. */
  readTextChunk(request: UserFileTextChunkRequest, signal: AbortSignal): Promise<UserFileTextChunk>
  /** @param request Prepared version and approval. @param signal Cancellation. @returns Stable complete canonical hash, size and save revision without text. */
  finishTextRead(request: UserFileFinishTextReadRequest, signal: AbortSignal): Promise<UserFilePatchResult>
}

class TextReadIntegrityError extends Error {}
class TextRequestTimeoutError extends Error {}

function transient(error: unknown): boolean {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    // The Client gateway replaces carrier error types with this endpoint-specific diagnostic.
    return error.code === 'gateway/internal' && 'message' in error && typeof error.message === 'string'
      && /^client api: userFiles\/(prepareTextRead|readTextChunk|finishTextRead) failed: /.test(error.message)
  }
  return error instanceof TypeError || error instanceof SyntaxError
    || (error instanceof Error && /transport failure .*HTTP (408|429|5\d\d)/.test(error.message))
}

async function delay(ms: number, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted()
  await new Promise<void>((resolve, reject) => {
    const done = () => { signal.removeEventListener('abort', abort); resolve() }
    const timer = setTimeout(done, ms)
    const abort = () => { clearTimeout(timer); signal.removeEventListener('abort', abort); reject(signal.reason) }
    signal.addEventListener('abort', abort, { once: true })
  })
}

/** Retains decoder state and a bounded raw lookahead; canonical prefix text belongs to the document. */
export class SegmentedTextRead implements ResourceTextRead {
  #plan: UserFileTextReadPlan | undefined
  #decoder = new TextDecoder('utf-8', { fatal: true })
  #pendingCR = false
  #offset = 0
  #decoded = false
  #buffers = new Map<number, Uint8Array>()
  #active: AbortController | undefined
  #done: Promise<void> = Promise.resolve()
  #disposed = false

  /** @param gateway Unary provider operations. @param request Exact document identity. @param policy Validated concurrency and retry settings. */
  constructor(private readonly gateway: SegmentedTextGateway, private readonly request: UserFileReadTextRequest,
    private readonly policy: FileViewerMetadata) {}

  #reset(): void {
    this.#plan = undefined
    this.#decoder = new TextDecoder('utf-8', { fatal: true })
    this.#pendingCR = false
    this.#offset = 0
    this.#decoded = false
    this.#buffers.clear()
  }

  dispose(): void {
    this.#disposed = true
    this.#active?.abort(new Error('file-viewer: text read disposed'))
    this.#reset()
  }

  async #request<T>(read: (signal: AbortSignal) => Promise<T>, signal: AbortSignal): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      signal.throwIfAborted()
      const timeout = new AbortController()
      const abort = () => timeout.abort(signal.reason)
      signal.addEventListener('abort', abort, { once: true })
      let timedOut = false
      const timer = setTimeout(() => { timedOut = true; timeout.abort(new TextRequestTimeoutError('file-viewer: text request timed out')) }, this.policy.textReadTimeoutMs)
      try {
        const value = await read(timeout.signal)
        timeout.signal.throwIfAborted()
        return value
      } catch (error: unknown) {
        signal.throwIfAborted()
        if (attempt >= this.policy.textReadRetries || (!timedOut && !transient(error))) throw error
      } finally {
        clearTimeout(timer)
        signal.removeEventListener('abort', abort)
      }
      await delay(Math.min(this.policy.textReadTimeoutMs, this.policy.textReadRetryDelayMs * 2 ** attempt), signal)
    }
  }

  #decode(bytes?: Uint8Array): string {
    let text: string
    try { text = bytes === undefined ? this.#decoder.decode() : this.#decoder.decode(bytes, { stream: true }) }
    catch (cause: unknown) { throw new TextReadIntegrityError('file-viewer: invalid UTF-8 text', { cause }) }
    if (text.includes('\0')) throw new TextReadIntegrityError('file-viewer: NUL in text')
    if (this.#pendingCR) { text = '\r' + text; this.#pendingCR = false }
    if (bytes !== undefined && text.endsWith('\r')) { this.#pendingCR = true; text = text.slice(0, -1) }
    return text.replace(/\r\n?/g, '\n')
  }

  #blocks(text: string) {
    return splitTextBlocks(text, { minBytes: this.policy.textBlockMinBytes, targetBytes: this.policy.textBlockTargetBytes, maxBytes: this.policy.textBlockMaxBytes })
  }

  #ranges(): { offset: number; length: number }[] {
    const ranges = this.#offset === 0 ? [] : [{ offset: 0, length: this.#offset }]
    for (const [offset, bytes] of [...this.#buffers].sort(([a], [b]) => a - b)) {
      const previous = ranges.at(-1)
      if (previous !== undefined && previous.offset + previous.length === offset) previous.length += bytes.length
      else ranges.push({ offset, length: bytes.length })
    }
    return ranges
  }

  async *stream(caller: AbortSignal, access?: import('./resource.ts').ResourceTextAccess): AsyncIterable<ResourceTextStreamEvent> {
    this.#active?.abort(new Error('file-viewer: text attempt superseded'))
    await this.#done
    caller.throwIfAborted()
    if (this.#disposed) throw new Error('file-viewer: disposed text read')
    const controller = new AbortController()
    this.#active = controller
    const signal = controller.signal
    const abort = () => controller.abort(caller.reason)
    caller.addEventListener('abort', abort, { once: true })
    let resolveDone!: () => void
    this.#done = new Promise(resolve => { resolveDone = resolve })
    const pending = new Map<number, Promise<{ offset: number; bytes: Uint8Array } | { error: unknown }>>()
    const request = { ...this.request, ...access }
    let attemptPlan: UserFileTextReadPlan | undefined
    try {
      const plan = await this.#request(s => this.gateway.prepareTextRead(request, s), signal)
      if (!Number.isSafeInteger(plan.sizeBytes) || plan.sizeBytes < 0 || !Number.isSafeInteger(plan.chunkBytes)
        || plan.chunkBytes < 1 || plan.readVersion === '' || plan.path === '') throw new TextReadIntegrityError('file-viewer: invalid text read plan')
      const previous = this.#plan
      if (previous !== undefined && (previous.readVersion !== plan.readVersion || previous.path !== plan.path
        || previous.sizeBytes !== plan.sizeBytes || previous.chunkBytes !== plan.chunkBytes)) {
        this.#reset()
        throw new TextReadIntegrityError('file-viewer: file changed during loading; retry to restart')
      }
      this.#plan = plan
      attemptPlan = plan
      yield { kind: 'start', sizeBytes: plan.sizeBytes, resume: previous !== undefined, bytesRead: this.#offset,
        descriptor: { name: plan.path.split(/[\\/]/).at(-1) ?? plan.path, size: plan.sizeBytes } }
      yield { kind: 'progress', receivedRanges: this.#ranges() }
      const download = async (offset: number) => {
        const chunk = await this.#request(s => this.gateway.readTextChunk({ ...request, readVersion: plan.readVersion, offset }, s), signal)
        signal.throwIfAborted()
        let binary: string
        try { binary = atob(chunk.dataBase64) } catch (cause: unknown) { throw new TextReadIntegrityError('file-viewer: invalid chunk encoding', { cause }) }
        const bytes = new Uint8Array(binary.length)
        for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index)
        if (chunk.offset !== offset || bytes.length !== Math.min(plan.chunkBytes, plan.sizeBytes - offset)) throw new TextReadIntegrityError('file-viewer: invalid chunk range')
        const digest = await crypto.subtle.digest('SHA-256', bytes)
        const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
        if (hash !== chunk.sha256) throw new TextReadIntegrityError('file-viewer: chunk hash mismatch')
        signal.throwIfAborted()
        return { offset, bytes }
      }
      while (this.#offset < plan.sizeBytes) {
        for (let offset = this.#offset; pending.size < this.policy.textReadConcurrency
          && offset < Math.min(plan.sizeBytes, this.#offset + 2 * this.policy.textReadConcurrency * plan.chunkBytes); offset += plan.chunkBytes) {
          if (!this.#buffers.has(offset) && !pending.has(offset)) pending.set(offset, download(offset).catch(error => ({ error })))
        }
        const buffered = this.#buffers.get(this.#offset)
        if (buffered !== undefined) {
          const text = this.#decode(buffered)
          this.#buffers.delete(this.#offset)
          this.#offset += buffered.length
          const blocks = this.#blocks(text)
          yield { kind: 'chunk', text, blocks, bytesRead: this.#offset }
          continue
        }
        const result = await Promise.race(pending.values())
        if ('error' in result) throw result.error
        pending.delete(result.offset)
        this.#buffers.set(result.offset, result.bytes)
        yield { kind: 'progress', receivedRanges: this.#ranges() }
      }
      if (!this.#decoded) {
        const text = this.#decode()
        this.#decoded = true
        const blocks = this.#blocks(text)
        yield { kind: 'chunk', text, blocks, bytesRead: this.#offset }
      }
      const result = await this.#request(s => this.gateway.finishTextRead({ ...request, readVersion: plan.readVersion }, s), signal)
      signal.throwIfAborted()
      yield { kind: 'complete', ...result }
    } catch (error: unknown) {
      if (!signal.aborted && (error instanceof TextReadIntegrityError
        || (typeof error === 'object' && error !== null && 'code' in error && error.code === 'user-files/stale-version'))) this.#reset()
      throw error
    } finally {
      controller.abort(new Error('file-viewer: text attempt finished'))
      const settled = await Promise.all(pending.values())
      if (!this.#disposed && this.#plan === attemptPlan) {
        for (const result of settled) if (!('error' in result) && result.offset >= this.#offset) this.#buffers.set(result.offset, result.bytes)
      }
      caller.removeEventListener('abort', abort)
      if (this.#active === controller) this.#active = undefined
      resolveDone()
    }
  }
}
