import { createMarkdownResourceHandler } from './markdown-handler.ts'
import { MARKDOWN_NS, markdownEn, markdownZh } from './markdown-locales.ts'
import { MARKDOWN_CSS } from './markdown-styles.ts'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@dsh-external/dsh-user-files/remote'
import { openWorkspaceFile } from '@deepseek-ai/dsh-client-ui-chat/client'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import fileViewerRemote from '@dsh-external/dsh-file-viewer/remote'
import { FilesystemResourceSource } from './filesystem-source.ts'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-modules/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@dsh-external/dsh-right-sidebar/client'
import { asFileViewerEditorModule } from './editor-module.ts'
import { EditorPreferencesModel } from './editor-preferences.ts'
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

export type { EditorLanguage, EditorTextMateLanguage } from './editor-languages.ts'

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
  ResourceSavedDelta,
  ResourceSavedBytes,
  ResourceSource,
  ResourceTextSaveAsTarget,
  ResourceTextWatchEvent,
  ResourceTextAccess,
  ResourceTextStreamEvent,
  ResourceTextRead,
  ResourceViewSnapshot,
  ResourceWorkbenchClientService,
} from './resource.ts'
export { ResourceHandlerId, ResourceMissingError, ResourceSaveConflictError, ResourceConfirmationRequiredError, ResourceSourceId } from './resource.ts'
export { TextBlock, TextDocumentSnapshot as BlockTextDocument, splitTextBlocks } from './text-document.ts'
export type { TextChange, TextBlockPolicy } from './text-document.ts'
export {
  MARKDOWN_RESOURCE_HANDLER_ID,
  IMAGE_RESOURCE_HANDLER_ID,
  RESOURCE_WORKBENCH_VIEW_ID,
  TEXT_RESOURCE_HANDLER_ID,
} from './workbench.ts'

/** Text synchronization types used by handlers and source providers. */
export type {
  FileViewerActivities as TextDocumentActivities,
  FileViewerFailure as TextDocumentFailure,
  FileViewerErrorCode as TextDocumentErrorCode,
  FileViewerInstanceSnapshot as TextDocumentSnapshot,
  FileViewerOperation as TextDocumentOperation,
  FileViewerSyncStatus as TextDocumentSyncStatus,
} from './service.ts'

/** Client services required by generic resource views. */
export const inject = ['remote']

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

function valueOf<T>(result: RemoteResult<T>): T {
  if (result.ok) return result.value
  throw result.error
}

async function registerRuntime(ctx: Context): Promise<() => void> {
  const metadata = valueOf(await ctx.remote.fileViewer.metadata())
  const t = ctx.locale.bind(NS)
  const host = createResourceViewHost(ctx.rightSidebar)
  const runtime = new ResourceWorkbenchRuntime({
    host,
    textBlockPolicy: { minBytes: metadata.textBlockMinBytes, targetBytes: metadata.textBlockTargetBytes, maxBytes: metadata.textBlockMaxBytes },
    largeEditCheckDelayMs: metadata.largeEditCheckDelayMs,
    largeFileBytes: metadata.largeFileBytes,
    progressiveFlushIntervalMs: metadata.progressiveFlushIntervalMs,
    hugeFileBytes: metadata.hugeFileBytes,
    confirmDiscard: () => window.confirm(t('confirmClose')),
    confirmSaveAsOverwrite: path => window.confirm(`${t('confirmSaveAsOverwrite')}\n${path}`),
    confirmHandlerSwitch: () => window.confirm(t('confirmHandlerSwitch')),
  })
  const service: ResourceWorkbenchClientService = createResourceWorkbenchClientService(runtime)
  ctx.provide('resourceWorkbench', service)
  const editorPreferences = new EditorPreferencesModel({
    editorSettings: async () => valueOf(await ctx.remote.fileViewer.editorSettings()),
    setEditorSettings: async update => valueOf(await ctx.remote.fileViewer.setEditorSettings(update)),
  })
  const openEditorConfiguration = async (viewId: string): Promise<void> => {
    const path = valueOf(await ctx.remote.fileViewer.editorSettingsDocument())
    const { sessionId } = runtime.snapshot(viewId).descriptor.ref
    const resolved = valueOf(await ctx.remote.userFiles.resolve({ sessionId, path }))
    await runtime.open({
      ref: { sessionId, sourceId: source.id, resourceId: resolved.path },
      name: resolved.name, kind: resolved.kind,
      ...(resolved.mediaType === undefined ? {} : { mediaType: resolved.mediaType }),
      ...(resolved.size === undefined ? {} : { size: resolved.size }),
    }, { handlerId: TEXT_RESOURCE_HANDLER_ID, preview: false })
  }

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
    document: 'text',
    match: textMatch,
    load: async () => {
      const module = await import('./text-handler.tsx')
      return { View: module.createTextResourceView({ editorLanguages: runtime.editorLanguages, editorPreferences, openEditorConfiguration, loadEditor, confirm: message => window.confirm(message), t }) }
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
  const offMarkdownHandler = runtime.registerHandler(createMarkdownResourceHandler(t, ctx.locale.bind(MARKDOWN_NS)))
  const offTextHandler = runtime.registerHandler(textHandler)
  const offImageHandler = runtime.registerHandler(imageHandler)
  const source = new FilesystemResourceSource({
    prepareTextSaveAs: async (sessionId, path, signal) => valueOf(await ctx.remote.userFiles.prepareTextSaveAs({ sessionId, path, allowLargeFile: true }, signal)),
    saveTextAs: async (sessionId, path, text, expectedRevision, signal) => valueOf(await ctx.remote.userFiles.saveTextAs({
      sessionId, path, text, allowLargeFile: true,
      ...(expectedRevision === undefined ? {} : { expectedRevision }),
    }, signal)),
    prepareTextRead: async (request, signal) => valueOf(await ctx.remote.userFiles.prepareTextRead(request, signal)),
    readTextChunk: async (request, signal) => valueOf(await ctx.remote.userFiles.readTextChunk(request, signal)),
    finishTextRead: async (request, signal) => valueOf(await ctx.remote.userFiles.finishTextRead(request, signal)),
    deltaText: async (sessionId, path, baseHash, background, maxPatchBytes, signal, access) => valueOf(await ctx.remote.userFiles.deltaText({ sessionId, path, baseHash, background, maxPatchBytes, ...access }, signal)),
    readBytes: async (sessionId, path, signal) => valueOf(await ctx.remote.userFiles.readBytes({ sessionId, path }, signal)),
    patchText: async (sessionId, path, ranges, signal, access) => valueOf(await ctx.remote.userFiles.patchText({ sessionId, path, ranges, ...access }, signal)),
    saveBytes: async (sessionId, path, dataBase64, version, signal) => valueOf(await ctx.remote.userFiles.saveBytes({ sessionId, path, dataBase64, version }, signal)),
    openLocation: async (sessionId, path) => { await openWorkspaceFile(ctx, { sessionId, path }) },
    openExternal: async (sessionId, path, signal) => {
      signal.throwIfAborted()
      await openWorkspaceFile(ctx, { sessionId, path, mode: 'system', signal })
    },
  }, metadata)
  const offSource = runtime.registerSource(source)
  const offRestorer = runtime.registerRestorer()
  const offOpen = ctx.on('chat/open-workspace-file', async (request, next) => {
    const resolved = valueOf(await ctx.remote.userFiles.resolve({ sessionId: request.sessionId, path: request.path }, request.signal))
    if (resolved.kind !== 'file') return next()
    const descriptor: ResourceDescriptor = {
      ref: { sessionId: request.sessionId, sourceId: source.id, resourceId: resolved.path },
      name: resolved.name,
      kind: resolved.kind,
      ...(resolved.mediaType === undefined ? {} : { mediaType: resolved.mediaType }),
      ...(resolved.size === undefined ? {} : { size: resolved.size }),
    }
    if (runtime.listOpenWith(descriptor).length === 0) return next()
    await runtime.open(descriptor, {
      ...(request.preview === undefined ? {} : { preview: request.preview }),
      ...(request.target === undefined ? {} : { target: request.target }),
    })
  })

  const offPagePersistence = ctx.effect(() => {
    const flush = () => { runtime.flushDrafts() }
    window.addEventListener('pagehide', flush)
    return () => { window.removeEventListener('pagehide', flush) }
  }, 'resource-workbench: flush drafts before page suspension')

  const offPresentation = ctx.effect(() => {
    const offLocale = ctx.locale.register(NS, { zh, en })
    const offMarkdownLocale = ctx.locale.register(MARKDOWN_NS, { zh: markdownZh, en: markdownEn })
    const style = document.createElement('style')
    style.dataset.pluginCss = '@dsh-external/dsh-file-viewer'
    style.textContent = FILE_VIEWER_CSS + MARKDOWN_CSS
    document.head.appendChild(style)
    return () => { offLocale(); offMarkdownLocale(); style.remove() }
  }, 'resource-workbench: locale and styles')

  const offView = ctx.slots.inject('rightbar.view', () => ctx.slots.register({
    name: 'rightbar.view',
    id: RESOURCE_WORKBENCH_VIEW_ID,
    locale: NS,
    inject: () => ({ service }),
  }, ResourceWorkbenchPanel))

  return () => {
    offOpen()
    offPagePersistence()
    offRestorer()
    offView()
    offPresentation()
    offMarkdownHandler()
    offImageHandler()
    offTextHandler()
    offSource()
    editorPreferences.dispose()
    runtime.dispose()
  }
}

/** @param ctx Browser Client context. @returns Plugin disposer after registration completes. */
export async function apply(ctx: Context): Promise<() => Promise<void>> {
  const disposeRemote = await ctx.remote.$mount(fileViewerRemote)
  const runtime = ctx.inject(['slots', 'locale', 'modules', 'rightSidebar', 'sessions', 'remote.session', 'remote.userFiles', 'remote.fileViewer'], registerRuntime)
  try {
    await runtime
  } catch (error: unknown) {
    await runtime.dispose()
    await disposeRemote()
    throw error
  }
  return async () => { await runtime.dispose(); await disposeRemote() }
}
