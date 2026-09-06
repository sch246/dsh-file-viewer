import { diffTextLines } from '../../dsh-file-viewer-editor/src/line-diff.ts'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FilesystemResourceSource, type FilesystemSourceGateway } from '../src/client/filesystem-source.ts'

const differ = async (base: string, text: string) => diffTextLines(base, text)
const sessionId = 'session-1' as SessionId
const ref = { sessionId, sourceId: 'filesystem' as never, resourceId: '/tmp/file.txt' }

afterEach(() => { vi.useRealTimers() })

describe('filesystem resource source', () => {
  it('loads location metadata, saves conditionally, and polls without overlap until disposed', async () => {
    vi.useFakeTimers()
    let version = 'v1'
    let active = 0
    let maximum = 0
    let release: (() => void) | undefined
    const gateway: FilesystemSourceGateway = {
      readText: vi.fn(async (_sessionId, path, signal) => {
        signal.throwIfAborted()
        active += 1
        maximum = Math.max(maximum, active)
        if (release !== undefined) await new Promise<void>(resolve => { release = resolve })
        active -= 1
        return { path, text: `text-${version}`, version }
      }),
      readBytes: vi.fn(async (_sessionId, path) => ({ path, dataBase64: 'AP8=', version: 'bytes-v1' })),
      patchText: vi.fn(async () => ({ version: 'v2', canonicalHash: 'actual' })),
      saveBytes: vi.fn(async () => ({ version: 'bytes-v2' })),
    }
    const source = new FilesystemResourceSource(gateway, 50, differ)
    expect(typeof source.saveTextDelta).toBe('function')
    expect(source.supportsConditionalByteSave).toBe(true)
    const loaded = await source.readText(ref, new AbortController().signal)
    expect(loaded).toMatchObject({
      text: 'text-v1', version: 'v1', descriptor: {
        name: 'file.txt', location: { selectable: true, segments: expect.any(Array) },
      },
    })
    await expect(source.readBytes(ref, new AbortController().signal)).resolves.toMatchObject({
      bytes: Uint8Array.of(0, 255), version: 'bytes-v1',
    })
    await expect(source.saveBytes(ref, Uint8Array.of(255, 0), 'bytes-v1', new AbortController().signal))
      .resolves.toEqual({ version: 'bytes-v2' })
    expect(gateway.saveBytes).toHaveBeenCalledWith(sessionId, ref.resourceId, '/wA=', 'bytes-v1', expect.any(AbortSignal))
    await expect(source.saveTextDelta(ref, 'text-v1', 'next', new AbortController().signal)).resolves.toEqual({ version: 'v2', canonicalHash: 'actual' })

    version = 'v3'
    release = () => {}
    const events: unknown[] = []
    const dispose = source.watchText(ref, event => { events.push(event) })
    await vi.advanceTimersByTimeAsync(50)
    await vi.advanceTimersByTimeAsync(500)
    expect(maximum).toBe(1)
    expect(vi.mocked(gateway.readText)).toHaveBeenCalledTimes(2)
    const complete = release
    release = undefined
    complete?.()
    await vi.runAllTicks()
    await vi.advanceTimersByTimeAsync(50)
    expect(events).toEqual([expect.objectContaining({ kind: 'snapshot' })])
    const lastSignal = vi.mocked(gateway.readText).mock.calls.at(-1)?.[2]
    dispose()
    expect(lastSignal?.aborted).toBe(true)
    const calls = vi.mocked(gateway.readText).mock.calls.length
    await vi.advanceTimersByTimeAsync(500)
    expect(vi.mocked(gateway.readText)).toHaveBeenCalledTimes(calls)
  })

  it('exposes external opening only when the gateway supplies it', async () => {
    const base: FilesystemSourceGateway = {
      readText: async (_sessionId, path) => ({ path, text: '', version: 'v1' }),
      readBytes: async (_sessionId, path) => ({ path, dataBase64: '', version: 'v1' }),
      patchText: async () => ({ version: 'v2', canonicalHash: 'actual' }),
      saveBytes: async () => ({ version: 'v2', canonicalHash: 'actual' }),
    }
    expect(new FilesystemResourceSource(base, 10, differ).openExternal).toBeUndefined()
    const openExternal = vi.fn(async () => {})
    const source = new FilesystemResourceSource({ ...base, openExternal }, 10, differ)
    await source.openExternal?.(ref, new AbortController().signal)
    expect(openExternal).toHaveBeenCalledWith(sessionId, ref.resourceId, expect.any(AbortSignal))
  })
})

it('routes filesystem breadcrumbs and reports patch conflicts without a bulk save', async () => {
  const openLocation = vi.fn(async () => {})
  const patchText = vi.fn(async () => { throw { code: 'user-files/stale-version', message: 'range changed' } })
  const source = new FilesystemResourceSource({
    openLocation,
    readText: async (_sessionId, path) => ({ path, text: '', version: 'v1' }),
    readBytes: async (_sessionId, path) => ({ path, dataBase64: '', version: 'v1' }),
    patchText,
    saveBytes: async () => ({ version: 'v2', canonicalHash: 'actual' }),
  }, 10, differ)
  await source.selectLocation(ref, { path: '/tmp' })
  expect(openLocation).toHaveBeenCalledWith(sessionId, '/tmp')
  await expect(source.selectLocation(ref, { path: 1 })).rejects.toThrow('invalid filesystem location')
  await expect(source.saveTextDelta(ref, 'before', 'changed', new AbortController().signal)).rejects.toThrow('filesystem patch range changed')
  expect(patchText).toHaveBeenCalledTimes(1)
  openLocation.mockRejectedValueOnce(new Error('directory unavailable'))
  await expect(source.selectLocation(ref, { path: '/gone' })).rejects.toThrow('directory unavailable')
})

it('invalidates failed byte polls and suppresses a completion after disposal', async () => {
  vi.useFakeTimers()
  let finish: ((value: { path: string; dataBase64: string; version: string }) => void) | undefined
  const readBytes = vi.fn()
    .mockRejectedValueOnce(new Error('offline'))
    .mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  const source = new FilesystemResourceSource({
    readText: async (_sessionId, path) => ({ path, text: '', version: 'v1' }),
    readBytes,
    patchText: async () => ({ version: 'v2', canonicalHash: 'actual' }),
    saveBytes: async () => ({ version: 'v2', canonicalHash: 'actual' }),
  }, 10, differ)
  const listener = vi.fn()
  const dispose = source.watchBytes(ref, listener)
  await vi.advanceTimersByTimeAsync(20)
  expect(listener).toHaveBeenCalledExactlyOnceWith({ kind: 'invalidate' })
  dispose()
  finish?.({ path: ref.resourceId, dataBase64: 'AP8=', version: 'v2' })
  await vi.advanceTimersByTimeAsync(100)
  expect(listener).toHaveBeenCalledTimes(1)
  expect(readBytes).toHaveBeenCalledTimes(2)
})
