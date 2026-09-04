import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type {
  InjectFace, PropsLocale, PropsRuntime,
} from '@deepseek-ai/dsh-client-ui-slots'
import type { FileViewerEditorModule } from './editor-module.ts'
import type { FileViewerFailure, FileViewerSessionSnapshot } from './service.ts'
import { isFileViewerDirty } from './service.ts'
import type { NS } from './locales.ts'

/** Callbacks injected for one Session-scoped Files tab occurrence. */
export interface FileViewerPanelInjected {
  snapshot(): FileViewerSessionSnapshot
  subscribe(listener: () => void): () => void
  edit(text: string): void
  save(): void
  refresh(): void
  openExternal(): void
  loadEditor(): Promise<FileViewerEditorModule>
}

/** Composed Files tab props. */
export type FileViewerPanelProps =
  & PropsRuntime<'rightbar.tab'>
  & InjectFace<FileViewerPanelInjected>
  & PropsLocale<typeof NS>

function failureKey(failure: FileViewerFailure):
  | 'sourceUnavailable'
  | 'loadFailed'
  | 'saveUnsupported'
  | 'saveFailed'
  | 'refreshDirty'
  | 'openExternalUnsupported'
  | 'externalOpenFailed' {
  switch (failure.code) {
    case 'source-unavailable': return 'sourceUnavailable'
    case 'load-failed': return 'loadFailed'
    case 'save-unsupported': return 'saveUnsupported'
    case 'save-failed': return 'saveFailed'
    case 'refresh-dirty': return 'refreshDirty'
    case 'external-open-unsupported': return 'openExternalUnsupported'
    case 'external-open-failed': return 'externalOpenFailed'
  }
}

interface EditorHostProps {
  readonly text: string
  readonly readOnly: boolean
  readonly loadEditor: () => Promise<FileViewerEditorModule>
  readonly onChange: (text: string) => void
  readonly loadingLabel: string
  readonly failureLabel: string
}

/** Own one direct CodeMirror view for exactly one ready document mount. */
export function EditorHost({
  text, readOnly, loadEditor, onChange, loadingLabel, failureLabel,
}: EditorHostProps) {
  const parentRef = useRef<HTMLDivElement>(null)
  const handleRef = useRef<ReturnType<FileViewerEditorModule['createFileViewerEditor']>>()
  const textRef = useRef(text)
  const onChangeRef = useRef(onChange)
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading')
  textRef.current = text
  onChangeRef.current = onChange

  useEffect(() => {
    let live = true
    void loadEditor().then((editor) => {
      if (!live || parentRef.current === null) return
      const handle = editor.createFileViewerEditor({
        parent: parentRef.current,
        text: textRef.current,
        readOnly,
        onChange: value => { onChangeRef.current(value) },
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

/** Render loading, failure, and ready states for the current Session document. */
export function FileViewerPanel({
  snapshot, subscribe, edit, save, refresh, openExternal, loadEditor, t,
}: FileViewerPanelProps) {
  const state = useSyncExternalStore(subscribe, snapshot, snapshot)
  if (state.status === 'idle') {
    return <div className="dsh-file-viewer-state">{t('empty')}</div>
  }
  if (state.status === 'loading') {
    return <div className="dsh-file-viewer-state" role="status">{t('loading')}</div>
  }
  if (state.status === 'failed') {
    return <div className="dsh-file-viewer-state" role="alert">{t(failureKey(state.failure))}</div>
  }

  const dirty = isFileViewerDirty(state)
  return (
    <section className="dsh-file-viewer-root">
      <header className="dsh-file-viewer-toolbar">
        <div className="dsh-file-viewer-title" title={state.title}>{state.title}</div>
        {dirty && <span className="dsh-file-viewer-dirty">{t('dirty')}</span>}
        <button
          type="button"
          onClick={save}
          disabled={!state.saveSupported || !dirty || state.saving}
          title={state.saveSupported ? t('save') : t('saveUnsupported')}
        >
          {state.saving ? t('saving') : t('save')}
        </button>
        <button
          type="button"
          onClick={refresh}
          disabled={dirty || state.saving}
          title={dirty ? t('refreshDirty') : t('refresh')}
        >
          {t('refresh')}
        </button>
        <button
          type="button"
          onClick={openExternal}
          disabled={!state.externalOpenSupported}
          title={state.externalOpenSupported ? t('openExternal') : t('openExternalUnsupported')}
        >
          {t('openExternal')}
        </button>
      </header>
      {state.failure !== undefined && (
        <div className="dsh-file-viewer-failure" role="alert">{t(failureKey(state.failure))}</div>
      )}
      <EditorHost
        key={`${state.ref.sourceId}:${state.ref.resourceId}`}
        text={state.text}
        readOnly={!state.saveSupported}
        loadEditor={loadEditor}
        onChange={edit}
        loadingLabel={t('editorLoading')}
        failureLabel={t('editorFailed')}
      />
    </section>
  )
}
