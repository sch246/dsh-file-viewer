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

it('rejects a bad final hash without advancing source text or hash', async () => {
  const f = await setup(false)
  const baseHash = await hashFileViewerText('a\nb\nc\n')
  await expect(f.send({ kind: 'delta', baseHash, delta: { ...await delta('a\nb\nc\n', 'changed\n'), canonicalHash: '0'.repeat(64) } })).rejects.toThrow('hash mismatch')
  expect(f.service.snapshot(f.id)).toMatchObject({ text: 'a\nb\nc\n', latestSourceHash: baseHash })
})
