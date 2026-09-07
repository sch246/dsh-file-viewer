import { formatFileSize } from './file-size.ts'
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
import { useSyncAge } from './sync-age.ts'
import { usePendingDots } from './pending-dots.ts'
import { defaultLineNumbers, setDefaultLineNumbers, subscribeLineNumberDefault } from './line-number-default.ts'

type EditorSnapshot = Extract<FileViewerInstanceSnapshot, { status: 'ready' | 'partial' }>

/** Presentation retained by the resource view, independently of shared document synchronization. */
class TextPresentation {
  lineNumbers = defaultLineNumbers()
  expanded = false
  differences = false
  largeDefaultsApplied = false
  constructor(public editorState?: unknown) {}
}

/** Callbacks injected for one right-sidebar editor instance. */
export interface FileViewerPanelInjected {
  snapshot(instanceId: string): FileViewerInstanceSnapshot
  subscribe(instanceId: string, listener: () => void): () => void
  edit(instanceId: string, text: string): void
  save(instanceId: string): void
  refresh(instanceId: string): void
  confirmLoad(instanceId: string): void
  cancelLoad(instanceId: string): void
  setDraftPersistence(instanceId: string, enabled: boolean): void
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
  | 'resourceMissing'
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
    'resource-missing': 'resourceMissing',
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

/** Show the source's own diagnostic text so a refused load names its actual reason. */
function FailureDetail({ failure, t }: {
  readonly failure: FileViewerFailure
  readonly t: FileViewerPanelProps['t']
}) {
  if (failure.message === undefined) return null
  return <span className="dsh-file-viewer-failure-detail" title={t('failureDetail')}>{failure.message}</span>
}

interface EditorHostProps {
  readonly text: string
  readonly appendKey?: number
  readonly textUpdate?: import('./service.ts').FileViewerTextUpdate
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
  text, appendKey, textUpdate, readOnly, comparison, lineNumbers, loadEditor, onChange, viewState, onViewStateChange, loadingLabel, failureLabel,
}: EditorHostProps) {
  const parentRef = useRef<HTMLDivElement>(null)
  const handleRef = useRef<ReturnType<FileViewerEditorModule['createFileViewerEditor']>>()
  const textRef = useRef(text)
  const readOnlyRef = useRef(readOnly)
  const appliedRef = useRef({ text, appendKey })
  const comparisonRef = useRef(comparison)
  const lineNumbersRef = useRef(lineNumbers)
  const viewStateRef = useRef(viewState)
  const onChangeRef = useRef(onChange)
  const onViewStateChangeRef = useRef(onViewStateChange)
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading')
  readOnlyRef.current = readOnly
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
        readOnly: readOnlyRef.current,
        ...(comparisonRef.current === undefined ? {} : { comparison: comparisonRef.current }),
        lineNumbers: lineNumbersRef.current,
        onChange: value => { onChangeRef.current(value) },
        viewState: viewStateRef.current,
        onViewStateChange: value => { onViewStateChangeRef.current?.(value) },
      })
      if (!live) {
        handle.destroy()
        return
      }
      appliedRef.current = { text: textRef.current, appendKey }
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
  }, [loadEditor])

  useEffect(() => {
    const handle = handleRef.current
    if (handle === undefined) return
    const previous = appliedRef.current
    const finishing = appendKey === undefined && previous.appendKey !== undefined && text.startsWith(previous.text)
    if (finishing || (appendKey !== undefined && previous.appendKey === appendKey && text.length >= previous.text.length)) {
      handle.appendText(text.slice(previous.text.length))
    } else if (textUpdate !== undefined && textUpdate.previousText === previous.text && text !== previous.text) {
      handle.applyChanges(text, textUpdate.changes)
    } else handle.setText(text)
    appliedRef.current = { text, appendKey }
  }, [text, appendKey, textUpdate])
  useEffect(() => { handleRef.current?.setReadOnly(readOnly) }, [readOnly])
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

function LoadProgress({ state, label }: { readonly state: FileViewerInstanceSnapshot; readonly label: string }) {
  const progress = state.loadProgress
  if (progress === undefined) return null
  const percent = progress.complete ? 100 : progress.totalBytes === 0 ? 0 : Math.min(99, 100 * progress.bytesRead / progress.totalBytes)
  return <div className={`dsh-file-viewer-progress${progress.complete ? ' is-complete' : ''}`}
    role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(percent)}>
    {(progress.complete || progress.receivedRanges === undefined)
      ? <div style={{ left: 0, width: `${percent}%` }} />
      : progress.receivedRanges.map(range => <div key={range.offset} style={{ left: `${100 * range.offset / progress.totalBytes}%`,
        width: `${100 * range.length / progress.totalBytes}%` }} />)}
  </div>
}

function LoadConfirmation({ state, onLoad, t }: {
  readonly state: FileViewerInstanceSnapshot
  readonly onLoad: () => void
  readonly t: FileViewerPanelProps['t']
}) {
  if (state.loadConfirmation === undefined) return null
  return <div className="dsh-file-viewer-state dsh-file-viewer-load-confirmation" role="status">
    <span>{t(state.sizeTier === 'huge' ? 'hugeFilePrompt' : 'largeFilePrompt')}</span>
    <span>{t('fileSize')}: {formatFileSize(state.loadConfirmation.sizeBytes, t('bytes'))}</span>
    <button type="button" disabled={state.operation !== 'idle'} onClick={onLoad}>{t(state.sizeTier === 'huge' ? 'continueLoading' : 'loadFile')}</button>
  </div>
}

function ReadyPanel({
  state, edit, save, refresh, confirmLoad, cancelLoad, setDraftPersistence, overwriteSource, discardLocal, setAutoUpdate, setAutoSave,
  automationDefaults, setGlobalAutoUpdate, setGlobalAutoSave, confirm, loadEditor,
  presentation, retainPresentation, onViewStateChange, t,
}: {
  readonly state: EditorSnapshot
  readonly edit: (text: string) => void
  readonly save: () => void
  readonly refresh: () => void
  readonly confirmLoad: () => void
  readonly cancelLoad: () => void
  readonly setDraftPersistence: (enabled: boolean) => void
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
  const ready = state.status === 'ready' ? state : undefined
  const [, redraw] = useState(0)
  const changePresentation = (change: Partial<TextPresentation>) => {
    Object.assign(presentation, change)
    retainPresentation()
    redraw(value => value + 1)
  }
  if (state.largeDefaultsApplied && !presentation.largeDefaultsApplied) {
    presentation.differences = false
    presentation.largeDefaultsApplied = true
  }
  const showDifferences = presentation.differences
  const comparison = useMemo(() => ready !== undefined && showDifferences ? {
    baseText: ready?.baseText ?? '',
    ...(ready?.latestSourceText === undefined ? {} : { sourceText: ready?.latestSourceText }),
    labels: { local: t('local'), source: t('source'), noDifferences: t('noDifferences') },
  } : undefined, [showDifferences, ready?.baseText, ready?.latestSourceText, t])
  const lineNumberDefault = useSyncExternalStore(subscribeLineNumberDefault, defaultLineNumbers, defaultLineNumbers)
  const controlsRef = useRef<HTMLDivElement>(null)
  const statusRef = useRef<HTMLButtonElement>(null)
  const expanded = presentation.expanded
  const { updating, saving } = state.activities
  const updateDots = usePendingDots(updating)
  const saveDots = usePendingDots(saving)
  const syncAge = useSyncAge(state.lastSyncedAt, ready !== undefined && !state.automation.autoUpdate, t)
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
  const canSave = ready?.saveSupported && dirty && !busy && state.loadConfirmation === undefined
    && (ready?.deltaSaveSupported || (ready?.syncStatus !== 'diverged' && ready?.syncStatus !== 'source-ahead'))
  const confirmOverwrite = () => {
    if (confirm(t('confirmOverwrite'))) overwriteSource()
  }
  const requestSave = ready?.conditionalSaveSupported ? save : confirmOverwrite
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
      <LoadProgress state={state} label={t('loading')} />
      {state.status === 'partial' && <div className={state.failure === undefined ? 'dsh-file-viewer-notice' : 'dsh-file-viewer-failure'}
        role={state.failure === undefined ? 'status' : 'alert'}>
        {t(state.failure === undefined ? 'incompleteFile' : 'loadInterrupted')}
        {state.operation !== 'idle'
          ? <button type="button" onClick={cancelLoad}>{t('stopLoading')}</button>
          : <button type="button" onClick={refresh}>{t('retryLoading')}</button>}
        {state.failure !== undefined && <FailureDetail failure={state.failure} t={t} />}
      </div>}
      {ready !== undefined && <>
      {state.loadProgress?.complete === false && <div className="dsh-file-viewer-notice" role="status">
        {t('incompleteFile')}
        {state.operation === 'refreshing'
          ? <button type="button" onClick={cancelLoad}>{t('stopLoading')}</button>
          : <button type="button" disabled={busy} onClick={refresh}>{t('retryLoading')}</button>}
      </div>}
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
          className={`dsh-file-viewer-status is-${state.failure !== undefined ? 'error' : ready?.syncStatus}`}
          aria-expanded={expanded} title={t('synchronization')}
          onClick={() => {
            changePresentation({ expanded: !expanded })
          }}>
          {state.sizeTier !== 'normal' && <span className="dsh-file-viewer-warning" role="img"
            aria-label={t(state.sizeTier === 'huge' ? 'hugeDocument' : 'largeDocument')} title={t(state.sizeTier === 'huge' ? 'hugeDocument' : 'largeDocument')}>!</span>}
          <span role="status">{t(ready?.syncStatus)}</span>
          {syncAge !== undefined && <span>{syncAge}</span>}
          {updating && <span className="dsh-file-viewer-activity" role="status">
            {t('updating')}<span className="dsh-file-viewer-pending-dots" aria-hidden="true">{updateDots}</span>
          </span>}
          {saving && <span className="dsh-file-viewer-activity" role="status">
            {t('saving')}<span className="dsh-file-viewer-pending-dots" aria-hidden="true">{saveDots}</span>
          </span>}
          {!ready?.saveSupported && <span> · {t('readOnly')}</span>}
        </button>
        <div className="dsh-file-viewer-toolbar">
          <PreferenceAction hidden={!expanded} label={t('update')}
            currentLabel={ready?.watchSupported ? t('autoUpdate') : t('autoUpdateUnsupported')}
            defaultLabel={t('globalAutoUpdate')} checked={state.automation.autoUpdate}
            defaultChecked={automationDefaults.autoUpdate} disabled={!ready?.watchSupported} actionDisabled={busy || state.loadConfirmation !== undefined}
            onChange={setAutoUpdate} onDefaultChange={setGlobalAutoUpdate} onAction={refresh} />
          {ready?.saveSupported && <PreferenceAction hidden={!expanded} label={t('save')}
            currentLabel={ready?.conditionalSaveSupported ? t('autoSave') : t('autoSaveUnsupported')}
            defaultLabel={t('globalAutoSave')} checked={state.automation.autoSave}
            defaultChecked={automationDefaults.autoSave} disabled={!ready?.conditionalSaveSupported} actionDisabled={!canSave}
            onChange={setAutoSave} onDefaultChange={setGlobalAutoSave} onAction={requestSave} />}
          <PreferenceAction hidden={!expanded} label={t('lineNumbers')} currentLabel={t('lineNumbers')}
            defaultLabel={t('defaultLineNumbers')} checked={presentation.lineNumbers} defaultChecked={lineNumberDefault}
            onChange={lineNumbers => { changePresentation({ lineNumbers }) }} onDefaultChange={setDefaultLineNumbers}
            onAction={() => { changePresentation({ lineNumbers: !presentation.lineNumbers }) }} />
          <label className="dsh-file-viewer-action-group" hidden={!expanded} title={t('draftPersistenceHelp')}>
            <input type="checkbox" aria-label={t('draftPersistence')} checked={state.draftPersistence}
              onChange={event => { setDraftPersistence(event.currentTarget.checked) }} />
            {t('draftPersistence')}
          </label>
          <button type="button" hidden={!expanded} aria-pressed={showDifferences}
            onClick={() => { changePresentation({ differences: !showDifferences }) }}>{t(showDifferences ? 'backToEditor' : 'differences')}</button>
        </div>
      </div>
      <LoadConfirmation state={state} onLoad={confirmLoad} t={t} />
      {ready?.manualUpdateRequired !== undefined && <div className="dsh-file-viewer-notice" role="status">
        {t(ready.manualUpdateRequired === 'conflict' ? 'deltaConflict' : 'manualUpdateRequired')}
        <button type="button" disabled={busy || state.loadConfirmation !== undefined} onClick={refresh}>{t('update')}</button>
      </div>}
      {ready?.savedWithOtherChanges && <div className="dsh-file-viewer-notice" role="status">{t('savedOtherChanges')}</div>}
      {ready?.automationPaused && state.loadConfirmation === undefined && <div className="dsh-file-viewer-notice" role="status">{t('automationPaused')}</div>}
      {ready?.sourceStale && state.loadConfirmation === undefined && <div className="dsh-file-viewer-notice" role="status">{t('sourceStale')}</div>}
      {state.failure !== undefined && <div className="dsh-file-viewer-failure" role="alert">
        {t(failureKey(state.failure))}
        <FailureDetail failure={state.failure} t={t} />
      </div>}
      {ready?.syncStatus === 'diverged' && (
        <div className="dsh-file-viewer-conflict" role="alert">
          <strong>{t('conflict')}</strong>
          <span>{t('conflictHelp')}</span>
          {ready?.saveSupported && <button type="button" onClick={confirmOverwrite} disabled={ready.deltaSaveSupported && (ready.sourceStale || ready.latestSourceText === undefined)}>{t('overwriteSource')}</button>}
          <button type="button" onClick={confirmDiscard} disabled={ready?.latestSourceText === undefined}>{t('discardLocal')}</button>
        </div>
      )}
      </>}
      <div className="dsh-file-viewer-primary-editor">
        <EditorHost
          text={state.text}
          {...(ready?.textUpdate === undefined ? {} : { textUpdate: ready.textUpdate })}
          {...(state.status === 'partial' ? { appendKey: state.streamId } : {})}
          readOnly={!ready?.saveSupported}
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
  if (state.status !== 'ready' && state.status !== 'partial') {
    if (state.status === 'confirmation-required') return <LoadConfirmation state={state}
      onLoad={() => { props.confirmLoad(props.instanceId) }} t={props.t} />
    if (state.status === 'loading') return <section className="dsh-file-viewer-root"><LoadProgress state={state} label={props.t('loading')} /><div className="dsh-file-viewer-state" role="status">{props.t('loading')}<button type="button" onClick={() => props.cancelLoad(props.instanceId)}>{props.t('stopLoading')}</button></div></section>
    return (
      <div className="dsh-file-viewer-state" role="alert">
        {state.failure === undefined ? props.t('loadFailed') : props.t(failureKey(state.failure))}
        {state.failure !== undefined && <FailureDetail failure={state.failure} t={props.t} />}
        <button type="button" onClick={() => props.refresh(props.instanceId)}>{props.t('retryLoading')}</button>
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
      confirmLoad={() => { props.confirmLoad(props.instanceId) }}
      cancelLoad={() => { props.cancelLoad(props.instanceId) }}
      setDraftPersistence={enabled => { props.setDraftPersistence(props.instanceId, enabled) }}
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
