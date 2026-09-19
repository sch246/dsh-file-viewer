import { afterEach, expect, it, vi } from 'vitest'
import { FilesystemResourceSource, type FilesystemSourceGateway } from '../src/client/filesystem-source.ts'
import { ResourceSourceId } from '../src/client/resource.ts'
import { pollPolicy } from './poll-policy.ts'

afterEach(() => { vi.unstubAllGlobals() })
const ref = { sessionId: 'session' as never, sourceId: ResourceSourceId('filesystem'), resourceId: '/outside/project.ts' }
function source() {
  const unused = vi.fn(async () => { throw new Error('prefix inspection must not read a document') })
  const gateway: FilesystemSourceGateway = {
    prepareTextRead: unused, readTextChunk: unused, finishTextRead: unused, deltaText: unused,
    prepareTextSaveAs: unused, saveTextAs: unused, readBytes: unused, patchText: unused, saveBytes: unused,
  }
  return new FilesystemResourceSource(gateway, pollPolicy())
}

it('reads an authenticated bounded prefix independently of full-text approval', async () => {
  const fetch = vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), {
    status: 206, headers: { 'content-range': 'bytes 0-2/3' },
  }))
  vi.stubGlobal('fetch', fetch)
  const signal = new AbortController().signal
  expect(await source().readPrefix(ref, 389, signal)).toEqual(new Uint8Array([1, 2, 3]))
  expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/api/user-files/transfer'), {
    credentials: 'same-origin', signal, headers: { Range: 'bytes=0-388' },
  })
})

it.each([
  [200, null, [1]], [206, 'bytes 1-2/3', [1, 2]], [206, 'bytes 0-1/3', [1, 2]],
  [206, 'bytes 0-2/3', [1, 2]], [416, 'bytes */5', []], [404, null, []],
] as const)('rejects invalid or incomplete ranges (%s, %s)', async (status, range, body) => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array(body), {
    status, headers: range === null ? {} : { 'content-range': range },
  })))
  await expect(source().readPrefix(ref, 389, new AbortController().signal)).rejects.toThrow()
})

it('accepts the empty-file range response and propagates request cancellation', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 416, headers: { 'content-range': 'bytes */0' } })))
  expect(await source().readPrefix(ref, 389, new AbortController().signal)).toHaveLength(0)
  const controller = new AbortController()
  const reason = new Error('cancel inspection')
  vi.stubGlobal('fetch', vi.fn(async (_url, options: RequestInit) => {
    controller.abort(reason)
    options.signal!.throwIfAborted()
    return new Response()
  }))
  await expect(source().readPrefix(ref, 389, controller.signal)).rejects.toBe(reason)
})
