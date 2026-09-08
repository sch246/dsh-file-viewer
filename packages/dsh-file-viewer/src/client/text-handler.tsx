import { useCallback, useSyncExternalStore } from 'react'
import type { EditorPreferencesModel } from './editor-preferences.ts'
import type { EditorLanguageRegistry } from './editor-languages.ts'
import type { ResourceHandlerProps } from './resource.ts'
import { FileViewerPanel } from './FileViewerPanel.tsx'
import type { FileViewerEditorModule } from './editor-module.ts'

/** Dependencies captured by the lazy text handler module. */
export interface TextResourceHandlerDependencies {
  readonly editorPreferences: EditorPreferencesModel
  readonly openEditorConfiguration: (viewId: string) => Promise<void>
  readonly prompt?: (message: string, defaultValue: string) => string | null
  readonly editorLanguages: EditorLanguageRegistry
  readonly loadEditor: () => Promise<FileViewerEditorModule>
  readonly confirm: (message: string) => boolean
  readonly t: (key: import('./locales.ts').FileViewerLocaleKey) => string
}

/** @param dependencies Editor loader, confirmations and locale text. @returns Shared-document text renderer. */
export function createTextResourceView(dependencies: TextResourceHandlerDependencies) {
  /** Render one view over its shared text document. */
  return function TextResourceView({ viewId, handlerId, service }: ResourceHandlerProps) {
    const snapshot = useCallback(() => service.snapshot(viewId), [service, viewId])
    const subscribe = useCallback((listener: () => void) => service.subscribe(viewId, listener), [service, viewId])
    const resource = useSyncExternalStore(subscribe, snapshot, snapshot)
    return (
      <FileViewerPanel
        instanceId={viewId}
        filename={resource.descriptor.name}
        editorPreferences={dependencies.editorPreferences}
        saveAsDefaultPath={resource.descriptor.ref.resourceId}
        saveAsSupported={resource.capabilities.textSaveAs}
        saveAs={path => service.saveTextAs(viewId, path)}
        prompt={dependencies.prompt ?? ((message, defaultValue) => window.prompt(message, defaultValue))}
        openEditorConfiguration={() => dependencies.openEditorConfiguration(viewId)}
        languageRegistry={dependencies.editorLanguages}
        snapshot={() => service.textSnapshot(viewId)}
        subscribe={(_id, listener) => service.subscribeText(viewId, listener)}
        editChanges={(_id, changes) => { service.editTextChanges(viewId, changes) }}
        save={() => { void service.saveText(viewId) }}
        cancelLoad={() => { service.cancelTextLoad(viewId) }}
        confirmLoad={() => { void service.confirmTextLoad(viewId) }}
        setDraftPersistence={(_id, enabled) => { service.setTextDraftPersistence(viewId, enabled) }}
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
