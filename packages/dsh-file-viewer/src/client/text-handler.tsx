import type { ResourceHandlerProps } from './resource.ts'
import { FileViewerPanel } from './FileViewerPanel.tsx'
import type { FileViewerEditorModule } from './editor-module.ts'

/** Dependencies captured by the lazy text handler module. */
export interface TextResourceHandlerDependencies {
  readonly loadEditor: () => Promise<FileViewerEditorModule>
  readonly confirm: (message: string) => boolean
  readonly t: (key: import('./locales.ts').FileViewerLocaleKey) => string
}

/** @param dependencies Editor loader, confirmations and locale text. @returns Shared-document text renderer. */
export function createTextResourceView(dependencies: TextResourceHandlerDependencies) {
  /** Render one view over its shared text document. */
  return function TextResourceView({ viewId, handlerId, service }: ResourceHandlerProps) {
    return (
      <FileViewerPanel
        instanceId={viewId}
        snapshot={() => service.textSnapshot(viewId)}
        subscribe={(_id, listener) => service.subscribeText(viewId, listener)}
        edit={(_id, text) => { service.editText(viewId, text) }}
        save={() => { void service.saveText(viewId) }}
        confirmLoad={() => { void service.confirmTextLoad(viewId) }}
        refresh={() => { void service.refreshText(viewId) }}
        overwriteSource={() => { void service.overwriteSourceText(viewId) }}
        discardLocal={() => { service.discardLocalText(viewId) }}
        setAutoUpdate={(_id, enabled) => { service.setTextAutomation(viewId, 'autoUpdate', enabled) }}
        setAutoSave={(_id, enabled) => { service.setTextAutomation(viewId, 'autoSave', enabled) }}
        automationDefaults={() => service.automationDefaults()}
        subscribeAutomationDefaults={listener => service.subscribeAutomationDefaults(listener)}
        setGlobalAutoUpdate={enabled => { service.setGlobalAutomation('autoUpdate', enabled) }}
        setGlobalAutoSave={enabled => { service.setGlobalAutomation('autoSave', enabled) }}
        confirm={dependencies.confirm}
        loadEditor={dependencies.loadEditor}
        getViewState={() => service.getViewState(viewId, handlerId)}
        setViewState={(_id, state) => { service.setViewState(viewId, handlerId, state) }}
        t={dependencies.t}
      />
    )
  }
}
