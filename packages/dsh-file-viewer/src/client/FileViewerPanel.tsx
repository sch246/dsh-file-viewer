import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { KeyboardEvent } from 'react'
import type { RightbarViewOwnerProps } from '@dsh-external/dsh-right-sidebar/client'
import type { FileViewerEditorModule } from './editor-module.ts'
import type {
  FileViewerFailure,
  FileViewerAutomationPreferences,
  FileViewerInstanceSnapshot,
} from './service.ts'
import { isFileViewerDirty } from './service.ts'
import { usePendingDots } from './pending-dots.ts'
import { defaultLineNumbers, setDefaultLineNumbers, subscribeLineNumberDefault } from './line-number-default.ts'

type ReadySnapshot = Extract<FileViewerInstanceSnapshot, { status: 'ready' }>

/** Presentation retained by the resource view, independently of shared document synchronization. */
class TextPresentation {
  lineNumbers = defaultLineNumbers()
  expanded = false
  differences = false
  constructor(public editorState?: unknown) {}
}

/** Callbacks injected for one right-sidebar editor instance. */
export interface FileViewerPanelInjected {
  snapshot(instanceId: string): FileViewerInstanceSnapshot
  subscribe(instanceId: string, listener: () => void): () => void
  edit(instanceId: string, text: string): void
  save(instanceId: string): void
  refresh(instanceId: string): void
  overwriteSource(instanceId: string): void
  discardLocal(instanceId: string): void
  setAutoUpdate(instanceId: string, enabled: boolean): void
  setAutoSave(instanceId: string, enabled: boolean): void
  automationDefaults(): FileViewerAutomationPreferences
  subscribeAutomationDefaults(listener: () => void): () => void
  setGlobalAutoUpdate(enabled: boolean): void
  setGlobalAutoSave(enabled: boolean): void
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
  readonly comparison?: Parameters<FileViewerEditorModule['createFileViewerEditor']>[0]['comparison']
  readonly lineNumbers: boolean
  readonly loadEditor: () => Promise<FileViewerEditorModule>
  readonly onChange: (text: string) => void
  readonly viewState?: unknown
  readonly onViewStateChange?: (state: unknown) => void
  readonly loadingLabel: string
  readonly failureLabel: string
}

/** Own one direct CodeMirror view for exactly one editor-instance mount. */
export function EditorHost({
  text, readOnly, comparison, lineNumbers, loadEditor, onChange, viewState, onViewStateChange, loadingLabel, failureLabel,
}: EditorHostProps) {
  const parentRef = useRef<HTMLDivElement>(null)
  const handleRef = useRef<ReturnType<FileViewerEditorModule['createFileViewerEditor']>>()
  const textRef = useRef(text)
  const comparisonRef = useRef(comparison)
  const lineNumbersRef = useRef(lineNumbers)
  const viewStateRef = useRef(viewState)
  const onChangeRef = useRef(onChange)
  const onViewStateChangeRef = useRef(onViewStateChange)
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading')
  textRef.current = text
  comparisonRef.current = comparison
  lineNumbersRef.current = lineNumbers
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
        comparison: comparisonRef.current,
        lineNumbers: lineNumbersRef.current,
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
  useEffect(() => {
    handleRef.current?.setComparison(comparison)
  }, [comparison])
  useEffect(() => { handleRef.current?.setLineNumbers(lineNumbers) }, [lineNumbers])

  return (
    <div className="dsh-file-viewer-editor-shell">
      {state === 'loading' && <div className="dsh-file-viewer-state" role="status">{loadingLabel}</div>}
      {state === 'failed' && <div className="dsh-file-viewer-state" role="alert">{failureLabel}</div>}
      <div ref={parentRef} className="dsh-file-viewer-editor" hidden={state !== 'ready'} />
    </div>
  )
}

function PreferenceAction({ label, currentLabel, defaultLabel, checked, defaultChecked, disabled, actionDisabled,
  onChange, onDefaultChange, onAction, hidden,
}: {
  readonly label: string; readonly currentLabel: string; readonly defaultLabel: string
  readonly checked: boolean; readonly defaultChecked: boolean; readonly disabled?: boolean
  readonly actionDisabled?: boolean; readonly hidden: boolean
  readonly onChange: (enabled: boolean) => void; readonly onDefaultChange: (enabled: boolean) => void
  readonly onAction: () => void
}) {
  return <div className="dsh-file-viewer-action-group" hidden={hidden}>
    <span className="dsh-file-viewer-preference-pair">
      <label className="dsh-file-viewer-default-toggle" title={defaultLabel}>
        <input type="checkbox" aria-label={defaultLabel} checked={defaultChecked}
          onChange={event => { onDefaultChange(event.currentTarget.checked) }} />
      </label>
      <label title={currentLabel}>
        <input type="checkbox" aria-label={currentLabel} checked={checked} disabled={disabled}
          onChange={event => { onChange(event.currentTarget.checked) }} />
      </label>
    </span>
    <button type="button" onClick={onAction} disabled={actionDisabled}>{label}</button>
  </div>
}

function ReadyPanel({
  state, edit, save, refresh, overwriteSource, discardLocal, setAutoUpdate, setAutoSave,
  automationDefaults, setGlobalAutoUpdate, setGlobalAutoSave, confirm, loadEditor,
  presentation, retainPresentation, onViewStateChange, t,
}: {
  readonly state: ReadySnapshot
  readonly edit: (text: string) => void
  readonly save: () => void
  readonly refresh: () => void
  readonly overwriteSource: () => void
  readonly discardLocal: () => void
  readonly setAutoUpdate: (enabled: boolean) => void
  readonly setAutoSave: (enabled: boolean) => void
  readonly automationDefaults: FileViewerAutomationPreferences
  readonly setGlobalAutoUpdate: (enabled: boolean) => void
  readonly setGlobalAutoSave: (enabled: boolean) => void
  readonly confirm: (message: string) => boolean
  readonly loadEditor: () => Promise<FileViewerEditorModule>
  readonly presentation: TextPresentation
  readonly retainPresentation: () => void
  readonly onViewStateChange?: (state: unknown) => void
  readonly t: FileViewerPanelProps['t']
}) {
  const [, redraw] = useState(0)
  const changePresentation = (change: Partial<TextPresentation>) => {
    Object.assign(presentation, change)
    retainPresentation()
    redraw(value => value + 1)
  }
  const showDifferences = presentation.differences
  const comparison = useMemo(() => showDifferences ? {
    baseText: state.baseText,
    sourceText: state.latestSourceText,
    labels: { local: t('local'), source: t('source'), noDifferences: t('noDifferences') },
  } : undefined, [showDifferences, state.baseText, state.latestSourceText, t])
  const lineNumberDefault = useSyncExternalStore(subscribeLineNumberDefault, defaultLineNumbers, defaultLineNumbers)
  const controlsRef = useRef<HTMLDivElement>(null)
  const statusRef = useRef<HTMLButtonElement>(null)
  const expanded = presentation.expanded
  const { updating, saving } = state.activities
  const updateDots = usePendingDots(updating)
  const saveDots = usePendingDots(saving)
  const collapse = () => { changePresentation({ expanded: false }) }
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (!controlsRef.current?.contains(event.target as Node)) {
        changePresentation({ expanded: false })
      }
    }
    document.addEventListener('pointerdown', outside)
    return () => { document.removeEventListener('pointerdown', outside) }
  }, [presentation, retainPresentation])
  const dirty = isFileViewerDirty(state)
  const busy = state.operation !== 'idle'
  const canSave = state.saveSupported && dirty && !busy
    && state.syncStatus !== 'diverged' && state.syncStatus !== 'source-ahead'
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
      <div className="dsh-file-viewer-float" ref={controlsRef}
        onMouseEnter={() => { changePresentation({ expanded: true }) }}
        onFocus={() => { changePresentation({ expanded: true }) }}
        onKeyDown={event => {
          if (event.key === 'Escape') {
            event.stopPropagation()
            statusRef.current?.focus()
            collapse()
          }
        }}>
        <button type="button" ref={statusRef}
          className={`dsh-file-viewer-status is-${state.failure !== undefined ? 'error' : state.syncStatus}`}
          aria-expanded={expanded} title={t('synchronization')}
          onClick={() => {
            changePresentation({ expanded: !expanded })
          }}>
          <span role="status">{t(state.syncStatus)}</span>
          {updating && <span className="dsh-file-viewer-activity" role="status">
            {t('updating')}<span className="dsh-file-viewer-pending-dots" aria-hidden="true">{updateDots}</span>
          </span>}
          {saving && <span className="dsh-file-viewer-activity" role="status">
            {t('saving')}<span className="dsh-file-viewer-pending-dots" aria-hidden="true">{saveDots}</span>
          </span>}
          {!state.saveSupported && <span> · {t('readOnly')}</span>}
        </button>
        <div className="dsh-file-viewer-toolbar">
          <PreferenceAction hidden={!expanded} label={t('update')}
            currentLabel={state.watchSupported ? t('autoUpdate') : t('autoUpdateUnsupported')}
            defaultLabel={t('globalAutoUpdate')} checked={state.automation.autoUpdate}
            defaultChecked={automationDefaults.autoUpdate} disabled={!state.watchSupported} actionDisabled={busy}
            onChange={setAutoUpdate} onDefaultChange={setGlobalAutoUpdate} onAction={refresh} />
          {state.saveSupported && <PreferenceAction hidden={!expanded} label={t('save')}
            currentLabel={state.conditionalSaveSupported ? t('autoSave') : t('autoSaveUnsupported')}
            defaultLabel={t('globalAutoSave')} checked={state.automation.autoSave}
            defaultChecked={automationDefaults.autoSave} disabled={!state.conditionalSaveSupported} actionDisabled={!canSave}
            onChange={setAutoSave} onDefaultChange={setGlobalAutoSave} onAction={requestSave} />}
          <PreferenceAction hidden={!expanded} label={t('lineNumbers')} currentLabel={t('lineNumbers')}
            defaultLabel={t('defaultLineNumbers')} checked={presentation.lineNumbers} defaultChecked={lineNumberDefault}
            onChange={lineNumbers => { changePresentation({ lineNumbers }) }} onDefaultChange={setDefaultLineNumbers}
            onAction={() => { changePresentation({ lineNumbers: !presentation.lineNumbers }) }} />
          <button type="button" hidden={!expanded} aria-pressed={showDifferences}
            onClick={() => { changePresentation({ differences: !showDifferences }) }}>{t(showDifferences ? 'backToEditor' : 'differences')}</button>
        </div>
      </div>
      {state.automationPaused && <div className="dsh-file-viewer-notice" role="status">{t('automationPaused')}</div>}
      {state.sourceStale && <div className="dsh-file-viewer-notice" role="status">{t('sourceStale')}</div>}
      {state.failure !== undefined && <div className="dsh-file-viewer-failure" role="alert">{t(failureKey(state.failure))}</div>}
      {state.syncStatus === 'diverged' && (
        <div className="dsh-file-viewer-conflict" role="alert">
          <strong>{t('conflict')}</strong>
          <span>{t('conflictHelp')}</span>
          {state.saveSupported && <button type="button" onClick={confirmOverwrite}>{t('overwriteSource')}</button>}
          <button type="button" onClick={confirmDiscard} disabled={state.latestSourceText === undefined}>{t('discardLocal')}</button>
        </div>
      )}
      <div className="dsh-file-viewer-primary-editor">
        <EditorHost
          text={state.text}
          readOnly={!state.saveSupported}
          loadEditor={loadEditor}
          onChange={edit}
          lineNumbers={presentation.lineNumbers}
          comparison={comparison}
          viewState={presentation.editorState}
          {...(onViewStateChange === undefined ? {} : { onViewStateChange })}
          loadingLabel={t('editorLoading')}
          failureLabel={t('editorFailed')}
        />
      </div>
    </section>
  )
}

/** Render loading, failure, and ready states for one editor instance. */
export function FileViewerPanel(props: FileViewerPanelProps) {
  const retained = useRef<TextPresentation>()
  if (retained.current === undefined) {
    const previous = props.getViewState?.(props.instanceId)
    retained.current = previous instanceof TextPresentation ? previous : new TextPresentation(previous)
  }
  const presentation = retained.current
  const retainPresentation = () => { props.setViewState?.(props.instanceId, presentation) }
  useEffect(retainPresentation, [props.instanceId])
  const automationDefaults = useSyncExternalStore(
    props.subscribeAutomationDefaults,
    props.automationDefaults,
    props.automationDefaults,
  )
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
      automationDefaults={automationDefaults}
      setGlobalAutoUpdate={props.setGlobalAutoUpdate}
      setGlobalAutoSave={props.setGlobalAutoSave}
      confirm={props.confirm}
      loadEditor={props.loadEditor}
      presentation={presentation}
      retainPresentation={retainPresentation}
      onViewStateChange={value => { presentation.editorState = value; retainPresentation() }}
      t={props.t}
    />
  )
}
