import { afterEach, expect, it, vi } from 'vitest'
import { FileViewerSaveConflictError, FileViewerService, FileViewerSourceId, type FileViewerWatchEvent } from '../src/client/service.ts'

const services: FileViewerService[] = []
afterEach(() => { for (const service of services.splice(0)) service.dispose(); vi.useRealTimers() })

it('saves disjoint source changes, keeps ambiguous success unsynced, and permits subsequent deltas without a full refresh', async () => {
  vi.useFakeTimers(); vi.setSystemTime(1000)
  let watch!: (event: FileViewerWatchEvent) => void
  let finish!: (value: { canonicalHash: string; version: number }) => void
  const saveDelta = vi.fn().mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    .mockResolvedValueOnce({ canonicalHash: 'AA\nexternal\n', version: 3 })
    .mockRejectedValueOnce(new FileViewerSaveConflictError('range changed'))
  const load = vi.fn(async () => ({ text: 'a\nb\n', version: 1 }))
  const service = new FileViewerService({ hashText: async text => text })
  services.push(service)
  service.registerSource({ id: FileViewerSourceId('delta'), load, saveDelta,
    watch: (_ref, listener) => { watch = listener; return () => {} } })
  const id = await service.open({ sourceId: FileViewerSourceId('delta'), sessionId: 'session' as never, resourceId: 'file' })
  expect(service.snapshot(id).lastSyncedAt).toBe(1000)
  service.edit(id, 'A\nb\n'); await Promise.resolve()
  vi.setSystemTime(2000)
  watch({ kind: 'snapshot', snapshot: { text: 'a\nexternal\n', version: 2 } }); await Promise.resolve()
  expect(service.snapshot(id).lastSyncedAt).toBe(1000)
  const saving = service.save(id)
  service.edit(id, 'AA\nb\n'); await Promise.resolve()
  finish({ canonicalHash: 'A\nexternal\n', version: 2 }); await saving
  expect(service.snapshot(id)).toMatchObject({ text: 'AA\nb\n', baseText: 'A\nb\n', savedWithOtherChanges: true,
    syncStatus: 'unknown', sourceStale: true, automationPaused: true, lastSyncedAt: 1000 })
  expect(service.snapshot(id)).toMatchObject({ latestSourceText: 'a\nexternal\n', latestSourceHash: 'a\nexternal\n' })
  expect(service.snapshot(id).failure).toBeUndefined()
  await service.save(id)
  expect(saveDelta.mock.calls[1]![1]).toBe('A\nb\n')
  expect(saveDelta.mock.calls[1]![2]).toBe('AA\nb\n')
  expect(load).toHaveBeenCalledTimes(1)
  expect(service.snapshot(id)).toMatchObject({ baseText: 'AA\nb\n', lastSyncedAt: 1000 })
  service.edit(id, 'AAA\nb\n'); await Promise.resolve(); await service.save(id)
  expect(service.snapshot(id)).toMatchObject({ failure: { code: 'save-conflict' }, text: 'AAA\nb\n', baseText: 'AA\nb\n', lastSyncedAt: 1000 })
  service.edit(id, 'AA\nb\n')
  await service.save(id)
  expect(saveDelta).toHaveBeenCalledTimes(3)
  expect(service.snapshot(id).lastSyncedAt).toBe(1000)
})

it('timestamps actual loads, pulls and equal-hash saves, preserving edits made during publication', async () => {
  vi.useFakeTimers(); vi.setSystemTime(1000)
  let watch!: (event: FileViewerWatchEvent) => void
  let finish!: (value: { canonicalHash: string; version: number }) => void
  const service = new FileViewerService({ hashText: async text => text })
  services.push(service)
  service.registerSource({ id: FileViewerSourceId('delta'), load: async () => ({ text: 'a', version: 1 }),
    saveDelta: async () => new Promise(resolve => { finish = resolve }),
    watch: (_ref, listener) => { watch = listener; return () => {} } })
  const id = await service.open({ sourceId: FileViewerSourceId('delta'), sessionId: 'session' as never, resourceId: 'file' })
  vi.setSystemTime(2000)
  watch({ kind: 'snapshot', snapshot: { text: 'b', version: 2 } }); await Promise.resolve()
  expect(service.snapshot(id).lastSyncedAt).toBe(1000)
  service.discardLocal(id)
  expect(service.snapshot(id).lastSyncedAt).toBe(2000)
  service.edit(id, 'c'); await Promise.resolve()
  await watch({ kind: 'manual-required', reason: 'too-large' })
  const saving = service.save(id)
  service.edit(id, 'd'); await vi.advanceTimersByTimeAsync(0)
  vi.setSystemTime(3000); finish({ canonicalHash: 'c', version: 3 }); await saving
  expect(service.snapshot(id)).toMatchObject({ text: 'd', baseText: 'c', latestSourceText: 'c', syncStatus: 'local-ahead', lastSyncedAt: 3000 })
  expect(service.snapshot(id)).not.toHaveProperty('manualUpdateRequired')
})
