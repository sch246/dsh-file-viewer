import { afterEach, expect, it, vi } from 'vitest'
import { diffTextLines } from '@dsh-external/dsh-user-files/text-patch'
import { hashFileViewerText, FileViewerService, FileViewerSourceId, type FileViewerWatchEvent, type FileViewerDeltaResult } from '../src/client/service.ts'

const services: FileViewerService[] = []
afterEach(() => { for (const service of services.splice(0)) service.dispose(); vi.useRealTimers() })
const ref = { sessionId: 'session' as never, sourceId: FileViewerSourceId('delta'), resourceId: 'file' }
async function delta(base: string, text: string): Promise<Extract<FileViewerDeltaResult, { kind: 'patch' }>> {
  const changes = diffTextLines(base, text)!
  return { kind: 'patch', ranges: await Promise.all(changes.map(async change => ({ startLine: change.startLine,
    lineCount: change.lineCount, replacement: change.replacement, expectedHash: await hashFileViewerText(change.oldText) }))),
    canonicalHash: await hashFileViewerText(text), version: text, sizeBytes: text.length }
}
async function setup(autoUpdate = true) {
  let watch!: (event: FileViewerWatchEvent) => void | Promise<void>
  const load = vi.fn(async () => ({ text: 'a\nb\nc\n', version: 1 }))
  const loadDelta = vi.fn<() => Promise<FileViewerDeltaResult>>(async () => ({ kind: 'manual-required', reason: 'base-missing' }))
  const attach = vi.fn((_ref, listener) => { watch = listener; return vi.fn() })
  const service = new FileViewerService({ globalAutomationDefaults: { autoUpdate }, confirmDiscard: () => true })
  services.push(service)
  service.registerSource({ id: ref.sourceId, load, loadDelta, watch: attach, saveDelta: async () => ({ canonicalHash: '', version: 1 }) })
  const id = await service.open(ref)
  return { service, id, load, loadDelta, attach, send: (event: FileViewerWatchEvent) => watch(event) }
}

it('applies nonoverlapping remote ranges to Local and Base while retaining dirty edits; overlapping edits remain untouched', async () => {
  const f = await setup()
  const initialAge = f.service.snapshot(f.id).lastSyncedAt
  f.service.edit(f.id, 'A\nb\nc\n')
  await f.send({ kind: 'delta', baseHash: await hashFileViewerText('a\nb\nc\n'), delta: await delta('a\nb\nc\n', 'a\nb\nC\n') })
  expect(f.service.snapshot(f.id)).toMatchObject({ text: 'A\nb\nC\n', baseText: 'a\nb\nC\n', latestSourceText: 'a\nb\nC\n',
    syncStatus: 'local-ahead', automationPaused: false, lastSyncedAt: initialAge,
    textUpdate: { changes: [{ from: 4, to: 6, insert: 'C\n' }] } })
  await f.send({ kind: 'delta', baseHash: await hashFileViewerText('a\nb\nC\n'), delta: await delta('a\nb\nC\n', 'remote\nb\nC\n') })
  expect(f.service.snapshot(f.id)).toMatchObject({ text: 'A\nb\nC\n', latestSourceText: 'remote\nb\nC\n',
    syncStatus: 'diverged', automationPaused: true, manualUpdateRequired: 'conflict', lastSyncedAt: initialAge })
})

it('observes deltas without pulling when automatic update is off, uses manual deltas, and restarts watches after explicit fallback', async () => {
  const f = await setup(false)
  const age = f.service.snapshot(f.id).lastSyncedAt
  const patch = await delta('a\nb\nc\n', 'a\nb\nC\n')
  await f.send({ kind: 'delta', baseHash: await hashFileViewerText('a\nb\nc\n'), delta: patch })
  expect(f.service.snapshot(f.id)).toMatchObject({ text: 'a\nb\nc\n', latestSourceText: 'a\nb\nC\n', syncStatus: 'source-ahead', lastSyncedAt: age })
  f.loadDelta.mockResolvedValueOnce({ kind: 'unchanged', canonicalHash: patch.canonicalHash, version: 2, sizeBytes: 6 })
  await f.service.refresh(f.id)
  expect(f.load).toHaveBeenCalledTimes(1)
  expect(f.service.snapshot(f.id)).toMatchObject({ text: 'a\nb\nC\n', syncStatus: 'synced' })
  await f.send({ kind: 'manual-required', reason: 'too-large' })
  f.load.mockResolvedValueOnce({ text: 'full\n', version: 3 })
  const attachments = f.attach.mock.calls.length
  await f.service.refresh(f.id)
  expect(f.load).toHaveBeenCalledTimes(2)
  expect(f.attach).toHaveBeenCalledTimes(attachments + 1)
  expect(f.service.snapshot(f.id)).not.toHaveProperty('manualUpdateRequired')
})

it('rejects a bad final hash without advancing Source and clears transient absence on unchanged verified metadata', async () => {
  const f = await setup(false)
  const baseHash = await hashFileViewerText('a\nb\nc\n')
  await expect(f.send({ kind: 'delta', baseHash, delta: { ...await delta('a\nb\nc\n', 'changed\n'), canonicalHash: '0'.repeat(64) } })).rejects.toThrow('hash mismatch')
  expect(f.service.snapshot(f.id)).toMatchObject({ text: 'a\nb\nc\n', latestSourceHash: baseHash, automationPaused: true, failure: { code: 'watch-failed' } })
  await f.send({ kind: 'failure', error: new Error('temporary') })
  await f.send({ kind: 'unchanged', delta: { kind: 'unchanged', canonicalHash: baseHash, sizeBytes: 6, version: 2 } })
  expect(f.service.snapshot(f.id)).toMatchObject({ resourceMissing: false, automationPaused: false, sourceStale: false })
  expect(f.service.snapshot(f.id).failure).toBeUndefined()
})
