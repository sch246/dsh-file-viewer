import type { Context } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type {} from '@dsh-external/dsh-right-sidebar/client'
import fileViewerRemote from '@dsh-external/dsh-file-viewer/remote'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { FileViewerClientService } from './contract.ts'
import { asFileViewerEditorModule } from './editor-module.ts'
import { createFileViewerClientService } from './face.ts'
import { FileViewerPanel, type FileViewerPanelInjected } from './FileViewerPanel.tsx'
import { en, NS, zh } from './locales.ts'
import { FileViewerService } from './service.ts'
import { FILE_VIEWER_CSS } from './styles.ts'
import {
  createWorkspaceSource, type FileViewerWorkspaceRemoteClient, type SessionPathRemoteClient,
} from './workspace-source.ts'

export type { FileViewerClientService } from './contract.ts'
export type {
  FileViewerDocumentRef, FileViewerFailure, FileViewerLoadedText, FileViewerSavedText,
  FileViewerSessionSnapshot, FileViewerSource,
} from './service.ts'
export { FileViewerOpenError, FileViewerSourceId } from './service.ts'

interface SessionListSnapshot {
  readonly byId: Readonly<Record<string, { readonly cwd?: string } | undefined>>
}

interface FileViewerRuntimeContext {
  readonly remote: {
    $mount(contribution: unknown): Promise<() => Promise<void>>
    readonly fileViewerWorkspace: FileViewerWorkspaceRemoteClient
  }
  readonly sessions: { readonly list: { getSnapshot(): SessionListSnapshot } }
  readonly rightSidebar: import('@dsh-external/dsh-right-sidebar/client').RightSidebarService
  readonly modules: { import(id: string, base: string, config: object): Promise<unknown> }
  readonly locale: {
    register(namespace: string, locales: object): () => void
    bind(namespace: string): (key: import('./locales.ts').FileViewerLocaleKey) => string
  }
  readonly slots: {
    inject(name: string, callback: () => () => void): () => void
    register(options: object, component: unknown): () => void
  }
  get(name: string): unknown
  provide(name: 'fileViewer', value: FileViewerClientService): void
  on(event: 'chat/open-workspace-file', listener: (
    request: { readonly sessionId: SessionId; readonly path: string },
    next: () => Promise<void>,
  ) => Promise<void>): () => void
  effect(callback: () => () => void, label: string): () => void
  inject(names: readonly string[], callback: (ctx: Context) => Promise<() => void>): PromiseLike<void> & { dispose(): Promise<void> }
}

function valueOf<T>(result: RemoteResult<T>): T {
  if (result.ok) return result.value
  throw result.error
}

/** Required bootstrap service; feature dependencies wait for the mounted generated namespace. */
export const inject = ['remote']

async function registerRuntime(baseCtx: Context): Promise<() => void> {
  const ctx = baseCtx as unknown as FileViewerRuntimeContext
  const mode = valueOf(await ctx.remote.fileViewerWorkspace.openMode())
  const sessionRemote = ctx.get('remote.session') as SessionPathRemoteClient | undefined
  let externalOpenSupported = false
  if (sessionRemote !== undefined) {
    const capability = await sessionRemote.canOpenWorkspacePath()
    externalOpenSupported = capability.ok && capability.value
  }

  const runtime = new FileViewerService()
  const face: FileViewerClientService = createFileViewerClientService(runtime, ctx.rightSidebar)
  ctx.provide('fileViewer', face)
  const workspace = createWorkspaceSource({
    workspace: ctx.remote.fileViewerWorkspace,
    ...(sessionRemote === undefined ? {} : { session: sessionRemote }),
    cwdOf: (sessionId: SessionId) => ctx.sessions.list.getSnapshot().byId[sessionId]?.cwd,
    externalOpenSupported,
  })
  const unregisterWorkspace = face.registerSource(workspace)

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

  const offOpen = ctx.on('chat/open-workspace-file', async (request, next) => {
    if (mode === 'system') return await next()
    const ref = { sessionId: request.sessionId, sourceId: workspace.id, resourceId: request.path }
    if (mode === 'preview') {
      await face.open(ref)
      return
    }
    try {
      await face.open(ref)
      return
    } catch {
      return await next()
    }
  })

  const offPresentation = ctx.effect(() => {
    const offLocale = ctx.locale.register(NS, { zh, en })
    const style = document.createElement('style')
    style.dataset.pluginCss = '@dsh-external/dsh-file-viewer'
    style.textContent = FILE_VIEWER_CSS
    document.head.appendChild(style)
    return () => { offLocale(); style.remove() }
  }, 'file-viewer: locale and styles')

  const t = ctx.locale.bind(NS)
  const offTab = ctx.slots.inject('rightbar.tab', () => ctx.slots.register({
    name: 'rightbar.tab', id: 'files', order: 0, label: () => t('tab'), locale: NS,
    inject: (sessionId: SessionId): FileViewerPanelInjected => ({
      snapshot: () => face.snapshot(sessionId),
      subscribe: listener => face.subscribe(sessionId, listener),
      edit: text => { face.edit(sessionId, text) },
      save: () => { void face.save(sessionId) },
      refresh: () => { void face.refresh(sessionId) },
      openExternal: () => { void face.openExternal(sessionId) },
      loadEditor,
    }),
  }, FileViewerPanel))

  return () => {
    offTab()
    offPresentation()
    offOpen()
    unregisterWorkspace()
    runtime.dispose()
  }
}

/** Mount the generated Host descriptor, then register runtime behavior after its namespace is ready. */
export async function apply(ctx: Context): Promise<() => Promise<void>> {
  const client = ctx as unknown as FileViewerRuntimeContext
  const disposeRemote = await client.remote.$mount(fileViewerRemote)
  const runtime = client.inject(
    ['slots', 'locale', 'modules', 'sessions', 'rightSidebar', 'remote.fileViewerWorkspace'],
    registerRuntime,
  )
  try {
    await runtime
  } catch (error: unknown) {
    await runtime.dispose()
    await disposeRemote()
    throw error
  }
  return async () => { await runtime.dispose(); await disposeRemote() }
}
