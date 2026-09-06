import { afterEach, expect, it, vi } from 'vitest'
import { FilesystemResourceSource, type FilesystemSourceGateway } from '../src/client/filesystem-source.ts'
import { pollPolicy } from './poll-policy.ts'

const ref = { sessionId: 'session' as never, sourceId: 'filesystem' as never, resourceId: '/file.txt' }
const context = (size = 1) => ({ sourceHash: () => 'base', sizeBytes: () => size })
const signal = () => new AbortController().signal
const disposers: (() => void)[] = []
afterEach(() => { for (const dispose of disposers.splice(0)) dispose(); vi.useRealTimers() })
function gateway(): FilesystemSourceGateway {
  return {
    deltaText: vi.fn(async () => ({ kind: 'patch', ranges: [], canonicalHash: 'next', version: 'v2', sizeBytes: 1 })),
    readText: vi.fn(async (_session, path) => ({ path, text: 'base', version: 'v1', sizeBytes: 4 })),
    readBytes: vi.fn(async (_session, path) => ({ path, dataBase64: 'AP8=', version: 'v1' })),
    patchText: vi.fn(async () => ({ version: 'v2', canonicalHash: 'actual', sizeBytes: 4 })),
    saveBytes: vi.fn(async () => ({ version: 'v2' })),
  }
}

it('awaits the complete consumer cycle and skips other text/byte watches without queueing; manual requests bypass admission', async () => {
  vi.useFakeTimers()
  const remote = gateway()
  const source = new FilesystemResourceSource(remote, pollPolicy())
  let release!: () => void
  const listener = vi.fn(async () => { await new Promise<void>(resolve => { release = resolve }) })
  disposers.push(source.watchText(ref, listener, undefined, context()))
  disposers.push(source.watchText({ ...ref, resourceId: '/second' }, vi.fn(), undefined, context()))
  disposers.push(source.watchBytes(ref, vi.fn()))
  await vi.advanceTimersByTimeAsync(100)
  expect(remote.deltaText).toHaveBeenCalledTimes(1)
  expect(remote.readBytes).not.toHaveBeenCalled()
  await source.readTextDelta(ref, 'base', signal())
  expect(vi.mocked(remote.deltaText).mock.calls.at(-1)?.[3]).toBe(false)
  await source.readText(ref, signal())
  expect(remote.readText).toHaveBeenCalledTimes(1)
  release()
  await vi.advanceTimersByTimeAsync(1)
  // No queued cross-document callbacks burst when processing releases the permit.
  expect(remote.deltaText).toHaveBeenCalledTimes(2)
  await vi.advanceTimersByTimeAsync(10)
  expect(vi.mocked(remote.deltaText).mock.calls.length).toBeLessThanOrEqual(4)
})

it('uses size-aware idle delays, exponential capped failure backoff, and suppresses late disposed results', async () => {
  vi.useFakeTimers()
  const remote = gateway()
  vi.mocked(remote.deltaText).mockRejectedValue(new Error('offline'))
  const source = new FilesystemResourceSource(remote, pollPolicy())
  const listener = vi.fn()
  const dispose = source.watchText(ref, listener, undefined, context(101)); disposers.push(dispose)
  await vi.advanceTimersByTimeAsync(99); expect(remote.deltaText).not.toHaveBeenCalled()
  await vi.advanceTimersByTimeAsync(1); expect(remote.deltaText).toHaveBeenCalledTimes(1)
  await vi.advanceTimersByTimeAsync(199); expect(remote.deltaText).toHaveBeenCalledTimes(1)
  await vi.advanceTimersByTimeAsync(1); expect(remote.deltaText).toHaveBeenCalledTimes(2)
  await vi.advanceTimersByTimeAsync(400); expect(remote.deltaText).toHaveBeenCalledTimes(3)
  expect(listener.mock.calls[0]?.[0]).toMatchObject({ kind: 'failure' })
  dispose()
  let finish!: (value: Awaited<ReturnType<FilesystemSourceGateway['deltaText']>>) => void
  vi.mocked(remote.deltaText).mockImplementation(() => new Promise(resolve => { finish = resolve }))
  const offHuge = source.watchText(ref, listener, undefined, context(1001)); disposers.push(offHuge)
  await vi.advanceTimersByTimeAsync(299); expect(remote.deltaText).toHaveBeenCalledTimes(3)
  await vi.advanceTimersByTimeAsync(1); expect(remote.deltaText).toHaveBeenCalledTimes(4)
  offHuge(); finish({ kind: 'unchanged', canonicalHash: 'base', version: 'v2', sizeBytes: 1001 })
  await vi.advanceTimersByTimeAsync(1000); expect(listener).toHaveBeenCalledTimes(3)
})

it('stops background work on unavailable deltas and never silently invokes full reads', async () => {
  vi.useFakeTimers()
  const remote = gateway()
  vi.mocked(remote.deltaText).mockResolvedValue({ kind: 'manual-required', reason: 'too-large' })
  const source = new FilesystemResourceSource(remote, pollPolicy())
  const listener = vi.fn()
  disposers.push(source.watchText(ref, listener, undefined, context()))
  await vi.advanceTimersByTimeAsync(1000)
  expect(remote.deltaText).toHaveBeenCalledTimes(1)
  expect(remote.readText).not.toHaveBeenCalled()
  expect(listener).toHaveBeenCalledWith({ kind: 'manual-required', reason: 'too-large' })
})
