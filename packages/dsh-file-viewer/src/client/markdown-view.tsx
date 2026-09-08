import { useCallback, useMemo, useSyncExternalStore } from 'react'
import { MarkdownContent } from './markdown-content.tsx'
import { formatFileSize } from './file-size.ts'
import type { FileViewerLocaleKey } from './locales.ts'
import type { MarkdownLocaleKey } from './markdown-locales.ts'
import type { ResourceHandlerProps } from './resource.ts'

/** @param t Workbench copy. @param markdown Preview copy. @returns Read-only rendering of shared Local text, including retained incomplete loads. */
export function createMarkdownResourceView(
  t: (key: FileViewerLocaleKey) => string,
  markdown: (key: MarkdownLocaleKey) => string,
) {
  /** Render shared document notifications without an independent source read. */
  return function MarkdownResourceView({ viewId, service }: ResourceHandlerProps) {
    const subscribe = useCallback((listener: () => void) => service.subscribeText(viewId, listener), [service, viewId])
    const snapshot = useCallback(() => service.textSnapshot(viewId), [service, viewId])
    const state = useSyncExternalStore(subscribe, snapshot, snapshot)
    const copyLabel = markdown('copy')
    const copiedLabel = markdown('copied')
    const footnotes = markdown('footnotes')
    const content = state.status === 'ready' ? state.document : state.status === 'partial' ? state.text : undefined
    const text = useMemo(() => content?.toString(), [content])
    const busy = state.operation !== 'idle'
    return <section className="dsh-resource-markdown" aria-label={markdown('localPreview')}>
      {state.loadConfirmation !== undefined && <div className="dsh-file-viewer-state dsh-file-viewer-load-confirmation" role="status">
        <span>{t(state.sizeTier === 'huge' ? 'hugeFilePrompt' : 'largeFilePrompt')}</span>
        <span>{t('fileSize')}: {formatFileSize(state.loadConfirmation.sizeBytes, t('bytes'))}</span>
        <button type="button" disabled={busy} onClick={() => { void service.confirmTextLoad(viewId) }}>
          {t(state.sizeTier === 'huge' ? 'continueLoading' : 'loadFile')}
        </button>
      </div>}
      {state.resourceMissing && <div className="dsh-file-viewer-notice" role="status">{t('resourceMissing')}</div>}
      {state.failure !== undefined && <div className="dsh-file-viewer-failure" role="alert">
        {t(state.failure.code === 'source-unavailable' ? 'sourceUnavailable' : state.status === 'ready' ? 'operationFailed' : 'loadFailed')}
        {state.failure.message !== undefined && <span className="dsh-file-viewer-failure-detail" title={t('failureDetail')}>{state.failure.message}</span>}
      </div>}
      {state.status === 'partial' && <div className="dsh-file-viewer-notice" role="status">
        {t(state.failure === undefined ? 'incompleteFile' : 'loadInterrupted')}
      </div>}
      <div className="dsh-resource-markdown-controls">
        {state.status === 'ready' && <span role="status">{t(state.syncStatus)}</span>}
        {state.status === 'ready' && state.automationPaused && <span>{t('automationPaused')}</span>}
        {state.activities.updating
          ? <><span role="status">{t('loading')}</span><button type="button" onClick={() => { service.cancelTextLoad(viewId) }}>{t('stopLoading')}</button></>
          : <button type="button" disabled={busy || state.loadConfirmation !== undefined} onClick={() => { void service.refreshText(viewId) }}>
            {t(state.status === 'ready' ? 'update' : 'retryLoading')}
          </button>}
      </div>
      {text !== undefined && <div className="dsh-resource-markdown-content">
        <MarkdownContent text={text} streaming={state.status === 'partial'} copyLabel={copyLabel} copiedLabel={copiedLabel} footnotes={footnotes} />
      </div>}
    </section>
  }
}
