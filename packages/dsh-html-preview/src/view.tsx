import { useCallback, useMemo, useState, useSyncExternalStore, type ReactElement } from 'react'
import { TEXT_RESOURCE_HANDLER_ID, type ResourceHandlerProps } from '@dsh-external/dsh-file-viewer/client'
import { defaultScripts, setDefaultScripts, subscribeScriptDefault } from './script-default.ts'
import type { HtmlPreviewLocaleKey } from './locales.ts'

type Translate = (key: HtmlPreviewLocaleKey) => string
class ViewState { scripts = defaultScripts(); generation = 0 }
const BASE = '<base href="about:blank">'
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`
  const units = ['KiB', 'MiB', 'GiB', 'TiB']
  const tier = Math.min(Math.floor(Math.log2(bytes) / 10) - 1, units.length - 1)
  return `${(bytes / 1024 ** (tier + 1)).toLocaleString(undefined, { maximumFractionDigits: 2 })} ${units[tier]}`
}
/** Render the shared Local text in a sandboxed iframe. */
export function createHtmlPreviewView(t: Translate) {
  return function HtmlPreviewView({ viewId, handlerId, service }: ResourceHandlerProps): ReactElement {
    const subscribe = useCallback((listener: () => void) => service.subscribeText(viewId, listener), [service, viewId])
    const snapshot = useCallback(() => service.textSnapshot(viewId), [service, viewId])
    const [presentation] = useState(() => {
      const retained = service.getViewState(viewId, handlerId)
      const value = retained instanceof ViewState ? retained : new ViewState()
      service.setViewState(viewId, handlerId, value)
      return value
    })
    const [scripts, changeScripts] = useState(presentation.scripts)
    const [reload, setReload] = useState(presentation.generation)
    const initialScripts = useSyncExternalStore(subscribeScriptDefault, defaultScripts, defaultScripts)
    const textState = useSyncExternalStore(subscribe, snapshot, snapshot)
    const document = textState.status === 'ready' ? textState.document : undefined
    const srcDoc = useMemo(() => document === undefined ? undefined : `<!doctype html>${BASE}${document.toString()}`, [document])
    const error = textState.failure !== undefined
    return <section className="dsh-html-preview" aria-label={t('preview')}>
      {textState.loadConfirmation && <div className="dsh-html-preview-notice">{t('size')}: {formatSize(textState.loadConfirmation.sizeBytes)} <button type="button" onClick={() => { void service.confirmTextLoad(viewId) }}>{t('load')}</button></div>}
      {textState.resourceMissing && <div className="dsh-html-preview-error">{t('missing')}</div>}
      {error && <div className="dsh-html-preview-error" role="alert">{t(textState.failure?.code === 'source-unavailable' ? 'sourceUnavailable' : 'failed')}: {textState.failure?.message ?? textState.failure?.code} <button type="button" onClick={() => { void service.refreshText(viewId) }}>{t('retry')}</button></div>}
      {textState.status === 'partial' && <div className="dsh-html-preview-notice">{t('incomplete')} <button type="button" onClick={() => { void service.refreshText(viewId) }}>{t('retry')}</button></div>}
      <div className="dsh-html-preview-controls">
        <button type="button" onClick={() => { void service.open(service.snapshot(viewId).descriptor, {
          handlerId: TEXT_RESOURCE_HANDLER_ID, sideBySide: true, preview: false,
          target: { fromInstanceId: viewId, direction: 'left' },
        }) }}>{t('editBeside')}</button>
        <label><input type="checkbox" checked={scripts} onChange={event => {
          presentation.scripts = event.currentTarget.checked
          changeScripts(presentation.scripts)
        }} /> {t('enableScripts')}</label>
        <label><input type="checkbox" checked={initialScripts}
          onChange={event => { setDefaultScripts(event.currentTarget.checked) }} /> {t('defaultScripts')}</label>
        <button type="button" disabled={srcDoc === undefined} onClick={() => {
          presentation.generation += 1
          setReload(presentation.generation)
        }}>{t('reload')}</button>
      </div>
      {srcDoc !== undefined && <iframe key={`${reload}-${scripts}`} className="dsh-html-preview-frame" srcDoc={srcDoc} referrerPolicy="no-referrer" sandbox={scripts ? 'allow-scripts' : ''} title={t('preview')} />}
    </section>
  }
}
