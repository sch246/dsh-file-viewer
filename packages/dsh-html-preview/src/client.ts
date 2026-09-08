import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { ResourceCapabilities, ResourceDescriptor, ResourceHandler, ResourceHandlerMatch } from '@dsh-external/dsh-file-viewer/client'
import { ResourceHandlerId } from '@dsh-external/dsh-file-viewer/client'
import { HTML_PREVIEW_NS, en, zh } from './locales.ts'
import { HTML_PREVIEW_CSS } from './styles.ts'

const ID = ResourceHandlerId('html-preview')
function match(descriptor: ResourceDescriptor, capabilities: ResourceCapabilities): ResourceHandlerMatch | false {
  if (!capabilities.text) return false
  return (/\.html?$/i.test(descriptor.name) || descriptor.mediaType?.toLowerCase() === 'text/html') ? { role: 'available' } : false
}
/** Install the HTML handler after the shared workbench and locale are ready. */
export function apply(ctx: Context): () => Promise<void> {
  const registration = ctx.inject(['resourceWorkbench', 'locale'], (scope) => {
    const t = scope.locale.bind(HTML_PREVIEW_NS)
    const handler: ResourceHandler = { id: ID, label: () => t('handler'), document: 'text', match, load: async () => { const { createHtmlPreviewView } = await import('./view.tsx'); return { View: createHtmlPreviewView(t) } } }
    scope.effect(() => scope.locale.register(HTML_PREVIEW_NS, { zh, en }))
    scope.effect(() => { const style = document.createElement('style'); style.textContent = HTML_PREVIEW_CSS; document.head.appendChild(style); return () => style.remove() })
    scope.effect(() => scope.resourceWorkbench.registerHandler(handler))
  })
  return async () => { await registration.dispose() }
}
