/** Browser streaming renderers; media decoding never enters the shared text document. */
import { useEffect, useRef, useState, type ReactElement } from 'react'
import type { ResourceHandlerProps, ResourceStream } from './resource.ts'
import type { StreamKind, StreamLocaleKey } from './stream-handlers.ts'

class PlaybackState {
  position = 0
  volume = 1
  muted = false
  rate = 1
  capture(media: HTMLMediaElement): void {
    if (Number.isFinite(media.currentTime)) this.position = media.currentTime
    this.volume = media.volume
    this.muted = media.muted
    this.rate = media.playbackRate
  }
}

/** @param kind Native document/media family. @param t Locale lookup. @returns Lazy renderer with abortable preparation and explicit media teardown. */
export function createStreamResourceView(kind: StreamKind, t: (key: StreamLocaleKey) => string) {
  return function StreamResourceView({ viewId, handlerId, service }: ResourceHandlerProps): ReactElement {
    const descriptor = service.snapshot(viewId).descriptor
    const [stream, setStream] = useState<ResourceStream>()
    const [failure, setFailure] = useState<string>()
    const [generation, setGeneration] = useState(0)
    const mediaRef = useRef<HTMLMediaElement | null>(null)
    const [playback] = useState(() => {
      const previous = service.getViewState(viewId, handlerId)
      const state = previous instanceof PlaybackState ? previous : new PlaybackState()
      service.setViewState(viewId, handlerId, state)
      return state
    })
    useEffect(() => {
      const controller = new AbortController()
      setStream(undefined)
      setFailure(undefined)
      void service.getStream(viewId, controller.signal).then(result => {
        if (!controller.signal.aborted) setStream(result)
      }, error => {
        if (!controller.signal.aborted) setFailure(`${t('failed')} ${error instanceof Error ? error.message : String(error)}`)
      })
      return () => { controller.abort() }
    }, [service, viewId, generation])
    useEffect(() => {
      const media = mediaRef.current
      return () => {
        if (media === null) return
        playback.capture(media)
        media.pause()
        media.removeAttribute('src')
        media.load()
      }
    }, [stream, playback])
    const supported = stream !== undefined && stream.inline && (kind === 'pdf'
      ? stream.mediaType === 'application/pdf' && navigator.pdfViewerEnabled !== false
      : stream.mediaType.startsWith(`${kind}/`))
    const restorePlayback = (media: HTMLMediaElement): void => {
      media.volume = playback.volume
      media.muted = playback.muted
      media.playbackRate = playback.rate
      if (playback.position > 0) media.currentTime = Number.isFinite(media.duration)
        ? Math.min(playback.position, media.duration) : playback.position
    }
    return <section className="dsh-resource-stream" aria-label={t(kind)}>
      <div className="dsh-resource-stream-actions">
        {stream !== undefined && <a href={stream.downloadUrl} download={descriptor.name}>{t('download')}</a>}
        <button type="button" onClick={() => { setGeneration(value => value + 1) }}>{t('reload')}</button>
      </div>
      {failure !== undefined && <div className="dsh-resource-stream-error" role="alert">{failure}</div>}
      {stream === undefined && failure === undefined && <div className="dsh-file-viewer-state" role="status">{t('loading')}</div>}
      {stream !== undefined && !supported && <div className="dsh-resource-stream-error" role="alert">{t('unsupported')}</div>}
      {supported && stream !== undefined && (kind === 'pdf'
        ? <iframe className="dsh-resource-stream-frame" src={stream.url} title={descriptor.name} referrerPolicy="no-referrer" />
        : <div className="dsh-resource-stream-media">{kind === 'video'
          ? <video ref={node => { mediaRef.current = node }} src={stream.url} controls playsInline preload="metadata" aria-label={descriptor.name}
            onLoadedMetadata={event => { restorePlayback(event.currentTarget) }}
            onError={() => { setFailure(t('mediaFailed')) }} />
          : <audio ref={node => { mediaRef.current = node }} src={stream.url} controls preload="metadata" aria-label={descriptor.name}
            onLoadedMetadata={event => { restorePlayback(event.currentTarget) }}
            onError={() => { setFailure(t('mediaFailed')) }} />
        }</div>)}
    </section>
  }
}
