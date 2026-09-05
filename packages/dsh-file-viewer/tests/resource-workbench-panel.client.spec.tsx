// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ResourceWorkbenchPanel } from '../src/client/ResourceWorkbenchPanel.tsx'
import { createImageResourceView } from '../src/client/image-handler.tsx'
import { createTextResourceView } from '../src/client/text-handler.tsx'
import { createResourceWorkbenchClientService } from '../src/client/face.ts'
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
  it('updates default controls across views without changing shared or independent document choices', async () => {
    const inputs = new Map<string, Parameters<ResourceViewHost['open']>[1]>()
    const host: ResourceViewHost = {
      open: async (_session, input) => { inputs.set(input.id, input); return 'group' },
      activate: () => {}, update: () => {}, pin: () => {}, group: () => 'group',
      resolveTarget: () => 'group', launch: async () => {}, registerRestorer: () => () => {},
      close: async (_session, id) => {
        const input = inputs.get(id)
        if (input?.onClose !== undefined && !await input.onClose()) return
        inputs.delete(id)
        input?.onClosed?.()
      },
    }
    const storage = new Map<string, string>()
    const runtime = new ResourceWorkbenchRuntime({
      host, hashText: async value => value,
      storage: {
        getItem: key => storage.get(key) ?? null,
        setItem: (key, value) => { storage.set(key, value) },
        removeItem: key => { storage.delete(key) },
      },
    })
    const service = createResourceWorkbenchClientService(runtime)
    const TextView = createTextResourceView({
      loadEditor: async () => ({ createFileViewerEditor: () => ({
        setText: () => {}, setComparison: () => {}, setLineNumbers: () => {}, captureViewState: () => undefined, destroy: () => {},
      }) }),
      confirm: () => true, t: key => en[key],
    })
    service.registerHandler({ id: textId, label: 'Text', match: () => ({ role: 'default' }), load: async () => ({ View: TextView }) })
    service.registerSource({
      id: descriptor.ref.sourceId, readText: async () => ({ text: 'base' }),
      saveText: async () => ({}), supportsConditionalTextSave: true, watchText: () => () => {},
    })
    try {
      const first = await service.open(descriptor)
      const second = await service.open(descriptor, { sideBySide: true })
      const independent = await service.open({ ...descriptor, ref: { ...descriptor.ref, resourceId: 'two' } })
      const renderViews = () => <>
        {[first, second, independent].map(viewId => <div key={viewId} data-testid={viewId}>
          <TextView viewId={viewId} handlerId={textId} service={service} />
        </div>)}
      </>
      const rendered = render(renderViews())
      await waitFor(() => { expect(screen.queryByText(en.editorLoading)).toBeNull() })
      const firstView = within(screen.getByTestId(first))
      const secondView = within(screen.getByTestId(second))
      const thirdView = within(screen.getByTestId(independent))
      for (const view of [firstView, secondView, thirdView]) {
        fireEvent.mouseEnter(view.getByTitle(en.synchronization).parentElement!)
      }
      const before = service.textSnapshot(first)
      const documentNotified = vi.fn()
      const unsubscribe = service.subscribeText(first, documentNotified)
      fireEvent.click(firstView.getByRole('checkbox', { name: en.globalAutoUpdate }))
      fireEvent.click(firstView.getByRole('checkbox', { name: en.globalAutoSave }))
      expect(service.textSnapshot(first)).toBe(before)
      expect(documentNotified).not.toHaveBeenCalled()
      for (const view of [firstView, secondView, thirdView]) {
        expect((view.getByRole('checkbox', { name: en.globalAutoUpdate }) as HTMLInputElement).checked).toBe(true)
        expect((view.getByRole('checkbox', { name: en.globalAutoSave }) as HTMLInputElement).checked).toBe(true)
        expect((view.getByRole('checkbox', { name: en.autoUpdate }) as HTMLInputElement).checked).toBe(false)
        expect((view.getByRole('checkbox', { name: en.autoSave }) as HTMLInputElement).checked).toBe(false)
        expect(view.queryByRole('button', { name: /Inherit/ })).toBeNull()
      }
      fireEvent.click(firstView.getByRole('checkbox', { name: en.autoUpdate }))
      expect((secondView.getByRole('checkbox', { name: en.autoUpdate }) as HTMLInputElement).checked).toBe(true)
      expect((thirdView.getByRole('checkbox', { name: en.autoUpdate }) as HTMLInputElement).checked).toBe(false)
      unsubscribe()
      rendered.unmount()
      render(renderViews())
      expect(service.textSnapshot(second).automation).toEqual({ autoUpdate: true, autoSave: false })
      cleanup()
      await service.close(first)
      expect(service.textSnapshot(second).automation).toEqual({ autoUpdate: true, autoSave: false })
      await service.close(second)
      const reopened = await service.open(descriptor)
      expect(service.textSnapshot(reopened).automation).toEqual({ autoUpdate: true, autoSave: true })
    } finally {
      cleanup()
      runtime.dispose()
    }
  })

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
        setComparison: () => {},
        setLineNumbers: () => {},
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
    let current = snapshot()
    const service = {
      snapshot: () => current,
      subscribe: () => () => {},
      switchHandler,
      setAssociation,
      selectLocation,
      loadHandler: async () => ({ View: () => <div>image body</div> }),
    } as unknown as ResourceWorkbenchClientService
    const rendered = render(<ResourceWorkbenchPanel instanceId="view" service={service} t={key => en[key]} />)

    expect(screen.queryByRole('combobox')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: en.openWith }))
    fireEvent.click(screen.getByRole('button', { name: `${en.rememberHandler}: Text editor` }))
    expect(setAssociation).toHaveBeenCalledWith(descriptor, textId)
    expect(switchHandler).not.toHaveBeenCalled()
    current = { ...current, openWith: current.openWith.map(choice => ({ ...choice, associated: choice.id === textId })) }
    rendered.rerender(<ResourceWorkbenchPanel instanceId="view" service={service} t={key => en[key]} />)
    const marker = screen.getByRole('button', { name: `${en.rememberHandler}: Text editor` })
    expect(marker.getAttribute('aria-pressed')).toBe('true')
    expect(marker.title).toBe(en.rememberHandler)
    fireEvent.click(marker)
    expect(setAssociation).toHaveBeenLastCalledWith(descriptor, undefined)
    fireEvent.click(screen.getByRole('button', { name: 'Text editor' }))
    expect(switchHandler).toHaveBeenCalledWith('view', textId)
    expect(setAssociation).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole('group', { name: en.openWith })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: en.openWith }))
    fireEvent.keyDown(screen.getByRole('button', { name: en.openWith }), { key: 'Escape' })
    expect(screen.queryByRole('group', { name: en.openWith })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: en.openWith }))
    fireEvent.pointerDown(document.body)
    expect(screen.queryByRole('group', { name: en.openWith })).toBeNull()
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
