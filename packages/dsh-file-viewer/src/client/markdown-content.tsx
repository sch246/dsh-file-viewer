import { useMemo } from 'react'
import Markdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'
import rehypeKatex from 'rehype-katex'
import { CodeBlock } from '@deepseek-ai/dsh-client-ui-primitives'

const schema = {
  ...defaultSchema,
  clobberPrefix: 'dsh-markdown-',
  attributes: {
    ...defaultSchema.attributes,
    code: [['className', /^language-./, 'math-inline', 'math-display']],
  },
  strip: [...(defaultSchema.strip ?? []), 'style', 'iframe', 'object', 'embed'],
}
const remarkPlugins = [remarkGfm, remarkMath]
// Only the trusted math renderer may add markup after sanitization.
const rehypePlugins: NonNullable<Parameters<typeof Markdown>[0]['rehypePlugins']> = [
  rehypeRaw, [rehypeSanitize, schema], [rehypeKatex, { trust: false }],
]

/** @param url Parsed destination. @param key URL attribute. @returns Supported external destination or document anchor. */
function previewUrl(url: string, key: string): string | undefined {
  if (/^https?:\/\//i.test(url)) return url
  if (key === 'href' && url.startsWith('#')) return `#dsh-markdown-${url.slice(1)}`
  if (key === 'href' && /^mailto:/i.test(url)) return url
  return undefined
}

/** Render Markdown and sanitized HTML while keeping shared code highlighting and copy controls. */
export function MarkdownContent({ text, streaming, copyLabel, copiedLabel, footnotes }: {
  readonly text: string
  readonly streaming: boolean
  readonly copyLabel: string
  readonly copiedLabel: string
  readonly footnotes: string
}) {
  const components = useMemo<Components>(() => ({
    pre({ node, children }) {
      const code = node?.children.length === 1 ? node.children[0] : undefined
      if (code?.type !== 'element' || code.tagName !== 'code'
        || !code.children.every(child => child.type === 'text')) return <pre>{children}</pre>
      const classes = code.properties.className
      const language = Array.isArray(classes) ? classes.find(value => typeof value === 'string' && value.startsWith('language-')) : undefined
      return <CodeBlock code={code.children.map(child => child.type === 'text' ? child.value : '').join('')}
        lang={typeof language === 'string' ? language.slice(9) : undefined}
        streaming={streaming} copyLabel={copyLabel} copiedLabel={copiedLabel} />
    },
    a({ node: _node, href, children, ...props }) {
      return <a {...props} href={href} {...(href?.startsWith('#') ? {} : { target: '_blank', rel: 'noopener noreferrer' })}>{children}</a>
    },
    img({ node: _node, src, ...props }) {
      return <img {...props} src={src} loading="lazy" />
    },
  }), [streaming, copyLabel, copiedLabel])
  return <Markdown remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins}
    remarkRehypeOptions={{ footnoteLabel: footnotes }} components={components} urlTransform={previewUrl}>{text}</Markdown>
}
