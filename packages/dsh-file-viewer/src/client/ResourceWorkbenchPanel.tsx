import { formatFileSize } from './file-size.ts'
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { ResourceViewOwnerProps } from './host.ts'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { resourceViewEnvelope } from './sidebar-host.ts'
import type {
  ResourceHandlerId,
  ResourceHandlerModule,
  ResourceWorkbenchClientService,
} from './resource.ts'

function ResourceLocation({
  viewId,
  service,
  label,
}: {
  readonly viewId: string
  readonly service: ResourceWorkbenchClientService
  readonly label: string
}) {
  const location = service.snapshot(viewId).descriptor.location
  if (location === undefined || (location.label === undefined && location.segments === undefined)) {
    return <nav className="dsh-file-viewer-location" aria-label={label}>{service.snapshot(viewId).descriptor.name}</nav>
  }
  const selectable = location.selectable === true || location.selectorId !== undefined
  const segments = location.segments ?? []
  const separatorBefore = (index: number) => index > 0 && !segments[index - 1]!.label.endsWith('/') ? '/' : ''
  const text = [location.label, segments.map((segment, index) => separatorBefore(index) + segment.label).join('')]
    .filter(value => value !== undefined).join(' ')
  return (
    <nav className="dsh-file-viewer-location" aria-label={label} title={text}>
      {location.label !== undefined && (
        selectable
          ? <button type="button" onClick={() => { void service.selectLocation(viewId) }}>{location.label}</button>
          : <span title={location.label}>{location.label}</span>
      )}
      {segments.map((segment, index) => (
        <span className="dsh-file-viewer-location-segment" key={`${index}:${segment.label}`}>
          {separatorBefore(index)}
          {selectable
            ? <button type="button" onClick={() => { void service.selectLocation(viewId, segment.selectionHint) }}>{segment.label}</button>
            : <span>{segment.label}</span>}
        </span>
      ))}
    </nav>
  )
}

/** Values injected into the static resource-workbench renderer. */
export interface ResourceWorkbenchPanelInjected {
  readonly service: ResourceWorkbenchClientService
}

/** Props for one resource view occurrence. */
export type ResourceWorkbenchPanelProps = ResourceWorkbenchPanelInjected & ResourceViewOwnerProps & {
  readonly t: (key: import('./locales.ts').FileViewerLocaleKey) => string
}

/** @param props Official tab information, viewer service and localized copy. @returns One feature body without sidebar layout ownership. */
export function OfficialResourceWorkbenchPanel({ useTabInfo, service, t }: PropsRuntime<'sidebar.right.pane.tab'>
  & ResourceWorkbenchPanelInjected & Pick<ResourceWorkbenchPanelProps, 't'>) {
  const { tab } = useTabInfo()
  const { instanceId } = resourceViewEnvelope(tab.descriptor)
  return <ResourceWorkbenchPanel key={instanceId} instanceId={instanceId} service={service} t={t} />
}

function HandlerHost({
  viewId,
  service,
  loadingLabel,
  failureLabel,
}: {
  readonly viewId: string
  readonly service: ResourceWorkbenchClientService
  readonly loadingLabel: string
  readonly failureLabel: string
}) {
  const resourceKey = JSON.stringify(service.snapshot(viewId).descriptor.ref)
  const scopedService = useMemo<ResourceWorkbenchClientService>(() => ({
    ...service,
    setViewState: (id, handler, value) => {
      try {
        if (JSON.stringify(service.snapshot(id).descriptor.ref) === resourceKey) service.setViewState(id, handler, value)
      } catch { /* A closed resource view no longer accepts renderer cleanup. */ }
    },
  }), [service, resourceKey])
  const [module, setModule] = useState<ResourceHandlerModule>()
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let live = true
    setModule(undefined)
    setFailed(false)
    void service.loadHandler(viewId).then(value => {
      if (live) setModule(value)
    }, () => {
      if (live) setFailed(true)
    })
    return () => { live = false }
  }, [service, viewId, service.snapshot(viewId).handlerId])
  if (failed) return <div className="dsh-file-viewer-state" role="alert">{failureLabel}</div>
  if (module === undefined) return <div className="dsh-file-viewer-state" role="status">{loadingLabel}</div>
  const handlerId = service.snapshot(viewId).handlerId
  if (handlerId === undefined) return null
  return <module.View viewId={viewId} handlerId={handlerId} service={scopedService} />
}

/** @param props Resource view identity, public service and locale lookup. @returns Generic controls and selected lazy handler. */
export function ResourceWorkbenchPanel({ instanceId, service, t }: ResourceWorkbenchPanelProps) {
  const state = useSyncExternalStore(
    listener => service.subscribe(instanceId, listener),
    () => service.snapshot(instanceId),
    () => service.snapshot(instanceId),
  )
  const rootRef = useRef<HTMLElement>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [showMore, setShowMore] = useState(false)
  const selected = state.openWith.find(choice => choice.selected)
  const primary = state.openWith.filter(choice => choice.selected || choice.recommended)
    .sort((left, right) => Number(right.selected) - Number(left.selected))
  const other = state.openWith.filter(choice => !choice.selected && !choice.recommended)
  const choices = showMore ? [...primary, ...other] : primary
  const menuRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!menuOpen) return
    const outside = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('pointerdown', outside)
    return () => { document.removeEventListener('pointerdown', outside) }
  }, [menuOpen])
  const switchHandler = (handlerId: ResourceHandlerId) => {
    void service.switchHandler(instanceId, handlerId)
    setMenuOpen(false)
    triggerRef.current?.focus()
  }
  return (
    <section ref={rootRef} tabIndex={-1} className="dsh-resource-workbench-root">
      <header className="dsh-resource-workbench-bar">
        <ResourceLocation viewId={instanceId} service={service} label={t('location')} />
        {state.descriptor.size !== undefined && <span className="dsh-resource-file-size" title={t('fileSize')}>
          {formatFileSize(state.descriptor.size, t('bytes'))}
        </span>}
        <div className="dsh-resource-handler-picker" ref={menuRef}
          onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setMenuOpen(false) }}
          onKeyDown={event => {
            if (event.key === 'Escape') {
              event.stopPropagation()
              setMenuOpen(false)
              triggerRef.current?.focus()
            }
          }}>
          <button type="button" ref={triggerRef}
            aria-label={t('openWith')}
            aria-expanded={menuOpen}
            onClick={() => { setShowMore(false); setMenuOpen(value => !value) }}
          >
            {state.openWith.find(choice => choice.id === state.handlerId)?.label ?? t('chooseHandler')} <span aria-hidden="true">⌄</span>
          </button>
          {menuOpen && <div className="dsh-resource-handler-menu" role="group" aria-label={t('openWith')}>
            {choices.map(choice => <div className="dsh-resource-handler-row" key={choice.id}>
              <button type="button" className="dsh-resource-handler-name" aria-pressed={choice.selected}
                onClick={() => { switchHandler(choice.id) }}>{choice.label}</button>
            </div>)}
            {other.length > 0 && <button type="button" aria-expanded={showMore}
              onClick={() => { setShowMore(value => !value) }}>{t(showMore ? 'fewerHandlers' : 'moreHandlers')}</button>}
            {selected !== undefined && <div className="dsh-resource-handler-preferences">
              <label><input type="checkbox" checked={selected.resourceAssociated}
                onChange={event => { service.setAssociation(state.descriptor, event.currentTarget.checked ? selected.id : undefined, 'resource') }} />
                {t('rememberResourceHandler')}</label>
              <label><input type="checkbox" checked={selected.associated}
                onChange={event => { service.setAssociation(state.descriptor, event.currentTarget.checked ? selected.id : undefined, 'type') }} />
                {t('rememberTypeHandler')}</label>
            </div>}
            {state.externalOpenSupported && <button type="button" onClick={() => {
              void service.openExternal(instanceId)
              setMenuOpen(false)
            }}>{t('openExternal')}</button>}
          </div>}
        </div>
      </header>
      <div className="dsh-resource-workbench-content">
        {state.failure !== undefined && state.handlerStatus !== 'failed' && (
          <div className="dsh-file-viewer-failure" role="alert">{state.failure}</div>
        )}
        {state.handlerStatus === 'choice' && (
          <div className="dsh-resource-handler-choice" role="group" aria-label={t('chooseHandler')}>
            <strong>{t('chooseHandler')}</strong>
            {state.openWith.map(choice => (
              <button key={choice.id} type="button" onClick={() => { void service.switchHandler(instanceId, choice.id) }}>
                {choice.label}
              </button>
            ))}
            {state.openWith.length === 0 && <span role="alert">{t('unsupportedResource')}</span>}
          </div>
        )}
        {state.handlerStatus === 'source-unavailable' && <div className="dsh-file-viewer-state" role="alert">{t('sourceUnavailable')}</div>}
        {state.handlerStatus === 'failed' && <div className="dsh-file-viewer-state" role="alert">{state.failure ?? t('handlerFailed')}</div>}
        {(state.handlerStatus === 'loading' || state.handlerStatus === 'ready') && state.handlerId !== undefined && (
          <HandlerHost
            key={JSON.stringify([state.handlerId, state.descriptor.ref])}
            viewId={instanceId}
            service={service}
            loadingLabel={t('handlerLoading')}
            failureLabel={t('handlerFailed')}
          />
        )}
      </div>
    </section>
  )
}
