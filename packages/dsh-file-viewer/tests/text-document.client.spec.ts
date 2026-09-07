import { createHash } from 'node:crypto'
import { expect, it, vi } from 'vitest'
import { TextBlock, TextDocumentSnapshot } from '../src/client/text-document.ts'
import { FileViewerService, FileViewerSourceId, isFileViewerDirty } from '../src/client/service.ts'

const policy = { minBytes: 8, targetBytes: 16, maxBytes: 32 }
const hash = async (text: string) => createHash('sha256').update(text).digest('hex')

it('retains shifted blocks and hashes across local insertion, cross-block delete and undo with different partitions', async () => {
  const original = TextDocumentSnapshot.fromText('a'.repeat(16) + '你😀'.repeat(20) + 'z'.repeat(32), policy)
  await original.check(hash)
  const edited = original.edit([{ from: 2, to: 3, insert: 'more' }])
  expect(edited.blocks.at(-1)).toBe(original.blocks.at(-1))
  expect(edited.byteLength).toBe(Buffer.byteLength(edited.toString()))
  const digest = vi.fn(hash)
  await edited.check(digest)
  expect(digest).toHaveBeenCalledTimes(1)
  const deleted = edited.edit([{ from: 4, to: edited.length - 20, insert: '😀' }])
  expect(deleted.toString()).toBe(edited.toString().slice(0, 4) + '😀' + edited.toString().slice(-20))
  expect(deleted.blocks.at(-1)).toBe(original.blocks.at(-1))
  const undone = edited.edit([{ from: 2, to: 6, insert: 'a' }])
  const repartitioned = new TextDocumentSnapshot([new TextBlock(original.toString())], policy)
  expect(undone.equals(repartitioned)).toBe(true)
  expect(undone.byteLength).toBe(original.byteLength)
  expect(() => original.edit([{ from: 0, to: original.length + 1, insert: '' }])).toThrow('ranges')
  const stable = new TextBlock('s'.repeat(16))
  const received = TextDocumentSnapshot.fromBlocks([stable, new TextBlock('你'), new TextBlock('r'.repeat(16))], policy)
  expect(received.blocks[0]).toBe(stable)
  expect(received.blocks[1]!.text).toBe('你' + 'r'.repeat(16))
  expect(received.blocks).toHaveLength(2)
})

it('splits large insertions on code points and reconstructs missed view transactions from unchanged block anchors', () => {
  const original = TextDocumentSnapshot.fromText('x'.repeat(96), policy)
  const edited = original.edit([{ from: 20, to: 21, insert: '😀你'.repeat(30) }])
  expect(edited.blocks.at(-1)).toBe(original.blocks.at(-1))
  for (const block of edited.blocks) {
    expect(block.byteLength).toBeLessThanOrEqual(policy.maxBytes)
    expect(block.text.isWellFormed()).toBe(true)
  }
  const withoutHistory = new TextDocumentSnapshot(edited.blocks, policy)
  let view = original.toString()
  for (const batch of withoutHistory.updatesSince(original)) {
    for (const change of [...batch].reverse()) view = view.slice(0, change.from) + change.insert + view.slice(change.to)
  }
  expect(view).toBe(edited.toString())
})

it('real shared-document typing and idle classification never materialize or hash the complete text', async () => {
  const hashText = vi.fn(hash)
  const service = new FileViewerService({ hashText, textBlockPolicy: policy })
  const ref = { sessionId: 'session' as never, sourceId: FileViewerSourceId('memory'), resourceId: 'file' }
  service.registerSource({ id: ref.sourceId, load: async () => ({ text: 'a'.repeat(96) }) })
  try {
    const id = await service.open(ref)
    const initial = service.snapshot(id)
    if (initial.status !== 'ready') throw new Error('expected document')
    const spy = vi.spyOn(TextDocumentSnapshot.prototype, 'toString').mockImplementation(() => { throw new Error('unexpected materialization') })
    hashText.mockClear()
    try {
      let observed = 0
      service.subscribe(id, () => { const value = service.snapshot(id); if (value.status === 'ready') { void { ...value }; isFileViewerDirty(value); observed++ } })
      service.editChanges(id, [{ from: 3, to: 4, insert: 'b' }])
      await vi.waitFor(() => expect(service.snapshot(id)).toMatchObject({ syncStatus: 'local-ahead' }))
      expect(hashText.mock.calls.map(([text]) => text.length)).toEqual([16])
      expect(observed).toBeGreaterThan(0)
      const edited = service.snapshot(id)
      if (edited.status !== 'ready') throw new Error('expected document')
      expect(edited.document.blocks[3]).toBe(initial.document.blocks[3])
      expect(edited.localHash).toBeUndefined()
      service.editChanges(id, [{ from: 3, to: 4, insert: 'a' }])
      await vi.waitFor(() => expect(service.snapshot(id)).toMatchObject({ syncStatus: 'synced', localHash: initial.baseHash }))
      expect(isFileViewerDirty(service.snapshot(id))).toBe(false)
    } finally { spy.mockRestore() }
  } finally { service.dispose() }
})
