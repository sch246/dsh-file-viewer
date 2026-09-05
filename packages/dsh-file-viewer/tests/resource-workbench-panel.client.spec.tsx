// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ResourceWorkbenchPanel } from '../src/client/ResourceWorkbenchPanel.tsx'
import { createImageResourceView } from '../src/client/image-handler.tsx'
import { createTextResourceView } from '../src/client/text-handler.tsx'
import type { FileViewerEditorModule } from '../src/client/editor-module.ts'
import {
  ResourceHandlerId,
  ResourceSourceId,
  type ResourceViewSnapshot,
  type ResourceWorkbenchClientService,
} from '../src/client/resource.ts'
import { en } from '../src/client/locales.ts'
import {
  ResourceWorkbenchRuntime,
  TEXT_RESOURCE_HANDLER_ID,
  type ResourceViewHost,
} from '../src/client/workbench.ts'

Object.defineProperties(URL, {
  createObjectURL: { value: () => '', configurable: true },
  revokeObjectURL: { value: () => {}, configurable: true },
})

afterEach(() => { cleanup(); vi.restoreAllMocks() })

const textId = ResourceHandlerId('text')
const imageId = ResourceHandlerId('image')
const descriptor = {
  ref: { sessionId: 'session' as never, sourceId: ResourceSourceId('memory'), resourceId: 'one.svg' },
  name: 'one.svg',
  mediaType: 'image/svg+xml',
  location: {
    label: 'Memory',
    segments: [{ label: 'one.svg', selectionHint: { resourceId: 'one.svg' } }],
    selectorId: 'memory-resources',
  },
}

function snapshot(): ResourceViewSnapshot {
  return {
    viewId: 'view',
    descriptor,
    handlerId: imageId,
    handlerStatus: 'ready',
    openWith: [
      { id: imageId, label: 'Image viewer', role: 'default', selected: true, associated: false },
      { id: textId, label: 'Text editor', role: 'available', selected: false, associated: false },
    ],
    capabilities: {
      text: true,
      bytes: true,
      byteWrite: false,
      conditionalByteWrite: false,
      byteWatch: false,
      externalOpen: false,
    },
    externalOpenSupported: false,
  }
}

describe('resource workbench presentation', () => {
  it('keeps an asynchronous text resource in its loading shell until the document is attached', async () => {
    let resolveText: ((value: { text: string }) => void) | undefined
    const text = new Promise<{ text: string }>(resolve => { resolveText = resolve })
    let openedInput: Parameters<ResourceViewHost['open']>[1] | undefined
    const host: ResourceViewHost = {
      open: async (_sessionId, input) => { openedInput = input; return 'group' },
      activate: () => {},
      update: () => {},
      pin: () => {},
      group: () => 'group',
      resolveTarget: () => 'group',
      launch: async () => {},
      registerRestorer: () => () => {},
      close: async () => {},
    }
    const runtime = new ResourceWorkbenchRuntime({ host, hashText: async value => value })
    runtime.registerHandler({
      id: TEXT_RESOURCE_HANDLER_ID,
      label: 'Text editor',
      match: () => ({ role: 'default' }),
      load: async () => ({
        View: ({ viewId, service }) => <div>text:{service.textSnapshot(viewId).status}</div>,
      }),
    })
    const sourceId = ResourceSourceId('slow-text')
    runtime.registerSource({ id: sourceId, readText: async () => text })
    const opening = runtime.open({
      ref: { sessionId: SessionId('session'), sourceId, resourceId: 'slow' },
      name: 'slow.txt',
      mediaType: 'text/plain',
    })
    expect(openedInput).toBeDefined()
    const viewId = openedInput!.id

    render(<ResourceWorkbenchPanel instanceId={viewId} service={runtime} t={key => en[key]} />)
    expect(screen.getByRole('status').textContent).toBe('Loading viewer…')
    expect(screen.queryByText(/^text:/)).toBeNull()

    await act(async () => {
      resolveText?.({ text: 'ready' })
      await opening
    })
    await waitFor(() => { expect(screen.getByText('text:ready')).toBeDefined() })
    runtime.dispose()
  })

  it.each(['close', 'dispose'] as const)(
    'ignores the mounted text editor checkpoint that arrives after runtime %s',
    async lifecycle => {
      let openedInput: Parameters<ResourceViewHost['open']>[1] | undefined
      const host: ResourceViewHost = {
        open: async (_sessionId, input) => { openedInput = input; return 'group' },
        activate: () => {},
        update: () => {},
        pin: () => {},
        group: () => 'group',
        resolveTarget: () => 'group',
        launch: async () => {},
        registerRestorer: () => () => {},
        close: async () => {
          if (openedInput?.onClose !== undefined && !await openedInput.onClose()) return
          openedInput?.onClosed?.()
        },
      }
      const runtime = new ResourceWorkbenchRuntime({ host, hashText: async value => value })
      const destroy = vi.fn()
      const createEditor = vi.fn((options: Parameters<FileViewerEditorModule['createFileViewerEditor']>[0]) => ({
        setText: () => {},
        captureViewState: () => ({ selection: 1 }),
        destroy: () => {
          destroy()
          options.onViewStateChange?.({ selection: 1 })
        },
      }))
      const editor: FileViewerEditorModule = {
        createFileViewerEditor: createEditor,
      }
      const TextView = createTextResourceView({
        loadEditor: async () => editor,
        confirm: () => true,
        t: key => en[key],
      })
      runtime.registerHandler({
        id: TEXT_RESOURCE_HANDLER_ID,
        label: 'Text editor',
        match: () => ({ role: 'default' }),
        load: async () => ({ View: TextView }),
      })
      const sourceId = ResourceSourceId(`late-checkpoint-${lifecycle}`)
      runtime.registerSource({ id: sourceId, readText: async () => ({ text: 'ready' }) })
      const viewId = await runtime.open({
        ref: { sessionId: SessionId('session'), sourceId, resourceId: 'text' },
        name: 'text.txt',
        mediaType: 'text/plain',
      })
      const rendered = render(<ResourceWorkbenchPanel instanceId={viewId} service={runtime} t={key => en[key]} />)
      await waitFor(() => { expect(createEditor).toHaveBeenCalledOnce() })

      if (lifecycle === 'close') await runtime.close(viewId)
      else runtime.dispose()
      expect(() => { rendered.unmount() }).not.toThrow()
      expect(destroy).toHaveBeenCalledOnce()
      if (lifecycle === 'close') runtime.dispose()
    },
  )

  it('offers accessible open-with switching and default association controls', () => {
    const switchHandler = vi.fn(async () => {})
    const setAssociation = vi.fn()
    const selectLocation = vi.fn(async () => {})
    const current = snapshot()
    const service = {
      snapshot: () => current,
      subscribe: () => () => {},
      switchHandler,
      setAssociation,
      selectLocation,
      loadHandler: async () => ({ View: () => <div>image body</div> }),
    } as unknown as ResourceWorkbenchClientService
    render(<ResourceWorkbenchPanel instanceId="view" service={service} t={key => en[key]} />)

    fireEvent.change(screen.getByRole('combobox', { name: 'Open with' }), { target: { value: textId } })
    expect(switchHandler).toHaveBeenCalledWith('view', textId)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Use by default' }))
    expect(setAssociation).toHaveBeenCalledWith(descriptor, imageId)
    fireEvent.click(screen.getByRole('button', { name: 'one.svg' }))
    expect(selectLocation).toHaveBeenCalledWith('view', { resourceId: 'one.svg' })
  })

  it('renders image bytes through an object URL without requesting text', async () => {
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:image')
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const readBytes = vi.fn(async () => ({
      bytes: new TextEncoder().encode('<svg><script>globalThis.BAD=true</script></svg>'),
      descriptor: { mediaType: 'image/svg+xml' },
    }))
    const service = { snapshot, readBytes } as unknown as ResourceWorkbenchClientService
    const ImageResourceView = createImageResourceView('decode failed', 'loading image')
    render(<ImageResourceView viewId="view" handlerId={imageId} service={service} />)

    await waitFor(() => { expect(screen.getByRole('img', { name: 'one.svg' }).getAttribute('src')).toBe('blob:image') })
    expect(readBytes).toHaveBeenCalledOnce()
    expect(createObjectURL).toHaveBeenCalledOnce()
    fireEvent.error(screen.getByRole('img', { name: 'one.svg' }))
    expect(screen.getByRole('alert').textContent).toBe('decode failed')
    cleanup()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:image')
  })
})
