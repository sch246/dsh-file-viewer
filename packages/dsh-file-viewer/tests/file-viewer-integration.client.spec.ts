import type { FsVersion } from '@deepseek-ai/dsh-fs'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import { describe, expect, it, vi } from 'vitest'
import { createFileViewerClientService } from '../src/client/face.ts'
import { createWorkspaceFileOpenListener } from '../src/client/index.ts'
import {
  FileViewerOpenError, FileViewerService, FileViewerSourceId, type FileViewerDocumentRef,
} from '../src/client/service.ts'
import { createWorkspaceSource } from '../src/client/workspace-source.ts'

const sessionId = SessionId('session')
const sourceId = FileViewerSourceId('memory')
const documentRef: FileViewerDocumentRef = { sessionId, sourceId, resourceId: 'file.txt' }

describe('file viewer client face', () => {
  it('reveals the Files tab once and resolves after the load', async () => {
    let finish!: () => void
    const gate = new Promise<void>(resolve => { finish = resolve })
    const runtime = new FileViewerService()
    runtime.registerSource({ id: sourceId, load: async () => { await gate; return { text: 'ready' } } })
    const openTab = vi.fn()
    const face = createFileViewerClientService(runtime, { openTab })

    let settled = false
    const opening = face.open(documentRef).then(() => { settled = true })
    expect(openTab).toHaveBeenCalledOnce()
    expect(openTab).toHaveBeenCalledWith(sessionId, 'files')
    expect(settled).toBe(false)
    finish()
    await opening
    expect(face.snapshot(sessionId)).toMatchObject({ status: 'ready', text: 'ready' })
  })

  it('prioritizes a load failure over an earlier sidebar failure and retains the failed snapshot', async () => {
    const runtime = new FileViewerService()
    runtime.registerSource({ id: sourceId, load: async () => { throw new Error('read failed') } })
    const face = createFileViewerClientService(runtime, {
      openTab: () => { throw new Error('sidebar failed') },
    })

    await expect(face.open(documentRef)).rejects.toBeInstanceOf(FileViewerOpenError)
    expect(face.snapshot(sessionId)).toEqual({
      status: 'failed', ref: documentRef,
      failure: { code: 'load-failed', message: 'read failed' },
    })
  })

  it('reports a sidebar failure only after a successful load', async () => {
    const runtime = new FileViewerService()
    runtime.registerSource({ id: sourceId, load: async () => ({ text: 'ready' }) })
    const face = createFileViewerClientService(runtime, {
      openTab: () => { throw new Error('sidebar failed') },
    })

    await expect(face.open(documentRef)).rejects.toThrow('sidebar failed')
    expect(face.snapshot(sessionId)).toMatchObject({ status: 'ready', text: 'ready' })
  })
})

describe('workspace-file routing', () => {
  const request = { sessionId, path: 'file.txt' }

  it.each([
    ['system', 0, 1],
    ['preview', 1, 0],
    ['preview-or-system', 1, 0],
  ] as const)('%s uses exactly one successful route', async (mode, opens, delegates) => {
    const open = vi.fn(async () => {})
    const next = vi.fn(async () => {})
    await createWorkspaceFileOpenListener(mode, sourceId, open)(request, next)
    expect(open).toHaveBeenCalledTimes(opens)
    expect(next).toHaveBeenCalledTimes(delegates)
  })

  it('delegates once after preview-or-system preview failure', async () => {
    const open = vi.fn(async () => { throw new Error('preview failed') })
    const next = vi.fn(async () => {})
    await createWorkspaceFileOpenListener('preview-or-system', sourceId, open)(request, next)
    expect(open).toHaveBeenCalledOnce()
    expect(next).toHaveBeenCalledOnce()
  })
})

describe('workspace source adapter', () => {
  it('round-trips a present opaque version without assuming its runtime representation', async () => {
    const version = Object.freeze({ token: 7 }) as unknown as FsVersion
    const savedVersion = Object.freeze(['next']) as unknown as FsVersion
    const load = vi.fn(async () => ({
      ok: true as const, value: { path: 'file.txt', text: 'hello', version },
    }))
    const save = vi.fn(async () => ({ ok: true as const, value: { version: savedVersion } }))
    const source = createWorkspaceSource({
      workspace: { load, save },
      session: { openWorkspacePath: vi.fn() },
      cwdOf: () => '/workspace',
      externalOpenSupported: () => false,
    })

    const loaded = await source.load(documentRef, new AbortController().signal)
    expect(loaded.version).toBe(version)
    await expect(source.save!(documentRef, 'next', undefined, new AbortController().signal))
      .rejects.toThrow('requires the opaque version')
    await expect(source.save!(documentRef, 'next', version, new AbortController().signal))
      .resolves.toEqual({ version: savedVersion })
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ version }), expect.any(AbortSignal))
    expect(source.openExternal).toBeUndefined()
  })

  it('loads when the optional native external-open capability is unavailable', async () => {
    const version = 'wire-token' as FsVersion
    const source = createWorkspaceSource({
      workspace: {
        load: async () => ({ ok: true, value: { path: 'file.txt', text: 'hello', version } }),
        save: async () => ({ ok: true, value: { version } }),
      },
      session: { openWorkspacePath: vi.fn() },
      cwdOf: () => undefined,
      externalOpenSupported: () => false,
    })

    await expect(source.load(documentRef, new AbortController().signal))
      .resolves.toMatchObject({ text: 'hello', version })
  })

  it('exposes native opening only after the optional capability becomes ready', async () => {
    let supported = false
    const openWorkspacePath = vi.fn(async () => ({ ok: true as const, value: undefined }))
    const source = createWorkspaceSource({
      workspace: {
        load: async () => { throw new Error('not used') },
        save: async () => { throw new Error('not used') },
      },
      session: { openWorkspacePath },
      cwdOf: () => '/workspace',
      externalOpenSupported: () => supported,
    })

    expect(source.openExternal).toBeUndefined()
    supported = true
    await expect(source.openExternal!(documentRef, new AbortController().signal)).resolves.toBeUndefined()
    expect(openWorkspacePath).toHaveBeenCalledWith(
      { path: '/workspace/file.txt' },
      expect.any(AbortSignal),
    )
  })
})
