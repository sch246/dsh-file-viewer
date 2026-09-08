import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import { ResourceSourceId } from '../src/client/resource.ts'
import { ResourceWorkbenchRuntime, type ResourceViewHost } from '../src/client/workbench.ts'

describe('source-owned resource locations', () => {
  it('restores source selection hints and rejects invalid selectable metadata', async () => {
    let restore!: Parameters<ResourceViewHost['registerRestorer']>[1]
    const host: ResourceViewHost = {
      open: async (_sessionId, input) => input.id,
      activate: () => {}, update: () => {}, pin: () => {},
      group: () => 'group', resolveTarget: () => 'group', launch: vi.fn(async () => {}),
      registerRestorer: (_viewId, callback) => { restore = callback; return () => {} },
      close: async () => {},
    }
    const runtime = new ResourceWorkbenchRuntime({ host })
    onTestFinished(() => { runtime.dispose() })
    const selectLocation = vi.fn(async () => {})
    const sourceId = ResourceSourceId('source-location')
    runtime.registerSource({ id: sourceId, selectLocation })
    runtime.registerRestorer()
    const sessionId = SessionId('source-location-session')
    const ref = { sessionId, sourceId, resourceId: 'file' }
    const descriptor = {
      format: 1, ref, name: 'file',
      location: { selectable: true, segments: [{ label: 'directory', selectionHint: { path: '/directory' } }] },
    }
    await restore({ sessionId, instanceId: 'restored', descriptor })
    expect(runtime.snapshot('restored').descriptor.location).toEqual(descriptor.location)
    await runtime.selectLocation('restored', descriptor.location.segments[0]!.selectionHint)
    expect(selectLocation).toHaveBeenCalledWith(ref, { path: '/directory' }, 'restored')
    expect(host.launch).not.toHaveBeenCalled()
    await expect(restore({ sessionId, instanceId: 'invalid', descriptor: {
      ...descriptor, location: { ...descriptor.location, selectable: 'yes' },
    } })).rejects.toThrow('invalid persisted resource descriptor')
  })
})
