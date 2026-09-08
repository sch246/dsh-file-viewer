import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { ResourceHandlerId } from '@dsh-external/dsh-file-viewer/client'
import { MARKDOWN_NS, markdownEn, markdownZh } from './locales.ts'
import { MARKDOWN_CSS } from './styles.ts'

/** Stable handler identity used by persisted Markdown views. */
export const MARKDOWN_RESOURCE_HANDLER_ID = ResourceHandlerId('markdown')

/** @param ctx Client context. @returns Deferred handler and presentation disposal. */
export function apply(ctx: Context): () => Promise<void> {
  const registration = ctx.inject(['resourceWorkbench', 'locale'], scope => {
    scope.effect(() => scope.locale.register(MARKDOWN_NS, { en: markdownEn, zh: markdownZh }))
    const t = scope.locale.bind(MARKDOWN_NS)
    scope.effect(() => {
      const style = document.createElement('style')
      style.textContent = MARKDOWN_CSS
      document.head.appendChild(style)
      return () => { style.remove() }
    })
    scope.effect(() => scope.resourceWorkbench.registerHandler({
      id: MARKDOWN_RESOURCE_HANDLER_ID, label: () => t('handler'), document: 'text',
      match: (descriptor, capabilities) => capabilities.text && (/\.(?:md|markdown|mdown|mkd)$/i.test(descriptor.name)
        || /^text\/(?:markdown|x-markdown)$/i.test(descriptor.mediaType ?? '')) ? { role: 'available' } : false,
      load: async () => ({ View: (await import('./view.tsx')).createMarkdownResourceView(t) }),
    }))
  })
  return async () => { await registration.dispose() }
}
