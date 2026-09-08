/** Native browser readers contributed through the same public interface as other handlers. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { ResourceHandlerId, type ResourceWorkbenchClientService } from './resource.ts'

const NS = 'file-viewer-streams'
const en = {
  pdf: 'PDF reader', audio: 'Audio player', video: 'Video player',
  loading: 'Loading…', reload: 'Reload', cancelLoad: 'Cancel loading', cancelled: 'Loading cancelled.',
  failed: 'Could not load this file.',
  unsupported: 'This browser cannot preview this format.',
  mediaFailed: 'Playback failed. The connection may have been interrupted, or the browser may not support this codec. Try reloading.',
}
/** Product copy for browser-owned document and media rendering. */
export type StreamLocaleKey = keyof typeof en
/** Native renderer family; selection remains workbench-owned. */
export type StreamKind = 'pdf' | 'audio' | 'video'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap { 'file-viewer-streams': StreamLocaleKey }
}

const zh: Record<StreamLocaleKey, string> = {
  pdf: 'PDF 阅读器', audio: '音频播放器', video: '视频播放器',
  loading: '正在加载…', reload: '重新加载', cancelLoad: '取消加载', cancelled: '已取消加载。',
  failed: '无法加载此文件。',
  unsupported: '此浏览器无法预览该格式。',
  mediaFailed: '播放失败，可能是连接中断或浏览器不支持此编码。可重新加载。',
}

const styles = `
.dsh-resource-stream{display:flex;flex:1;flex-direction:column;min-width:0;min-height:0;height:100%}
.dsh-resource-stream-actions{display:flex;justify-content:flex-end;gap:8px;padding:4px 8px;border-bottom:1px solid var(--border,#ddd)}
.dsh-resource-stream-frame{display:block;flex:1;width:100%;min-height:0;border:0;background:#525659}
.dsh-resource-stream-media{display:flex;flex:1;align-items:center;justify-content:center;min-height:0;overflow:hidden;padding:12px}
.dsh-resource-stream-media video{width:100%;height:100%;min-height:0;object-fit:contain;background:#000}
.dsh-resource-stream-media audio{width:100%;max-width:640px}
.dsh-resource-stream-error{color:var(--danger,#d32f2f);padding:12px;overflow-wrap:anywhere}
`

/** @param ctx Locale/effect owner. @param service Public workbench. @returns Disposer for the three lazy handlers and their presentation resources. */
export function registerStreamHandlers(ctx: Context, service: ResourceWorkbenchClientService): () => void {
  return ctx.effect(() => {
    const offLocale = ctx.locale.register(NS, { en, zh })
    const t = ctx.locale.bind(NS)
    const style = document.createElement('style')
    style.textContent = styles
    document.head.appendChild(style)
    const disposers = (['pdf', 'audio', 'video'] as const).map(kind => service.registerHandler({
      id: ResourceHandlerId(kind), label: () => t(kind),
      match: (descriptor, capabilities) => {
        if (!capabilities.stream) return false
        const mime = descriptor.mediaType?.toLowerCase()
        const matches = kind === 'pdf'
          ? mime === 'application/pdf' || /\.pdf$/i.test(descriptor.name)
          : mime?.startsWith(`${kind}/`) === true
        return matches ? { role: 'default' } : false
      },
      load: async () => {
        const { createStreamResourceView } = await import('./stream-handler.tsx')
        return { View: createStreamResourceView(kind, t) }
      },
    }))
    return () => { for (const dispose of disposers) dispose(); style.remove(); offLocale() }
  }, 'resource-workbench: native PDF and media handlers')
}
