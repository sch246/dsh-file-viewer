/** Markdown preview locale namespace. */
export const MARKDOWN_NS = 'file-viewer-markdown'
export const markdownEn = {
  editBeside: 'Edit side by side', handler: 'Markdown preview', localPreview: 'Preview of local text', copy: 'Copy', copied: 'Copied', footnotes: 'Footnotes',
  html: 'Render HTML', defaultHtml: 'Render HTML in new previews', update: 'Reload from file', load: 'Load file',
  hugeLoad: 'Continue loading', stop: 'Stop loading', retry: 'Retry loading', loading: 'Loading…',
  approval: 'Confirm loading this file:', missing: 'The source file is missing.', incomplete: 'The file is not fully loaded.',
  htmlDisabled: 'HTML tags are displayed as text.',
}
export type MarkdownLocaleKey = keyof typeof markdownEn
export const markdownZh: Record<MarkdownLocaleKey, string> = {
  editBeside: '并排编辑', handler: 'Markdown 预览', localPreview: '本地文本预览', copy: '复制', copied: '已复制', footnotes: '脚注',
  html: '渲染 HTML', defaultHtml: '新预览默认渲染 HTML', update: '重新读取文件', load: '加载文件',
  hugeLoad: '继续加载', stop: '停止加载', retry: '重新加载', loading: '正在加载…',
  approval: '确认加载此文件：', missing: '来源文件已删除。', incomplete: '文件尚未加载完整。',
  htmlDisabled: 'HTML 标签以原文显示。',
}
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap { 'file-viewer-markdown': MarkdownLocaleKey }
}
