import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'
import { createHash } from 'node:crypto'
import { afterEach, expect, it, vi } from 'vitest'
import { SegmentedTextRead, type SegmentedTextGateway } from '../src/client/segmented-text-read.ts'
import { FileViewerService, FileViewerSourceId, hashFileViewerText } from '../src/client/service.ts'
import { FilesystemResourceSource } from '../src/client/filesystem-source.ts'
import { pollPolicy } from './poll-policy.ts'
import type { ResourceTextStreamEvent } from '../src/client/resource.ts'

const hash = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex')
const ref = { sessionId: 'session' as never, sourceId: FileViewerSourceId('filesystem'), resourceId: '/file' }
const live: { dispose(): void }[] = []
afterEach(() => { for (const value of live.splice(0)) value.dispose(); vi.useRealTimers() })

function fixture(raw = 'abcdefghijklmnop', chunkBytes = 4) {
  const bytes = Buffer.from(raw)
  let version = 'stat1'
  const gateway: SegmentedTextGateway = {
    prepareTextRead: vi.fn(async () => ({ path: '/file', sizeBytes: bytes.length, chunkBytes, readVersion: version })),
    readTextChunk: vi.fn(async ({ offset }) => {
      const chunk = bytes.subarray(offset, offset + chunkBytes)
      return { offset, dataBase64: chunk.toString('base64'), sha256: hash(chunk) }
    }),
    finishTextRead: vi.fn(async () => ({ version: 'revision', sizeBytes: bytes.length, canonicalHash: hash(raw.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')) })),
  }
  const policy = { ...pollPolicy(), textReadRetries: 0, textBlockMinBytes: 4, textBlockTargetBytes: 4, textBlockMaxBytes: 8 }
  const reader = new SegmentedTextRead(gateway, { sessionId: ref.sessionId, path: '/file' }, policy)
  live.push(reader)
  return { gateway, reader, policy, changeVersion: () => { version = 'stat2' } }
}
async function collect(reader: SegmentedTextRead, events: ResourceTextStreamEvent[] = [], signal = new AbortController().signal) {
  for await (const event of reader.stream(signal)) events.push(event)
  return events
}
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

it('keeps out-of-order verified chunks and a decoded prefix across failed-middle retries', async () => {
  const f = fixture()
  const middle = deferred<never>()
  vi.mocked(f.gateway.readTextChunk).mockImplementation(async ({ offset }) => {
    if (offset === 4) return middle.promise
    const bytes = Buffer.from('abcdefghijklmnop').subarray(offset, offset + 4)
    return { offset, dataBase64: bytes.toString('base64'), sha256: hash(bytes) }
  })
  const first: ResourceTextStreamEvent[] = []
  const failed = collect(f.reader, first).catch(error => error)
  await vi.waitFor(() => expect(first).toContainEqual({ kind: 'progress', receivedRanges: [{ offset: 0, length: 4 }, { offset: 8, length: 8 }] }))
  middle.reject(new TypeError('incomplete response'))
  expect(await failed).toBeInstanceOf(TypeError)
  expect(first.filter(event => event.kind === 'chunk').map(event => event.text).join('')).toBe('abcd')
  const before = vi.mocked(f.gateway.readTextChunk).mock.calls.map(([request]) => request.offset)
  vi.mocked(f.gateway.readTextChunk).mockImplementation(async ({ offset }) => {
    expect(offset).toBe(4)
    return { offset, dataBase64: Buffer.from('efgh').toString('base64'), sha256: hash('efgh') }
  })
  const resumed = await collect(f.reader)
  expect(resumed[0]).toMatchObject({ kind: 'start', resume: true, bytesRead: 4 })
  expect(resumed.filter(event => event.kind === 'chunk').map(event => event.text).join('')).toBe('efghijklmnop')
  expect(vi.mocked(f.gateway.readTextChunk).mock.calls.length).toBe(before.length + 1)
  expect(f.gateway.prepareTextRead).toHaveBeenCalledTimes(2)
})

it('bounds lookahead around a stalled prefix and aborts without retrying caller Stop', async () => {
  const f = fixture('x'.repeat(200))
  const blocked = deferred<never>()
  vi.mocked(f.gateway.readTextChunk).mockImplementation(async ({ offset }, signal) => {
    if (offset === 0) { signal.addEventListener('abort', () => blocked.reject(signal.reason), { once: true }); return blocked.promise }
    return { offset, dataBase64: 'eHh4eA==', sha256: hash('xxxx') }
  })
  const controller = new AbortController()
  const events: ResourceTextStreamEvent[] = []
  const pending = collect(f.reader, events, controller.signal).catch(error => error)
  await vi.waitFor(() => expect(f.gateway.readTextChunk).toHaveBeenCalledTimes(6))
  expect(events.filter(event => event.kind === 'chunk')).toEqual([])
  controller.abort(new Error('Stop'))
  expect(await pending).toMatchObject({ message: 'Stop' })
  expect(f.gateway.readTextChunk).toHaveBeenCalledTimes(6)
})

it.each(['version', 'chunk size'])('rejects changed %s before mixing cached content and restarts only on the next call', async kind => {
  const f = fixture()
  vi.mocked(f.gateway.finishTextRead).mockRejectedValueOnce(new TypeError('finish disconnected'))
  await expect(collect(f.reader)).rejects.toThrow('finish disconnected')
  const calls = vi.mocked(f.gateway.readTextChunk).mock.calls.length
  if (kind === 'version') f.changeVersion()
  else vi.mocked(f.gateway.prepareTextRead).mockResolvedValueOnce({ path: '/file', sizeBytes: 16, chunkBytes: 8, readVersion: 'stat1' })
  await expect(collect(f.reader)).rejects.toThrow('file changed')
  expect(f.gateway.readTextChunk).toHaveBeenCalledTimes(calls)
  const restarted = await collect(f.reader)
  expect(restarted[0]).toMatchObject({ resume: false, bytesRead: 0 })
  expect(f.gateway.readTextChunk).toHaveBeenCalledTimes(calls + 4)
})

it.each([1, 2, 4])('decodes BOM, UTF-8 and CRLF boundaries once with %i-byte chunks', async chunkBytes => {
  const f = fixture('\uFEFF你\r\n好\rX\r', chunkBytes)
  const events = await collect(f.reader)
  expect(events.filter(event => event.kind === 'chunk').map(event => event.text).join('')).toBe('你\n好\nX\n')
  expect(events.at(-1)).toMatchObject({ canonicalHash: hash('你\n好\nX\n') })
})

it('handles empty files and rejects raw digest, invalid UTF-8 and NUL without completing', async () => {
  const empty = fixture('')
  expect((await collect(empty.reader)).at(-1)).toMatchObject({ kind: 'complete', sizeBytes: 0, canonicalHash: hash('') })
  expect(empty.gateway.readTextChunk).not.toHaveBeenCalled()
  for (const invalid of ['digest', 'utf8', 'nul']) {
    const f = fixture('xxxx')
    const bytes = invalid === 'utf8' ? Buffer.from([255, 255, 255, 255]) : invalid === 'nul' ? Buffer.from('x\0xx') : Buffer.from('xxxx')
    vi.mocked(f.gateway.readTextChunk).mockResolvedValue({ offset: 0, dataBase64: bytes.toString('base64'), sha256: invalid === 'digest' ? 'wrong' : hash(bytes) })
    await expect(collect(f.reader)).rejects.toThrow(invalid === 'digest' ? 'hash mismatch' : invalid === 'utf8' ? 'UTF-8' : 'NUL')
    expect(f.gateway.finishTextRead).not.toHaveBeenCalled()
  }
})

it('retries incomplete JSON and timeout requests within configured limits without retrying permission failures', async () => {
  vi.useFakeTimers()
  const f = fixture('abcd')
  const reader = new SegmentedTextRead(f.gateway, { sessionId: ref.sessionId, path: '/file' },
    { ...f.policy, textReadRetries: 2, textReadRetryDelayMs: 1, textReadTimeoutMs: 5 })
  live.push(reader)
  vi.mocked(f.gateway.readTextChunk).mockRejectedValueOnce(new SyntaxError('Unexpected end of JSON input'))
    .mockImplementationOnce((_request, signal) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true })))
  const pending = collect(reader)
  await vi.advanceTimersByTimeAsync(20)
  await pending
  expect(f.gateway.readTextChunk).toHaveBeenCalledTimes(3)
  expect(f.gateway.prepareTextRead).toHaveBeenCalledTimes(1)
  const denied = fixture('abcd')
  vi.mocked(denied.gateway.readTextChunk).mockRejectedValue({ code: 'user-files/permission-denied', message: 'denied' })
  await expect(collect(denied.reader)).rejects.toMatchObject({ code: 'user-files/permission-denied' })
  expect(denied.gateway.readTextChunk).toHaveBeenCalledTimes(1)
  expect(vi.getTimerCount()).toBe(0)
})

it('retains shared initial and staged refresh prefixes, validates final hash once, and releases on close', async () => {
  const f = fixture('abcdefghijklmnop')
  const filesystem = new FilesystemResourceSource({ ...f.gateway, deltaText: vi.fn(async () => ({ kind: 'manual-required', reason: 'base-missing' })),
    patchText: vi.fn(), readBytes: vi.fn(), saveBytes: vi.fn() }, f.policy)
  const hashText = vi.fn(hashFileViewerText)
  const service = new FileViewerService({ hashText, textBlockPolicy: { minBytes: 4, targetBytes: 4, maxBytes: 8 } })
  live.push(service)
  const received: import('../src/client/text-document.ts').TextBlock[] = []
  const create = vi.fn(() => {
    const reader = filesystem.createTextRead(ref as never)
    return { dispose: () => reader.dispose(), stream: async function* (signal: AbortSignal, access?: import('../src/client/service.ts').FileViewerTextAccess) {
      for await (const event of reader.stream(signal, access)) { if (event.kind === 'chunk') received.push(...(event.blocks ?? [])); yield event }
    } }
  })
  service.registerSource({ id: ref.sourceId, load: vi.fn(), createTextRead: create,
    loadDelta: async () => ({ kind: 'manual-required', reason: 'base-missing' }) })
  vi.mocked(f.gateway.finishTextRead).mockRejectedValueOnce(new TypeError('finish disconnected'))
  await expect(service.open(ref)).rejects.toThrow('finish disconnected')
  const id = service.find(ref)!
  expect(service.snapshot(id)).toMatchObject({ status: 'partial', text: 'abcdefghijklmnop', loadProgress: { complete: false } })
  expect(hashText).not.toHaveBeenCalled()
  const chunks = vi.mocked(f.gateway.readTextChunk).mock.calls.length
  await service.refresh(id)
  expect(service.snapshot(id)).toMatchObject({ status: 'ready', text: 'abcdefghijklmnop', loadProgress: { complete: true } })
  expect(f.gateway.readTextChunk).toHaveBeenCalledTimes(chunks)
  expect(hashText.mock.calls.filter(([text]) => text === 'abcdefghijklmnop')).toHaveLength(1)
  const complete = service.snapshot(id)
  if (complete.status !== 'ready') throw new Error('expected complete document')
  expect(complete.document.blocks).toEqual(received)
  complete.document.blocks.forEach((block, index) => { expect(block).toBe(received[index]); expect(block.hash).toBe(hash(block.text)) })
  service.edit(id, 'Local edits')
  await Promise.resolve()
  vi.mocked(f.gateway.finishTextRead).mockRejectedValueOnce(new TypeError('refresh disconnected'))
  await service.refresh(id)
  expect(service.snapshot(id)).toMatchObject({ status: 'ready', text: 'Local edits', failure: { message: 'refresh disconnected' } })
  const refreshChunks = vi.mocked(f.gateway.readTextChunk).mock.calls.length
  await service.refresh(id)
  expect(f.gateway.readTextChunk).toHaveBeenCalledTimes(refreshChunks)
  expect(service.snapshot(id)).toMatchObject({ status: 'ready', text: 'Local edits', latestSourceText: 'abcdefghijklmnop' })
  expect(create).toHaveBeenCalledTimes(2)
  service.discard(id)
  expect(service.find(ref)).toBeUndefined()
})

it('rejects the final canonical digest before enabling editing and releases an active reader on source removal', async () => {
  const f = fixture('abcd')
  vi.mocked(f.gateway.finishTextRead).mockResolvedValue({ version: 'revision', sizeBytes: 4, canonicalHash: 'wrong' })
  const dispose = vi.spyOn(f.reader, 'dispose')
  const service = new FileViewerService()
  live.push(service)
  const off = service.registerSource({ id: ref.sourceId, load: vi.fn(), createTextRead: () => f.reader })
  await expect(service.open(ref)).rejects.toThrow('completed source hash mismatch')
  const id = service.find(ref)!
  expect(service.snapshot(id)).toMatchObject({ status: 'partial', text: 'abcd', failure: { code: 'hash-failed' }, loadProgress: { complete: false } })
  expect(dispose).toHaveBeenCalledTimes(1)
  off()
  const active = fixture('abcd')
  let requestSignal!: AbortSignal
  vi.mocked(active.gateway.readTextChunk).mockImplementation((_request, signal) => new Promise((_resolve, reject) => {
    requestSignal = signal
    signal.addEventListener('abort', () => reject(signal.reason), { once: true })
  }))
  const unregister = service.registerSource({ id: ref.sourceId, load: vi.fn(), createTextRead: () => active.reader })
  const pending = service.refresh(id)
  await vi.waitFor(() => expect(requestSignal).toBeDefined())
  unregister()
  await pending
  expect(requestSignal.aborted).toBe(true)
  expect(service.snapshot(id)).toMatchObject({ failure: { code: 'source-unavailable' } })
  await expect(collect(active.reader)).rejects.toThrow('disposed')
})

it('retries the Client gateway carrier wrapper for truncated chunk JSON', async () => {
  vi.useFakeTimers()
  const f = fixture('abcd')
  const reader = new SegmentedTextRead(f.gateway, { sessionId: ref.sessionId, path: '/file' },
    { ...f.policy, textReadRetries: 1, textReadRetryDelayMs: 1 })
  live.push(reader)
  vi.mocked(f.gateway.readTextChunk).mockRejectedValueOnce(new RemoteError('gateway/internal',
    'client api: userFiles/readTextChunk failed: Unexpected end of JSON input', {}))
  const pending = collect(reader)
  await vi.advanceTimersByTimeAsync(2)
  expect((await pending).at(-1)).toMatchObject({ kind: 'complete', canonicalHash: hash('abcd') })
  expect(f.gateway.readTextChunk).toHaveBeenCalledTimes(2)
  expect(f.gateway.prepareTextRead).toHaveBeenCalledTimes(1)
})
