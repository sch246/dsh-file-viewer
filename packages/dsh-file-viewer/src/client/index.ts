import type { Context } from '@deepseek-ai/cordis'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-modules/client'
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'
import type { ChatFileOpenRequest } from '@deepseek-ai/dsh-client-ui-chat/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@dsh-external/dsh-right-sidebar/client'
import fileViewerRemote from '@dsh-external/dsh-file-viewer/remote'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { FileViewerClientService } from './contract.ts'
import { asFileViewerEditorModule } from './editor-module.ts'
import { createFileViewerClientService } from './face.ts'
import { FileViewerPanel, type FileViewerPanelInjected } from './FileViewerPanel.tsx'
import { en, NS, zh } from './locales.ts'
import { FileViewerService } from './service.ts'
import type { FileViewerSourceId } from './service.ts'
import { FILE_VIEWER_CSS } from './styles.ts'
import {
  createWorkspaceSource,
} from './workspace-source.ts'

export type { FileViewerClientService } from './contract.ts'
export type {
  FileViewerDocumentRef, FileViewerFailure, FileViewerLoadedText, FileViewerSavedText,
  FileViewerSessionSnapshot, FileViewerSource,
} from './service.ts'
export { FileViewerOpenError, FileViewerSourceId } from './service.ts'

function valueOf<T>(result: RemoteResult<T>): T {
  if (result.ok) return result.value
  throw result.error
}

/** Required bootstrap service; feature dependencies wait for the mounted generated namespace. */
export const inject = ['remote']

/** Build the Chat waterfall listener for the configured Host routing policy. */
export function createWorkspaceFileOpenListener(
  mode: 'preview' | 'system' | 'preview-or-system',
  sourceId: FileViewerSourceId,
  open: FileViewerClientService['open'],
): (request: ChatFileOpenRequest, next: () => Promise<void>) => Promise<void> {
  return async (request, next) => {
    if (mode === 'system') return await next()
    const ref = { sessionId: request.sessionId, sourceId, resourceId: request.path }
    if (mode === 'preview') {
      await open(ref)
      return
    }
    try {
      await open(ref)
    } catch {
      return await next()
    }
  }
}

async function registerRuntime(ctx: Context): Promise<() => void> {
  const mode = valueOf<'preview' | 'system' | 'preview-or-system'>(
    await ctx.remote.fileViewerWorkspace.openMode(),
  )
  let externalOpenSupported = false
  try {
    const capability = await ctx.remote.session.canOpenWorkspacePath()
    externalOpenSupported = capability.ok && capability.value
  } catch { /* External open capability does not gate the viewer. */ }

  const runtime = new FileViewerService()
  const face: FileViewerClientService = createFileViewerClientService(runtime, ctx.rightSidebar)
  ctx.provide('fileViewer', face)
  const workspace = createWorkspaceSource({
    workspace: ctx.remote.fileViewerWorkspace,
    session: ctx.remote.session,
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

  const offOpen = ctx.on(
    'chat/open-workspace-file',
    createWorkspaceFileOpenListener(mode, workspace.id, ref => face.open(ref)),
  )

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
    inject: (rawSessionId): FileViewerPanelInjected => ({
      snapshot: () => face.snapshot(SessionId(rawSessionId)),
      subscribe: listener => face.subscribe(SessionId(rawSessionId), listener),
      edit: text => { face.edit(SessionId(rawSessionId), text) },
      save: () => { void face.save(SessionId(rawSessionId)) },
      refresh: () => { void face.refresh(SessionId(rawSessionId)) },
      openExternal: () => { void face.openExternal(SessionId(rawSessionId)) },
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
  const disposeRemote = await ctx.remote.$mount(fileViewerRemote)
  const runtime = ctx.inject(
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
