/** Markdown preview locale namespace. */
export const MARKDOWN_NS = 'file-viewer-markdown'

/** Product copy for the preview and its Markdown primitives. */
export type MarkdownLocaleKey = 'handler' | 'localPreview' | 'copy' | 'copied' | 'footnotes'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Markdown preview copy. */
    'file-viewer-markdown': MarkdownLocaleKey
  }
}

export const markdownEn: Record<MarkdownLocaleKey, string> = {
  handler: 'Markdown preview',
  localPreview: 'Preview of local text',
  copy: 'Copy',
  copied: 'Copied',
  footnotes: 'Footnotes',
}

export const markdownZh: Record<MarkdownLocaleKey, string> = {
  handler: 'Markdown 预览',
  localPreview: '本地文本预览',
  copy: '复制',
  copied: '已复制',
  footnotes: '脚注',
}
