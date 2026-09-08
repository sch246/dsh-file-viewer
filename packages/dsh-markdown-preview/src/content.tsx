import { useMemo } from 'react'
import Markdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'
import rehypeKatex from 'rehype-katex'
import { CodeBlock } from '@deepseek-ai/dsh-client-ui-primitives'

const frontMatterPattern = /^---\r?\n([\s\S]*?)\r?\n(?:---|\.\.\.)\r?(?:\n|$)/

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
const htmlPlugins: NonNullable<Parameters<typeof Markdown>[0]['rehypePlugins']> = [
  rehypeRaw, localDriveLinks, [rehypeSanitize, schema], [rehypeKatex, { trust: false }],
]

interface TreeNode { type: string; value?: string; tagName?: string; properties?: Record<string, unknown>; children?: TreeNode[] }
// Encode the drive colon so sanitization treats it as a path, not an unknown URL scheme.
function localDriveLinks() {
  return function visit(node: TreeNode): void {
    const href = node.properties?.href
    if (node.tagName === 'a' && typeof href === 'string' && /^[a-z]:[\\/]/i.test(href)) {
      node.properties!.href = href[0] + '%3A' + href.slice(2)
    }
    for (const child of node.children ?? []) visit(child)
  }
}
function literalHtml() {
  return literalHtmlNode
}
function literalHtmlNode(node: TreeNode): void {
  if (node.type === 'raw') node.type = 'text'
  for (const child of node.children ?? []) literalHtmlNode(child)
}
const literalPlugins: typeof htmlPlugins = [literalHtml, localDriveLinks, [rehypeSanitize, schema], [rehypeKatex, { trust: false }]]

/** @param url Parsed destination. @param key URL attribute. @returns Supported external destination or document anchor. */
function previewUrl(url: string, key: string): string | undefined {
  if (/^https?:\/\//i.test(url)) return url
  if (key === 'href' && url.startsWith('#')) return `#dsh-markdown-${url.slice(1)}`
  if (key === 'href' && /^mailto:/i.test(url)) return url
  if (key === 'href' && isLocalPath(url)) return url
  return undefined
}

/** @param href Link destination. @returns Whether the destination is a local path. */
function isLocalPath(href: string): boolean {
  if (href.startsWith('//')) return false
  if (/^[a-z][a-z\d+.-]*:/i.test(href) && !/^[a-z]:[\\/]/i.test(href)) return false
  return true
}

/** @param text Markdown source. @returns Source split into optional YAML front matter and body. */
function splitFrontMatter(text: string): { metadata?: string; body: string } {
  const match = frontMatterPattern.exec(text)
  return match ? { metadata: match[1], body: text.slice(match[0].length) } : { body: text }
}

/** Render Markdown and sanitized HTML while keeping shared code highlighting and copy controls. */
export function MarkdownContent({ text, streaming, allowHtml, copyLabel, copiedLabel, footnotes, onOpenFile }: {
  readonly text: string
  readonly streaming: boolean
  readonly allowHtml: boolean
  readonly copyLabel: string
  readonly copiedLabel: string
  readonly footnotes: string
  readonly onOpenFile: (href: string) => void
}) {
  const source = useMemo(() => splitFrontMatter(text), [text])
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
      const local = href !== undefined && !href.startsWith('#') && isLocalPath(href)
      return <a {...props} href={href} onClick={local ? event => {
        event.preventDefault()
        onOpenFile(href)
      } : props.onClick} {...(href?.startsWith('#') || local ? {} : { target: '_blank', rel: 'noopener noreferrer' })}>{children}</a>
    },
    img({ node: _node, src, ...props }) {
      return <img {...props} src={src} loading="lazy" />
    },
  }), [streaming, copyLabel, copiedLabel, onOpenFile])
  return <>
    {source.metadata !== undefined && <section className="dsh-markdown-front-matter"><pre>{source.metadata}</pre></section>}
    <Markdown remarkPlugins={remarkPlugins} rehypePlugins={allowHtml ? htmlPlugins : literalPlugins}
      remarkRehypeOptions={{ footnoteLabel: footnotes }} components={components} urlTransform={previewUrl}>{source.body}</Markdown>
  </>
}
