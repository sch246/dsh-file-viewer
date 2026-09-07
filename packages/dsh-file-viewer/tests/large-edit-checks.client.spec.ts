import { afterEach, expect, it, vi } from 'vitest'
import { FileViewerService, FileViewerSourceId, isFileViewerDirty } from '../src/client/service.ts'

const services: FileViewerService[] = []
afterEach(() => { for (const service of services.splice(0)) service.dispose(); vi.useRealTimers() })
const ref = { sessionId: 'session' as never, sourceId: FileViewerSourceId('memory'), resourceId: 'file' }
async function fixture(sizeBytes = 20) {
  const hashText = vi.fn(async (text: string) => text)
  const save = vi.fn(async () => ({ version: 2 }))
  const service = new FileViewerService({ hashText, largeFileBytes: 10, largeEditCheckDelayMs: 300 })
  services.push(service)
  const off = service.registerSource({ id: ref.sourceId, load: async () => ({ text: 'base', sizeBytes, version: 1 }), save, supportsConditionalSave: true })
  const id = await service.open(ref)
  hashText.mockClear()
  return { service, id, hashText, save, off }
}

it('publishes dirty text immediately and checks only the latest large edit after its idle deadline', async () => {
  vi.useFakeTimers()
  const f = await fixture()
  f.service.edit(f.id, 'first')
  await vi.advanceTimersByTimeAsync(200)
  f.service.edit(f.id, 'latest')
  expect(f.service.snapshot(f.id)).toMatchObject({ text: 'latest', syncStatus: 'unknown' })
  expect(isFileViewerDirty(f.service.snapshot(f.id))).toBe(true)
  expect(f.hashText).not.toHaveBeenCalled()
  await vi.advanceTimersByTimeAsync(299)
  expect(f.hashText).not.toHaveBeenCalled()
  await vi.advanceTimersByTimeAsync(1)
  expect(f.hashText).toHaveBeenCalledExactlyOnceWith('latest')
  expect(f.service.snapshot(f.id)).toMatchObject({ localHash: 'latest', syncStatus: 'local-ahead' })
  const small = await fixture(4)
  small.service.edit(small.id, 'small')
  expect(small.hashText).toHaveBeenCalledExactlyOnceWith('small')
})

it('admits one background hash, discards stale completion and waits for the newest idle deadline', async () => {
  vi.useFakeTimers()
  const f = await fixture()
  let finish!: (value: string) => void
  f.hashText.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  f.service.edit(f.id, 'first')
  await vi.advanceTimersByTimeAsync(300)
  f.service.edit(f.id, 'second')
  await vi.advanceTimersByTimeAsync(200)
  f.service.edit(f.id, 'third')
  finish('first')
  await vi.advanceTimersByTimeAsync(299)
  expect(f.hashText).toHaveBeenCalledTimes(1)
  expect(f.service.snapshot(f.id)).toMatchObject({ text: 'third', syncStatus: 'unknown' })
  await vi.advanceTimersByTimeAsync(1)
  expect(f.hashText).toHaveBeenCalledTimes(2)
  expect(f.hashText).toHaveBeenLastCalledWith('third')
  expect(f.service.snapshot(f.id)).toMatchObject({ localHash: 'third' })
})

it('manual save verifies the latest captured edit and cancels its duplicate idle check; close and source removal release timers', async () => {
  vi.useFakeTimers()
  const f = await fixture()
  f.service.edit(f.id, 'save latest')
  await f.service.save(f.id)
  expect(f.hashText).toHaveBeenCalledExactlyOnceWith('save latest')
  expect(f.save).toHaveBeenCalledWith(ref, 'save latest', 1, expect.any(AbortSignal), { allowLargeFile: false })
  await vi.advanceTimersByTimeAsync(1000)
  expect(f.hashText).toHaveBeenCalledTimes(1)
  f.service.edit(f.id, 'pending close')
  f.service.discard(f.id)
  await vi.advanceTimersByTimeAsync(1000)
  expect(f.hashText).toHaveBeenCalledTimes(1)
  const removed = await fixture()
  removed.service.edit(removed.id, 'pending source removal')
  removed.off()
  await vi.advanceTimersByTimeAsync(1000)
  expect(removed.hashText).not.toHaveBeenCalled()
  expect(vi.getTimerCount()).toBe(0)
})
