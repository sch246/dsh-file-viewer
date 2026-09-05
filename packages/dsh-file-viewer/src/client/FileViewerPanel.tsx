import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { KeyboardEvent } from 'react'
import type { RightbarViewOwnerProps } from '@dsh-external/dsh-right-sidebar/client'
import type { FileViewerEditorModule } from './editor-module.ts'
import type {
  FileViewerFailure,
  FileViewerInstanceSnapshot,
} from './service.ts'
import { isFileViewerDirty } from './service.ts'

type ReadySnapshot = Extract<FileViewerInstanceSnapshot, { status: 'ready' }>

/** Callbacks injected for one right-sidebar editor instance. */
export interface FileViewerPanelInjected {
  snapshot(instanceId: string): FileViewerInstanceSnapshot
  subscribe(instanceId: string, listener: () => void): () => void
  edit(instanceId: string, text: string): void
  save(instanceId: string): void
  refresh(instanceId: string): void
  overwriteSource(instanceId: string): void
  discardLocal(instanceId: string): void
  setAutoUpdate(instanceId: string, enabled: boolean | undefined): void
  setAutoSave(instanceId: string, enabled: boolean | undefined): void
  setGlobalAutoUpdate?(enabled: boolean): void
  setGlobalAutoSave?(enabled: boolean): void
  confirm(message: string): boolean
  loadEditor(): Promise<FileViewerEditorModule>
  getViewState?(instanceId: string): unknown
  setViewState?(instanceId: string, state: unknown): void
}

/** Composed editor view props. */
export type FileViewerPanelProps = FileViewerPanelInjected & RightbarViewOwnerProps & {
  readonly t: (key: import('./locales.ts').FileViewerLocaleKey) => string
}

type FailureLocaleKey =
  | 'sourceUnavailable'
  | 'loadFailed'
  | 'saveUnsupported'
  | 'saveFailed'
  | 'saveConflict'
  | 'hashFailed'
  | 'watchFailed'
  | 'openExternalUnsupported'
  | 'externalOpenFailed'
  | 'operationFailed'

function failureKey(failure: FileViewerFailure): FailureLocaleKey {
  const keys: Record<string, FailureLocaleKey> = {
    'source-unavailable': 'sourceUnavailable',
    'load-failed': 'loadFailed',
    'save-unsupported': 'saveUnsupported',
    'save-failed': 'saveFailed',
    'save-conflict': 'saveConflict',
    'hash-failed': 'hashFailed',
    'watch-failed': 'watchFailed',
    'external-open-unsupported': 'openExternalUnsupported',
    'external-open-failed': 'externalOpenFailed',
  }
  return keys[failure.code] ?? 'operationFailed'
}

interface EditorHostProps {
  readonly text: string
  readonly readOnly: boolean
  readonly loadEditor: () => Promise<FileViewerEditorModule>
  readonly onChange: (text: string) => void
  readonly viewState?: unknown
  readonly onViewStateChange?: (state: unknown) => void
  readonly loadingLabel: string
  readonly failureLabel: string
}

/** Own one direct CodeMirror view for exactly one editor-instance mount. */
export function EditorHost({
  text, readOnly, loadEditor, onChange, viewState, onViewStateChange, loadingLabel, failureLabel,
}: EditorHostProps) {
  const parentRef = useRef<HTMLDivElement>(null)
  const handleRef = useRef<ReturnType<FileViewerEditorModule['createFileViewerEditor']>>()
  const textRef = useRef(text)
  const viewStateRef = useRef(viewState)
  const onChangeRef = useRef(onChange)
  const onViewStateChangeRef = useRef(onViewStateChange)
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading')
  textRef.current = text
  viewStateRef.current = viewState
  onChangeRef.current = onChange
  onViewStateChangeRef.current = onViewStateChange

  useEffect(() => {
    let live = true
    void loadEditor().then((editor) => {
      if (!live || parentRef.current === null) return
      const handle = editor.createFileViewerEditor({
        parent: parentRef.current,
        text: textRef.current,
        readOnly,
        onChange: value => { onChangeRef.current(value) },
        viewState: viewStateRef.current,
        onViewStateChange: value => { onViewStateChangeRef.current?.(value) },
      })
      if (!live) {
        handle.destroy()
        return
      }
      handleRef.current = handle
      setState('ready')
    }, () => {
      if (live) setState('failed')
    })
    return () => {
      live = false
      handleRef.current?.destroy()
      handleRef.current = undefined
    }
  }, [loadEditor, readOnly])

  useEffect(() => { handleRef.current?.setText(text) }, [text])

  return (
    <div className="dsh-file-viewer-editor-shell">
      {state === 'loading' && <div className="dsh-file-viewer-state" role="status">{loadingLabel}</div>}
      {state === 'failed' && <div className="dsh-file-viewer-state" role="alert">{failureLabel}</div>}
      <div ref={parentRef} className="dsh-file-viewer-editor" hidden={state !== 'ready'} />
    </div>
  )
}

function Differences({ state, t }: { readonly state: ReadySnapshot; readonly t: FileViewerPanelProps['t'] }) {
  return (
    <section className="dsh-file-viewer-differences" aria-label={t('differences')}>
      <div><strong>{t('base')}</strong><pre>{state.baseText}</pre></div>
      <div><strong>{t('local')}</strong><pre>{state.text}</pre></div>
      <div><strong>{t('source')}</strong><pre>{state.latestSourceText ?? t('sourceUnknown')}</pre></div>
    </section>
  )
}

function ReadyPanel({
  state, edit, save, refresh, overwriteSource, discardLocal, setAutoUpdate, setAutoSave,
  setGlobalAutoUpdate, setGlobalAutoSave, confirm, loadEditor,
  viewState, onViewStateChange, t,
}: {
  readonly state: ReadySnapshot
  readonly edit: (text: string) => void
  readonly save: () => void
  readonly refresh: () => void
  readonly overwriteSource: () => void
  readonly discardLocal: () => void
  readonly setAutoUpdate: (enabled: boolean | undefined) => void
  readonly setAutoSave: (enabled: boolean | undefined) => void
  readonly setGlobalAutoUpdate?: (enabled: boolean) => void
  readonly setGlobalAutoSave?: (enabled: boolean) => void
  readonly confirm: (message: string) => boolean
  readonly loadEditor: () => Promise<FileViewerEditorModule>
  readonly viewState?: unknown
  readonly onViewStateChange?: (state: unknown) => void
  readonly t: FileViewerPanelProps['t']
}) {
  const [showDifferences, setShowDifferences] = useState(false)
  const dirty = isFileViewerDirty(state)
  const busy = state.operation !== 'idle'
  const canSave = state.saveSupported && dirty && !busy
    && state.syncStatus !== 'diverged' && state.syncStatus !== 'source-ahead'
  const differencesAvailable = state.latestSourceText !== undefined
    && state.syncStatus !== 'synced'
  const confirmOverwrite = () => {
    if (confirm(t('confirmOverwrite'))) overwriteSource()
  }
  const requestSave = state.conditionalSaveSupported ? save : confirmOverwrite
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.defaultPrevented || event.altKey || (!event.ctrlKey && !event.metaKey)
      || event.key.toLowerCase() !== 's') return
    event.preventDefault()
    if (canSave) requestSave()
  }
  const confirmDiscard = () => {
    if (confirm(t('confirmDiscard'))) discardLocal()
  }

  return (
    <section className="dsh-file-viewer-root" onKeyDown={onKeyDown}>
      <header className="dsh-file-viewer-header">
        <div className="dsh-file-viewer-heading">
          {state.location === undefined && <div className="dsh-file-viewer-title" title={state.title}>{state.title}</div>}
          <span className={`dsh-file-viewer-status is-${state.syncStatus}`}>{t(state.syncStatus)}</span>
          {!state.saveSupported && <span className="dsh-file-viewer-readonly">{t('readOnly')}</span>}
          {dirty && <span className="dsh-file-viewer-dirty">{t('dirty')}</span>}
        </div>
        <div className="dsh-file-viewer-toolbar">
          <div className="dsh-file-viewer-action-group">
            <button type="button" onClick={refresh} disabled={busy}>{state.operation === 'refreshing' ? t('updating') : t('update')}</button>
            <label title={state.watchSupported ? t('autoUpdate') : t('autoUpdateUnsupported')}>
              <input
                type="checkbox"
                checked={state.automation.autoUpdate}
                disabled={!state.watchSupported}
                onChange={event => { setAutoUpdate(event.currentTarget.checked) }}
              />
              {t('automatic')}
            </label>
          </div>
          {state.saveSupported && <div className="dsh-file-viewer-action-group">
            <button type="button" onClick={requestSave} disabled={!canSave}>{state.operation === 'saving' ? t('saving') : t('save')}</button>
            <label title={state.conditionalSaveSupported ? t('autoSave') : t('autoSaveUnsupported')}>
              <input
                type="checkbox"
                checked={state.automation.autoSave}
                disabled={!state.saveSupported || !state.conditionalSaveSupported}
                onChange={event => { setAutoSave(event.currentTarget.checked) }}
              />
              {t('automatic')}
            </label>
          </div>}
        </div>
        <details className="dsh-file-viewer-defaults">
          <summary>{t('automationDefaults')}</summary>
          <label>
            <input
              type="checkbox"
              checked={state.automationInheritance.global.autoUpdate}
              onChange={event => { setGlobalAutoUpdate?.(event.currentTarget.checked) }}
            />
            {t('globalAutoUpdate')}
          </label>
          <label>
            <input
              type="checkbox"
              checked={state.automationInheritance.global.autoSave}
              onChange={event => { setGlobalAutoSave?.(event.currentTarget.checked) }}
            />
            {t('globalAutoSave')}
          </label>
          <button
            type="button"
            disabled={state.automationInheritance.resource.autoUpdate === undefined}
            onClick={() => { setAutoUpdate(undefined) }}
          >{t('resetAutoUpdate')}</button>
          <button
            type="button"
            disabled={state.automationInheritance.resource.autoSave === undefined}
            onClick={() => { setAutoSave(undefined) }}
          >{t('resetAutoSave')}</button>
        </details>
      </header>
      {state.automationPaused && <div className="dsh-file-viewer-notice" role="status">{t('automationPaused')}</div>}
      {state.sourceStale && <div className="dsh-file-viewer-notice" role="status">{t('sourceStale')}</div>}
      {state.failure !== undefined && <div className="dsh-file-viewer-failure" role="alert">{t(failureKey(state.failure))}</div>}
      {state.syncStatus === 'diverged' && (
        <div className="dsh-file-viewer-conflict" role="alert">
          <strong>{t('conflict')}</strong>
          <span>{t('conflictHelp')}</span>
          <button className="is-primary" type="button" onClick={() => { setShowDifferences(value => !value) }}>{t('differences')}</button>
          {state.saveSupported && <button type="button" onClick={confirmOverwrite}>{t('overwriteSource')}</button>}
          <button type="button" onClick={confirmDiscard} disabled={state.latestSourceText === undefined}>{t('discardLocal')}</button>
        </div>
      )}
      {state.syncStatus !== 'diverged' && differencesAvailable && (
        <button className="dsh-file-viewer-differences-toggle" type="button" onClick={() => { setShowDifferences(value => !value) }}>{t('differences')}</button>
      )}
      {showDifferences && differencesAvailable && <Differences state={state} t={t} />}
      <EditorHost
        text={state.text}
        readOnly={!state.saveSupported}
        loadEditor={loadEditor}
        onChange={edit}
        viewState={viewState}
        {...(onViewStateChange === undefined ? {} : { onViewStateChange })}
        loadingLabel={t('editorLoading')}
        failureLabel={t('editorFailed')}
      />
    </section>
  )
}

/** Render loading, failure, and ready states for one editor instance. */
export function FileViewerPanel(props: FileViewerPanelProps) {
  const state = useSyncExternalStore(
    listener => props.subscribe(props.instanceId, listener),
    () => props.snapshot(props.instanceId),
    () => props.snapshot(props.instanceId),
  )
  if (state.status !== 'ready') {
    if (state.status === 'loading') return <div className="dsh-file-viewer-state" role="status">{props.t('loading')}</div>
    return (
      <div className="dsh-file-viewer-state" role="alert">
        {state.failure === undefined ? props.t('loadFailed') : props.t(failureKey(state.failure))}
      </div>
    )
  }
  return (
    <ReadyPanel
      key={props.instanceId}
      state={state}
      edit={text => { props.edit(props.instanceId, text) }}
      save={() => { props.save(props.instanceId) }}
      refresh={() => { props.refresh(props.instanceId) }}
      overwriteSource={() => { props.overwriteSource(props.instanceId) }}
      discardLocal={() => { props.discardLocal(props.instanceId) }}
      setAutoUpdate={enabled => { props.setAutoUpdate(props.instanceId, enabled) }}
      setAutoSave={enabled => { props.setAutoSave(props.instanceId, enabled) }}
      {...(props.setGlobalAutoUpdate === undefined ? {} : { setGlobalAutoUpdate: props.setGlobalAutoUpdate })}
      {...(props.setGlobalAutoSave === undefined ? {} : { setGlobalAutoSave: props.setGlobalAutoSave })}
      confirm={props.confirm}
      loadEditor={props.loadEditor}
      viewState={props.getViewState?.(props.instanceId)}
      onViewStateChange={value => { props.setViewState?.(props.instanceId, value) }}
      t={props.t}
    />
  )
}
