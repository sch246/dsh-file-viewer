/** Optional TextMate grammars; the editor owns matching, themes and CodeMirror objects. */
import type { Context } from '@deepseek-ai/cordis'
import type { EditorLanguage } from '@dsh-external/dsh-file-viewer/client'

const languages: readonly EditorLanguage[] = [
  { id: 'jsx', label: 'JSX', extensions: ['jsx'], load: async () => ({ kind: 'textmate', language: 'jsx', grammars: (await import('@shikijs/langs/jsx')).default }) },
  { id: 'tsx', label: 'TSX', extensions: ['tsx'], load: async () => ({ kind: 'textmate', language: 'tsx', grammars: (await import('@shikijs/langs/tsx')).default }) },
  { id: 'markdown', label: 'Markdown', extensions: ['md', 'markdown', 'mdown'], load: async () => ({ kind: 'textmate', language: 'markdown', grammars: (await import('@shikijs/langs/markdown')).default }) },
  { id: 'javascript', label: 'JavaScript', extensions: ['js', 'mjs', 'cjs'], load: async () => ({ kind: 'textmate', language: 'javascript', grammars: (await import('@shikijs/langs/javascript')).default }) },
  { id: 'typescript', label: 'TypeScript', extensions: ['ts', 'mts', 'cts'], load: async () => ({ kind: 'textmate', language: 'typescript', grammars: (await import('@shikijs/langs/typescript')).default }) },
  { id: 'json', label: 'JSON', extensions: ['json', 'jsonc', 'map'], load: async () => ({ kind: 'textmate', language: 'jsonc', grammars: (await import('@shikijs/langs/jsonc')).default }) },
  { id: 'python', label: 'Python', extensions: ['py', 'pyw', 'pyi'], load: async () => ({ kind: 'textmate', language: 'python', grammars: (await import('@shikijs/langs/python')).default }) },
  { id: 'html', label: 'HTML', extensions: ['html', 'htm'], load: async () => ({ kind: 'textmate', language: 'html', grammars: (await import('@shikijs/langs/html')).default }) },
  { id: 'xml', label: 'XML', extensions: ['xml', 'svg', 'xsl', 'xsd'], load: async () => ({ kind: 'textmate', language: 'xml', grammars: (await import('@shikijs/langs/xml')).default }) },
  { id: 'css', label: 'CSS', extensions: ['css'], load: async () => ({ kind: 'textmate', language: 'css', grammars: (await import('@shikijs/langs/css')).default }) },
  { id: 'scss', label: 'SCSS', extensions: ['scss'], load: async () => ({ kind: 'textmate', language: 'scss', grammars: (await import('@shikijs/langs/scss')).default }) },
  { id: 'less', label: 'Less', extensions: ['less'], load: async () => ({ kind: 'textmate', language: 'less', grammars: (await import('@shikijs/langs/less')).default }) },
  { id: 'yaml', label: 'YAML', extensions: ['yaml', 'yml'], load: async () => ({ kind: 'textmate', language: 'yaml', grammars: (await import('@shikijs/langs/yaml')).default }) },
  { id: 'shell', label: 'Shell', extensions: ['sh', 'bash', 'zsh'], filenames: ['.bashrc', '.bash_profile', '.zshrc', '.profile'], load: async () => ({ kind: 'textmate', language: 'shellscript', grammars: (await import('@shikijs/langs/shellscript')).default }) },
  { id: 'c', label: 'C', extensions: ['c', 'h'], load: async () => ({ kind: 'textmate', language: 'c', grammars: (await import('@shikijs/langs/c')).default }) },
  { id: 'cpp', label: 'C++', extensions: ['cpp', 'cc', 'cxx', 'hpp', 'hh', 'hxx'], load: async () => ({ kind: 'textmate', language: 'cpp', grammars: (await import('@shikijs/langs/cpp')).default }) },
  { id: 'java', label: 'Java', extensions: ['java'], load: async () => ({ kind: 'textmate', language: 'java', grammars: (await import('@shikijs/langs/java')).default }) },
  { id: 'csharp', label: 'C#', extensions: ['cs'], load: async () => ({ kind: 'textmate', language: 'csharp', grammars: (await import('@shikijs/langs/csharp')).default }) },
  { id: 'go', label: 'Go', extensions: ['go'], load: async () => ({ kind: 'textmate', language: 'go', grammars: (await import('@shikijs/langs/go')).default }) },
  { id: 'rust', label: 'Rust', extensions: ['rs'], load: async () => ({ kind: 'textmate', language: 'rust', grammars: (await import('@shikijs/langs/rust')).default }) },
  { id: 'sql', label: 'SQL', extensions: ['sql'], load: async () => ({ kind: 'textmate', language: 'sql', grammars: (await import('@shikijs/langs/sql')).default }) },
  { id: 'toml', label: 'TOML', extensions: ['toml'], load: async () => ({ kind: 'textmate', language: 'toml', grammars: (await import('@shikijs/langs/toml')).default }) },
  { id: 'dockerfile', label: 'Dockerfile', extensions: ['dockerfile'], filenames: ['Dockerfile', 'Containerfile'], load: async () => ({ kind: 'textmate', language: 'dockerfile', grammars: (await import('@shikijs/langs/dockerfile')).default }) },
]

/** @param ctx Browser plugin context. @returns Disposal of registrations, including a pending viewer runtime. */
export function apply(ctx: Context): () => Promise<void> {
  // Viewer metadata arrives after transport starts; the browser entry must not block transport boot.
  const registration = ctx.inject(['resourceWorkbench'], scope => {
    for (const language of languages) {
      scope.effect(() => scope.resourceWorkbench.registerEditorLanguage(language))
    }
  })
  return async () => { await registration.dispose() }
}
