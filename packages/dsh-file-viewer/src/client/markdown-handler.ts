import type { FileViewerLocaleKey } from './locales.ts'
import type { MarkdownLocaleKey } from './markdown-locales.ts'
import type { ResourceHandler } from './resource.ts'
import { MARKDOWN_RESOURCE_HANDLER_ID } from './workbench.ts'

/** @param t Workbench copy. @param markdown Preview copy. @returns Lazy preview of the shared Local document; the text editor remains the default. */
export function createMarkdownResourceHandler(
  t: (key: FileViewerLocaleKey) => string,
  markdown: (key: MarkdownLocaleKey) => string,
): ResourceHandler {
  return {
    id: MARKDOWN_RESOURCE_HANDLER_ID,
    label: () => markdown('handler'),
    document: 'text',
    match: (descriptor, capabilities) => capabilities.text
      && (/\.(?:md|markdown|mdown|mkd)$/i.test(descriptor.name)
        || /^(?:text\/(?:markdown|x-markdown))$/i.test(descriptor.mediaType ?? ''))
      ? { role: 'available' }
      : false,
    load: async () => {
      const { createMarkdownResourceView } = await import('./markdown-view.tsx')
      return { View: createMarkdownResourceView(t, markdown) }
    },
  }
}
