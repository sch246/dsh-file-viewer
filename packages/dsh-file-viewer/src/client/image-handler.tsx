import { useEffect, useState } from 'react'
import type { ResourceHandlerProps } from './resource.ts'

/** @param decodeFailureLabel Locale-owned image failure copy. @param loadingLabel Locale-owned loading copy. @returns Inert byte-backed image renderer. */
export function createImageResourceView(decodeFailureLabel: string, loadingLabel: string) {
  /** Render source bytes through the browser's inert image element path. */
  return function ImageResourceView({ viewId, service }: ResourceHandlerProps) {
    const descriptor = service.snapshot(viewId).descriptor
    const [url, setUrl] = useState<string>()
    const [failure, setFailure] = useState<string>()
    useEffect(() => {
      const controller = new AbortController()
      let objectUrl: string | undefined
      void service.readBytes(viewId, controller.signal).then(loaded => {
        if (controller.signal.aborted) return
        const mediaType = loaded.descriptor?.mediaType ?? descriptor.mediaType
        if (mediaType === undefined || !mediaType.toLowerCase().startsWith('image/')) {
          throw new Error('resource-workbench: image handler requires an image media type')
        }
        objectUrl = URL.createObjectURL(new Blob([loaded.bytes.slice().buffer as ArrayBuffer], { type: mediaType }))
        setUrl(objectUrl)
      }, error => {
        if (!controller.signal.aborted) setFailure(error instanceof Error ? error.message : String(error))
      }).catch(error => {
        if (!controller.signal.aborted) setFailure(error instanceof Error ? error.message : String(error))
      })
      return () => {
        controller.abort()
        if (objectUrl !== undefined) URL.revokeObjectURL(objectUrl)
      }
    }, [descriptor.mediaType, service, viewId])
    if (failure !== undefined) return <div className="dsh-file-viewer-state" role="alert">{failure}</div>
    if (url === undefined) return <div className="dsh-file-viewer-state" role="status">{loadingLabel}</div>
    return (
      <div className="dsh-resource-image-wrap">
        <img src={url} alt={descriptor.name} onError={() => { setFailure(decodeFailureLabel) }} />
      </div>
    )
  }
}
