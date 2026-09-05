import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-modules/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@dsh-external/dsh-right-sidebar/client'
import type { FileViewerClientService } from './contract.ts'
import { asFileViewerEditorModule } from './editor-module.ts'
import {
  createFileViewerClientService,
  createFileViewerInstanceHost,
  FILE_VIEWER_VIEW_ID,
} from './face.ts'
import { FileViewerPanel, type FileViewerPanelInjected } from './FileViewerPanel.tsx'
import { en, NS, zh } from './locales.ts'
import { FileViewerService } from './service.ts'
import { FILE_VIEWER_CSS } from './styles.ts'

export type { FileViewerClientService } from './contract.ts'
export type {
  FileViewerAutomationPreferences,
  FileViewerDocumentRef,
  FileViewerFailure,
  FileViewerErrorCode,
  FileViewerInstanceSnapshot,
  FileViewerLoadedText,
  FileViewerLocation,
  FileViewerOperation,
  FileViewerSavedText,
  FileViewerSource,
  FileViewerSyncStatus,
  FileViewerWatchEvent,
} from './service.ts'
export { FileViewerOpenError, FileViewerSourceId } from './service.ts'

/** Client services required to present source-neutral text editor instances. */
export const inject = ['slots', 'locale', 'modules', 'rightSidebar']

async function registerRuntime(ctx: Context): Promise<() => void> {
  const t = ctx.locale.bind(NS)
  const runtime = new FileViewerService({
    host: createFileViewerInstanceHost(ctx.rightSidebar),
    confirmDiscard: () => window.confirm(t('confirmClose')),
  })
  const face: FileViewerClientService = createFileViewerClientService(runtime, ctx.rightSidebar)
  ctx.provide('fileViewer', face)
  const offPagePersistence = ctx.effect(() => {
    const flush = () => { runtime.flushDrafts() }
    window.addEventListener('pagehide', flush)
    return () => { window.removeEventListener('pagehide', flush) }
  }, 'file-viewer: flush drafts before page suspension')

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

  const offPresentation = ctx.effect(() => {
    const offLocale = ctx.locale.register(NS, { zh, en })
    const style = document.createElement('style')
    style.dataset.pluginCss = '@dsh-external/dsh-file-viewer'
    style.textContent = FILE_VIEWER_CSS
    document.head.appendChild(style)
    return () => { offLocale(); style.remove() }
  }, 'file-viewer: locale and styles')

  const offView = ctx.slots.inject('rightbar.view', () => ctx.slots.register({
    name: 'rightbar.view',
    id: FILE_VIEWER_VIEW_ID,
    locale: NS,
    inject: (_sessionId: string): FileViewerPanelInjected => {
      return {
        snapshot: instanceId => face.snapshot(instanceId),
        subscribe: (instanceId, listener) => face.subscribe(instanceId, listener),
        edit: (instanceId, text) => { face.edit(instanceId, text) },
        save: instanceId => { void face.save(instanceId) },
        refresh: instanceId => { void face.refresh(instanceId) },
        overwriteSource: instanceId => { void face.overwriteSource(instanceId) },
        discardLocal: instanceId => { face.discardLocal(instanceId) },
        setAutoUpdate: (instanceId, enabled) => { face.setAutomation(instanceId, 'autoUpdate', enabled) },
        setAutoSave: (instanceId, enabled) => { face.setAutomation(instanceId, 'autoSave', enabled) },
        selectLocation: (instanceId, selection) => { void face.selectLocation(instanceId, selection) },
        openExternal: instanceId => { void face.openExternal(instanceId) },
        confirm: message => window.confirm(message),
        loadEditor,
      }
    },
  }, FileViewerPanel))

  return () => {
    offPagePersistence()
    offView()
    offPresentation()
    runtime.dispose()
  }
}

/** Register the text editor service and its one static workbench renderer. */
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
