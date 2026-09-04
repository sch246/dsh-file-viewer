import { Context } from '@deepseek-ai/cordis'
import { FsError } from '@deepseek-ai/dsh-fs'
import type { FsTarget, FsVersion } from '@deepseek-ai/dsh-fs'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { SessionPersistenceNotFoundError } from '@deepseek-ai/dsh-session-persistence'
import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { decodeWorkspaceText, FileViewerWorkspaceRemote } from '../src/remote.ts'

const sessionId = 'session-1' as SessionId
const version1 = 'version-1' as FsVersion
const version2 = 'version-2' as FsVersion
const rootTarget = { targetKey: 'root', displayPath: '/workspace' } as FsTarget
const fileTarget = { targetKey: 'file', displayPath: '/workspace/file.txt' } as FsTarget

interface Harness {
  readonly ctx: Context
  readonly fs: {
    resolve: ReturnType<typeof vi.fn>
    contains: ReturnType<typeof vi.fn>
    lstat: ReturnType<typeof vi.fn>
    stat: ReturnType<typeof vi.fn>
    readBytes: ReturnType<typeof vi.fn>
    writeText: ReturnType<typeof vi.fn>
  }
  readonly sessions: { get: ReturnType<typeof vi.fn> }
  readonly persistence: { inspect: ReturnType<typeof vi.fn> }
  readonly remote: FileViewerWorkspaceRemote
}

const contexts: Context[] = []

function createHarness(maxReadBytes = 16): Harness {
  const ctx = new Context()
  contexts.push(ctx)
  const fs = {
    resolve: vi.fn(async (path: string) => path === '/workspace' ? rootTarget : fileTarget),
    contains: vi.fn(() => true),
    lstat: vi.fn(async () => ({ type: 'file', version: version1, size: 4 })),
    stat: vi.fn(async () => ({ type: 'file', version: version1, size: 4 })),
    readBytes: vi.fn(async () => new TextEncoder().encode('text')),
    writeText: vi.fn(async () => ({ operation: 'update', version: version2, before: 'text', after: 'next' })),
  }
  const sessions = { get: vi.fn(() => ({ header: { cwd: '/workspace' } })) }
  const persistence = { inspect: vi.fn() }
  Object.defineProperties(ctx, {
    fs: { value: fs },
    sessions: { value: sessions },
    sessionPersistence: { value: persistence },
  })
  return {
    ctx,
    fs,
    sessions,
    persistence,
    remote: new FileViewerWorkspaceRemote(ctx, maxReadBytes, 'preview-or-system'),
  }
}

async function expectCode(promise: Promise<unknown>, code: string): Promise<RemoteError> {
  try {
    await promise
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(RemoteError)
    expect((error as RemoteError).code).toBe(code)
    return error as RemoteError
  }
  throw new Error(`expected RemoteError ${code}`)
}

afterEach(async () => {
  await Promise.all(contexts.splice(0).map(async ctx => ctx.fiber.dispose()))
})

describe('workspace Remote', () => {
  it('decodes UTF-8 and rejects NUL or malformed UTF-8', () => {
    expect(decodeWorkspaceText(new TextEncoder().encode('你好'), 'a.txt')).toBe('你好')
    expect(() => decodeWorkspaceText(Uint8Array.of(97, 0, 98), 'nul.txt'))
      .toThrowError(expect.objectContaining({ code: 'file-viewer/not-text' }))
    expect(() => decodeWorkspaceText(Uint8Array.of(0xc3, 0x28), 'invalid.txt'))
      .toThrowError(expect.objectContaining({ code: 'file-viewer/not-text' }))
  })

  it('uses live cwd without inspecting persistence', async () => {
    const { remote, persistence, fs } = createHarness()
    await remote.load({ sessionId, path: 'file.txt' }, new AbortController().signal)
    expect(persistence.inspect).not.toHaveBeenCalled()
    expect(fs.resolve).toHaveBeenNthCalledWith(1, '/workspace', expect.objectContaining({ signal: expect.any(AbortSignal) }))
    expect(fs.resolve).toHaveBeenNthCalledWith(2, 'file.txt', expect.objectContaining({ cwd: '/workspace' }))
  })

  it('uses persisted cwd for a cold Session', async () => {
    const { remote, sessions, persistence, fs } = createHarness()
    sessions.get.mockReturnValue(undefined)
    persistence.inspect.mockResolvedValue({ meta: { cwd: '/cold' }, events: [] })
    fs.resolve.mockImplementation(async (path: string) => path === '/cold' ? rootTarget : fileTarget)
    await remote.load({ sessionId, path: 'file.txt' }, new AbortController().signal)
    expect(persistence.inspect).toHaveBeenCalledWith(sessionId, expect.any(AbortSignal))
    expect(fs.resolve).toHaveBeenNthCalledWith(2, 'file.txt', expect.objectContaining({ cwd: '/cold' }))
  })

  it('rejects a resolved target outside the workspace', async () => {
    const { remote, fs } = createHarness()
    fs.contains.mockReturnValue(false)
    await expectCode(remote.load({ sessionId, path: '../secret' }, new AbortController().signal), 'file-viewer/outside-workspace')
    expect(fs.lstat).not.toHaveBeenCalled()
  })

  it('rejects a final symlink and a target that is not regular', async () => {
    const symlink = createHarness()
    symlink.fs.lstat.mockResolvedValue({ type: 'symlink', version: version1 })
    await expectCode(symlink.remote.load({ sessionId, path: 'link' }, new AbortController().signal), 'file-viewer/not-regular-file')

    const directory = createHarness()
    directory.fs.stat.mockResolvedValue({ type: 'directory', version: version1 })
    await expectCode(directory.remote.load({ sessionId, path: 'dir' }, new AbortController().signal), 'file-viewer/not-regular-file')
  })

  it('enforces the metadata bound and passes the same inclusive cap to readBytes', async () => {
    const tooLarge = createHarness(4)
    tooLarge.fs.stat.mockResolvedValue({ type: 'file', version: version1, size: 5 })
    const error = await expectCode(
      tooLarge.remote.load({ sessionId, path: 'large.txt' }, new AbortController().signal),
      'file-viewer/too-large',
    )
    expect(error.details).toEqual({ path: 'large.txt', maxReadBytes: 4 })
    expect(tooLarge.fs.readBytes).not.toHaveBeenCalled()

    const exact = createHarness(4)
    await exact.remote.load({ sessionId, path: 'file.txt' }, new AbortController().signal)
    expect(exact.fs.readBytes).toHaveBeenCalledWith(fileTarget, expect.any(AbortSignal), 4)
  })

  it('returns the pre-read version only when the post-read version matches', async () => {
    const stable = createHarness()
    await expect(stable.remote.load({ sessionId, path: 'file.txt' }, new AbortController().signal))
      .resolves.toEqual({ path: 'file.txt', text: 'text', version: version1 })
    expect(stable.fs.stat).toHaveBeenCalledTimes(2)

    const stale = createHarness()
    stale.fs.stat.mockResolvedValueOnce({ type: 'file', version: version1, size: 4 })
      .mockResolvedValueOnce({ type: 'file', version: version2, size: 4 })
    await expectCode(stale.remote.load({ sessionId, path: 'file.txt' }, new AbortController().signal), 'file-viewer/stale-version')
  })

  it('bounds save by encoded bytes and performs a version-guarded replacement', async () => {
    const bounded = createHarness(3)
    await expectCode(
      bounded.remote.save({ sessionId, path: 'file.txt', text: '你好', version: version1 }, new AbortController().signal),
      'file-viewer/too-large',
    )
    expect(bounded.fs.resolve).not.toHaveBeenCalled()

    const saved = createHarness(4)
    await expect(saved.remote.save({ sessionId, path: 'file.txt', text: 'next', version: version1 }, new AbortController().signal))
      .resolves.toEqual({ version: version2 })
    expect(saved.fs.writeText).toHaveBeenCalledWith(
      fileTarget,
      'next',
      { kind: 'replaceIfVersion', version: version1 },
      expect.any(AbortSignal),
    )
  })

  it('maps stale, cancellation, persistence, and storage failures', async () => {
    const stale = createHarness()
    stale.fs.writeText.mockRejectedValue(new FsError('changed', 'FS_STALE_VERSION'))
    await expectCode(
      stale.remote.save({ sessionId, path: 'file.txt', text: 'next', version: version1 }, new AbortController().signal),
      'file-viewer/stale-version',
    )

    const cancelled = createHarness()
    const controller = new AbortController()
    controller.abort('stop')
    await expectCode(cancelled.remote.load({ sessionId, path: 'file.txt' }, controller.signal), 'gateway/cancelled')

    const missing = createHarness()
    missing.sessions.get.mockReturnValue(undefined)
    missing.persistence.inspect.mockRejectedValue(new SessionPersistenceNotFoundError(sessionId))
    await expectCode(missing.remote.load({ sessionId, path: 'file.txt' }, new AbortController().signal), 'file-viewer/not-found')

    const unavailable = createHarness()
    unavailable.fs.readBytes.mockRejectedValue(new FsError('denied', 'FS_PERMISSION_DENIED'))
    await expectCode(unavailable.remote.load({ sessionId, path: 'file.txt' }, new AbortController().signal), 'file-viewer/unavailable')
  })
})
