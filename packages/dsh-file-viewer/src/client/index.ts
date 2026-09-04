import type { Context } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-modules/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@dsh-external/dsh-right-sidebar/client'
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

export type {
  FileViewerClientService,
} from './contract.ts'
export type {
  FileViewerDocumentRef, FileViewerFailure, FileViewerLoadedText, FileViewerSavedText,
  FileViewerSessionSnapshot, FileViewerSource, FileViewerSourceId,
} from './service.ts'
export { FileViewerSourceId } from './service.ts'

interface FileViewerRemoteNamespaces {
  readonly fileViewerWorkspace: FileViewerWorkspaceRemoteClient
  readonly session: SessionPathRemoteClient
}

interface SessionListSnapshot {
  readonly byId: Readonly<Record<string, { readonly cwd?: string } | undefined>>
}

interface FileViewerClientContext extends Context {
  readonly remote: FileViewerRemoteNamespaces
  readonly sessions: { readonly list: { getSnapshot(): SessionListSnapshot } }
}

/** Required Client services and generated Remote namespaces. */
export const inject = [
  'slots', 'locale', 'modules', 'sessions', 'rightSidebar', 'remote',
  'remote.fileViewerWorkspace', 'remote.session',
]

/** Register the workspace source, Files tab, locale, styles, and frozen service face. */
export async function apply(baseCtx: Context): Promise<void> {
  const ctx = baseCtx as FileViewerClientContext
  const capability = await ctx.remote.session.canOpenWorkspacePath()
  if (!capability.ok) throw capability.error

  const runtime = new FileViewerService()
  const face: FileViewerClientService = createFileViewerClientService(runtime, ctx.rightSidebar)
  ctx.provide('fileViewer', face)

  const workspace = createWorkspaceSource({
    workspace: ctx.remote.fileViewerWorkspace,
    session: ctx.remote.session,
    cwdOf: (sessionId: SessionId) => ctx.sessions.list.getSnapshot().byId[sessionId]?.cwd,
    externalOpenSupported: capability.value,
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

  ctx.effect(() => {
    const offLocale = ctx.locale.register(NS, { zh, en })
    const style = document.createElement('style')
    style.dataset.pluginCss = '@dsh-external/dsh-file-viewer'
    style.textContent = FILE_VIEWER_CSS
    document.head.appendChild(style)
    return () => {
      offLocale()
      style.remove()
    }
  }, 'file-viewer: locale and styles')

  const t = ctx.locale.bind(NS)
  ctx.slots.inject('rightbar.tab', () => ctx.slots.register({
    name: 'rightbar.tab',
    id: 'files',
    order: 0,
    label: () => t('tab'),
    locale: NS,
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

  ctx.effect(() => () => {
    unregisterWorkspace()
    runtime.dispose()
  }, 'file-viewer: dispose browser runtime')
}
