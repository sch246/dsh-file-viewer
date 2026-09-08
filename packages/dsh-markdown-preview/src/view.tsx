import { useCallback, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { TEXT_RESOURCE_HANDLER_ID, type ResourceHandlerProps } from '@dsh-external/dsh-file-viewer/client'
import { MarkdownContent } from './content.tsx'
import { defaultHtml, setDefaultHtml, subscribeHtmlDefault } from './html-default.ts'
import type { MarkdownLocaleKey } from './locales.ts'

class Presentation {
  html = defaultHtml()
  scrollTop = 0
  scrollLeft = 0
}

/** @param t Preview-owned translations. @returns Live shared-Local preview with independent view presentation. */
export function createMarkdownResourceView(t: (key: MarkdownLocaleKey) => string) {
  return function MarkdownResourceView({ viewId, handlerId, service }: ResourceHandlerProps) {
    const subscribe = useCallback((listener: () => void) => service.subscribeText(viewId, listener), [service, viewId])
    const snapshot = useCallback(() => service.textSnapshot(viewId), [service, viewId])
    const state = useSyncExternalStore(subscribe, snapshot, snapshot)
    const [presentation] = useState(() => {
      const retained = service.getViewState(viewId, handlerId)
      const value = retained instanceof Presentation ? retained : new Presentation()
      service.setViewState(viewId, handlerId, value)
      return value
    })
    const [html, setHtml] = useState(presentation.html)
    // Links follow the shared file dispatch so directories reach a directory handler.
    const onOpenFile = useCallback((href: string) => {
      void service.openWorkspaceLink(viewId, href)
    }, [service, viewId])
    const newHtml = useSyncExternalStore(subscribeHtmlDefault, defaultHtml, defaultHtml)
    const viewport = useRef<HTMLDivElement>(null)
    const body = useRef<HTMLDivElement>(null)
    const content = state.status === 'ready' ? state.document : state.status === 'partial' ? state.text : undefined
    const text = useMemo(() => content?.toString(), [content])
    const restoreScroll = useCallback(() => {
      const element = viewport.current
      if (!element || element.clientHeight === 0) return
      element.scrollTop = Math.min(presentation.scrollTop, Math.max(0, element.scrollHeight - element.clientHeight))
      element.scrollLeft = Math.min(presentation.scrollLeft, Math.max(0, element.scrollWidth - element.clientWidth))
      presentation.scrollTop = element.scrollTop
      presentation.scrollLeft = element.scrollLeft
    }, [presentation])
    useLayoutEffect(restoreScroll, [restoreScroll, text, html])
    useLayoutEffect(() => {
      const element = viewport.current, contents = body.current
      if (!element || !contents) return
      const observer = new ResizeObserver(restoreScroll)
      observer.observe(element)
      observer.observe(contents)
      return () => { observer.disconnect() }
    }, [restoreScroll, text !== undefined])
    const busy = state.operation !== 'idle'
    const bytes = state.loadConfirmation?.sizeBytes ?? 0
    const exponent = Math.min(3, Math.floor(Math.log2(Math.max(1, bytes)) / 10))
    const size = `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(bytes / 1024 ** exponent)} ${['B', 'KiB', 'MiB', 'GiB'][exponent]}`
    return <section className="dsh-resource-markdown" aria-label={t('localPreview')}>
      <div className="dsh-resource-markdown-controls">
        <button type="button" onClick={() => { void service.open(service.snapshot(viewId).descriptor, {
          handlerId: TEXT_RESOURCE_HANDLER_ID, sideBySide: true, preview: false,
          target: { fromInstanceId: viewId, direction: 'left' },
        }) }}>{t('editBeside')}</button>
        <label><input type="checkbox" checked={html} onChange={event => {
          presentation.html = event.currentTarget.checked
          setHtml(presentation.html)
        }} />{t('html')}</label>
        <label className="dsh-markdown-default"><input type="checkbox" checked={newHtml}
          onChange={event => { setDefaultHtml(event.currentTarget.checked) }} />{t('defaultHtml')}</label>
        {state.activities.updating
          ? <><span role="status">{t('loading')}</span><button type="button" onClick={() => { service.cancelTextLoad(viewId) }}>{t('stop')}</button></>
          : (state.status !== 'ready' || state.failure !== undefined || state.resourceMissing) &&
            <button type="button" disabled={busy || state.loadConfirmation !== undefined}
              onClick={() => { void service.refreshText(viewId) }}>{t('retry')}</button>}
      </div>
      {state.loadConfirmation !== undefined && <div role="status">
        {t('approval')} {size} <button type="button" disabled={busy} onClick={() => { void service.confirmTextLoad(viewId) }}>
          {t(state.sizeTier === 'huge' ? 'hugeLoad' : 'load')}
        </button>
      </div>}
      {state.resourceMissing && <div role="status">{t('missing')}</div>}
      {state.failure !== undefined && <div className="dsh-markdown-error" role="alert">{state.failure.message ?? state.failure.code}</div>}
      {state.status === 'partial' && <div role="status">{t('incomplete')}</div>}
      {text !== undefined && <div ref={viewport} className="dsh-resource-markdown-content" onScroll={event => {
        const element = event.currentTarget
        if (element.clientHeight === 0) return
        presentation.scrollTop = element.scrollTop
        presentation.scrollLeft = element.scrollLeft
      }}>
        <div ref={body}><MarkdownContent text={text} streaming={state.status === 'partial'} allowHtml={html}
          copyLabel={t('copy')} copiedLabel={t('copied')} footnotes={t('footnotes')}
          onOpenFile={onOpenFile} /></div>
      </div>}
    </section>
  }
}
