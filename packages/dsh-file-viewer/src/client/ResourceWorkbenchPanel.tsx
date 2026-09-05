import { useEffect, useState, useSyncExternalStore } from 'react'
import type { RightbarViewOwnerProps } from '@dsh-external/dsh-right-sidebar/client'
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
  if (location === undefined || (location.label === undefined && location.segments === undefined)) return null
  const selectable = location.selectorId !== undefined
  return (
    <nav className="dsh-file-viewer-location" aria-label={label}>
      {location.label !== undefined && (
        selectable
          ? <button type="button" onClick={() => { void service.selectLocation(viewId) }}>{location.label}</button>
          : <span title={location.label}>{location.label}</span>
      )}
      {location.segments?.map((segment, index) => (
        <span className="dsh-file-viewer-location-segment" key={`${index}:${segment.label}`}>
          {index > 0 && <span aria-hidden="true">›</span>}
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
export type ResourceWorkbenchPanelProps = ResourceWorkbenchPanelInjected & RightbarViewOwnerProps & {
  readonly t: (key: import('./locales.ts').FileViewerLocaleKey) => string
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
  return <module.View viewId={viewId} handlerId={handlerId} service={service} />
}

/** @param props Resource view identity, public service and locale lookup. @returns Generic controls and selected lazy handler. */
export function ResourceWorkbenchPanel({ instanceId, service, t }: ResourceWorkbenchPanelProps) {
  const state = useSyncExternalStore(
    listener => service.subscribe(instanceId, listener),
    () => service.snapshot(instanceId),
    () => service.snapshot(instanceId),
  )
  const selected = state.handlerId ?? ''
  const associated = state.handlerId !== undefined
    && state.openWith.some(choice => choice.id === state.handlerId && choice.associated)
  const switchHandler = (handlerId: string) => {
    if (handlerId !== '') void service.switchHandler(instanceId, handlerId as ResourceHandlerId)
  }
  const toggleAssociation = () => {
    service.setAssociation(state.descriptor, associated ? undefined : state.handlerId)
  }
  return (
    <section className="dsh-resource-workbench-root">
      <header className="dsh-resource-workbench-bar">
        <ResourceLocation viewId={instanceId} service={service} label={t('location')} />
        <label>
          <span>{t('openWith')}</span>
          <select
            aria-label={t('openWith')}
            value={selected}
            onChange={event => { switchHandler(event.currentTarget.value) }}
          >
            {selected === '' && <option value="">{t('chooseHandler')}</option>}
            {state.openWith.map(choice => <option key={choice.id} value={choice.id}>{choice.label}</option>)}
          </select>
        </label>
        {state.handlerId !== undefined && (
          <label title={t('rememberHandlerHelp')}>
            <input type="checkbox" checked={associated} onChange={toggleAssociation} />
            {t('rememberHandler')}
          </label>
        )}
        {state.externalOpenSupported && (
          <button type="button" onClick={() => { void service.openExternal(instanceId) }}>{t('openExternal')}</button>
        )}
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
            key={state.handlerId}
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
