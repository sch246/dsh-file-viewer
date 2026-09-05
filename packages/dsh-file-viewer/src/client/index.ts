import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-modules/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@dsh-external/dsh-right-sidebar/client'
import { asFileViewerEditorModule } from './editor-module.ts'
import {
  createResourceViewHost,
  createResourceWorkbenchClientService,
} from './face.ts'
import { ResourceWorkbenchPanel } from './ResourceWorkbenchPanel.tsx'
import { en, NS, zh } from './locales.ts'
import type {
  ResourceCapabilities,
  ResourceDescriptor,
  ResourceHandler,
  ResourceHandlerMatch,
  ResourceWorkbenchClientService,
} from './resource.ts'
import {
  IMAGE_RESOURCE_HANDLER_ID,
  RESOURCE_WORKBENCH_VIEW_ID,
  ResourceWorkbenchRuntime,
  TEXT_RESOURCE_HANDLER_ID,
} from './workbench.ts'
import { FILE_VIEWER_CSS } from './styles.ts'

export type {
  ResourceAutomationPreferences,
  ResourceBytesWatchEvent,
  ResourceCapabilities,
  ResourceDescriptor,
  ResourceHandler,
  ResourceHandlerChoice,
  ResourceHandlerMatch,
  ResourceHandlerModule,
  ResourceHandlerProps,
  ResourceLoadedBytes,
  ResourceLoadedText,
  ResourceLocation,
  ResourceOpenOptions,
  ResourceOpenTarget,
  ResourceRef,
  ResourceSavedText,
  ResourceSavedBytes,
  ResourceSource,
  ResourceTextWatchEvent,
  ResourceViewSnapshot,
  ResourceWorkbenchClientService,
} from './resource.ts'
export { ResourceHandlerId, ResourceSourceId } from './resource.ts'
export {
  IMAGE_RESOURCE_HANDLER_ID,
  RESOURCE_WORKBENCH_VIEW_ID,
  TEXT_RESOURCE_HANDLER_ID,
} from './workbench.ts'

/** Text synchronization types used by handlers and source providers. */
export type {
  FileViewerFailure as TextDocumentFailure,
  FileViewerErrorCode as TextDocumentErrorCode,
  FileViewerInstanceSnapshot as TextDocumentSnapshot,
  FileViewerOperation as TextDocumentOperation,
  FileViewerSyncStatus as TextDocumentSyncStatus,
} from './service.ts'

/** Client services required by generic resource views. */
export const inject = ['slots', 'locale', 'modules', 'rightSidebar']

function textMatch(
  descriptor: ResourceDescriptor,
  capabilities: ResourceCapabilities,
): ResourceHandlerMatch | false {
  if (!capabilities.text) return false
  const mediaType = descriptor.mediaType?.toLowerCase()
  if (mediaType === 'image/svg+xml') return { role: 'available' }
  if (mediaType?.startsWith('text/') === true
    || mediaType === 'application/json'
    || mediaType?.endsWith('+json') === true
    || mediaType === 'application/xml'
    || mediaType?.endsWith('+xml') === true
    || mediaType === 'application/javascript') return { role: 'default' }
  return { role: 'available' }
}

function imageMatch(
  descriptor: ResourceDescriptor,
  capabilities: ResourceCapabilities,
): ResourceHandlerMatch | false {
  return capabilities.bytes && descriptor.mediaType?.toLowerCase().startsWith('image/') === true
    ? { role: 'default' }
    : false
}

async function registerRuntime(ctx: Context): Promise<() => void> {
  const t = ctx.locale.bind(NS)
  const host = createResourceViewHost(ctx.rightSidebar)
  const runtime = new ResourceWorkbenchRuntime({
    host,
    confirmDiscard: () => window.confirm(t('confirmClose')),
    confirmHandlerSwitch: () => window.confirm(t('confirmHandlerSwitch')),
  })
  const service: ResourceWorkbenchClientService = createResourceWorkbenchClientService(runtime)
  ctx.provide('resourceWorkbench', service)

  let editorModule: ReturnType<typeof asFileViewerEditorModule> | undefined
  let editorRequest: Promise<ReturnType<typeof asFileViewerEditorModule>> | undefined
  const loadEditor = async () => {
    if (editorModule !== undefined) return editorModule
    editorRequest ??= ctx.modules
      .import('@dsh-external/dsh-file-viewer-editor/client', '', {})
      .then(asFileViewerEditorModule)
    editorModule = await editorRequest
    return editorModule
  }

  const textHandler: ResourceHandler = {
    id: TEXT_RESOURCE_HANDLER_ID,
    label: () => t('textHandler'),
    match: textMatch,
    load: async () => {
      const module = await import('./text-handler.tsx')
      return { View: module.createTextResourceView({ loadEditor, confirm: message => window.confirm(message), t }) }
    },
  }
  const imageHandler: ResourceHandler = {
    id: IMAGE_RESOURCE_HANDLER_ID,
    label: () => t('imageHandler'),
    match: imageMatch,
    load: async () => {
      const module = await import('./image-handler.tsx')
      return { View: module.createImageResourceView(t('imageDecodeFailed'), t('handlerLoading')) }
    },
  }
  const offTextHandler = runtime.registerHandler(textHandler)
  const offImageHandler = runtime.registerHandler(imageHandler)
  const offRestorer = runtime.registerRestorer()

  const offPagePersistence = ctx.effect(() => {
    const flush = () => { runtime.flushDrafts() }
    window.addEventListener('pagehide', flush)
    return () => { window.removeEventListener('pagehide', flush) }
  }, 'resource-workbench: flush drafts before page suspension')

  const offPresentation = ctx.effect(() => {
    const offLocale = ctx.locale.register(NS, { zh, en })
    const style = document.createElement('style')
    style.dataset.pluginCss = '@dsh-external/dsh-file-viewer'
    style.textContent = FILE_VIEWER_CSS
    document.head.appendChild(style)
    return () => { offLocale(); style.remove() }
  }, 'resource-workbench: locale and styles')

  const offView = ctx.slots.inject('rightbar.view', () => ctx.slots.register({
    name: 'rightbar.view',
    id: RESOURCE_WORKBENCH_VIEW_ID,
    locale: NS,
    inject: () => ({ service }),
  }, ResourceWorkbenchPanel))

  return () => {
    offPagePersistence()
    offRestorer()
    offView()
    offPresentation()
    offImageHandler()
    offTextHandler()
    runtime.dispose()
  }
}

/** @param ctx Browser Client context. @returns Plugin disposer after registration completes. */
export async function apply(ctx: Context): Promise<() => Promise<void>> {
  const runtime = ctx.inject(['slots', 'locale', 'modules', 'rightSidebar'], registerRuntime)
  try {
    await runtime
  } catch (error: unknown) {
    await runtime.dispose()
    throw error
  }
  return async () => { await runtime.dispose() }
}
