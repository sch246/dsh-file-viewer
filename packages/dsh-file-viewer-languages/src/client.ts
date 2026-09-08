/** Optional language registrations; the editor owns CodeMirror extension construction. */
import type { Context } from '@deepseek-ai/cordis'
import type { EditorLanguage } from '@dsh-external/dsh-file-viewer/client'
import type { StreamParser } from '@codemirror/language'

/** The viewer provides the registry used by this client plugin. */
export const inject = ['resourceWorkbench']

async function loadJSON(): Promise<StreamParser<unknown>> {
  const { json } = await import('@codemirror/legacy-modes/mode/javascript')
  return {
    ...json,
    token(stream, state) {
      // legacy-modes 6.5.4 emits "string property"; language 6.12.4 requires propertyName in combined tags.
      return json.token(stream, state)?.split(' ').map(tag => tag === 'property' ? 'propertyName' : tag).join(' ') ?? null
    },
  }
}

const languages: readonly EditorLanguage[] = [
  { id: 'javascript', label: 'JavaScript', extensions: ['js', 'mjs', 'cjs'], load: async () => (await import('@codemirror/legacy-modes/mode/javascript')).javascript },
  { id: 'typescript', label: 'TypeScript', extensions: ['ts', 'mts', 'cts'], load: async () => (await import('@codemirror/legacy-modes/mode/javascript')).typescript },
  { id: 'json', label: 'JSON', extensions: ['json', 'jsonc', 'map'], load: loadJSON },
  { id: 'python', label: 'Python', extensions: ['py', 'pyw', 'pyi'], load: async () => (await import('@codemirror/legacy-modes/mode/python')).python },
  { id: 'html', label: 'HTML', extensions: ['html', 'htm'], load: async () => (await import('@codemirror/legacy-modes/mode/xml')).html },
  { id: 'xml', label: 'XML', extensions: ['xml', 'svg', 'xsl', 'xsd'], load: async () => (await import('@codemirror/legacy-modes/mode/xml')).xml },
  { id: 'css', label: 'CSS', extensions: ['css'], load: async () => (await import('@codemirror/legacy-modes/mode/css')).css },
  { id: 'scss', label: 'SCSS', extensions: ['scss'], load: async () => (await import('@codemirror/legacy-modes/mode/css')).sCSS },
  { id: 'less', label: 'Less', extensions: ['less'], load: async () => (await import('@codemirror/legacy-modes/mode/css')).less },
  { id: 'yaml', label: 'YAML', extensions: ['yaml', 'yml'], load: async () => (await import('@codemirror/legacy-modes/mode/yaml')).yaml },
  { id: 'shell', label: 'Shell', extensions: ['sh', 'bash', 'zsh'], filenames: ['.bashrc', '.bash_profile', '.zshrc', '.profile'], load: async () => (await import('@codemirror/legacy-modes/mode/shell')).shell },
  { id: 'c', label: 'C', extensions: ['c', 'h'], load: async () => (await import('@codemirror/legacy-modes/mode/clike')).c },
  { id: 'cpp', label: 'C++', extensions: ['cpp', 'cc', 'cxx', 'hpp', 'hh', 'hxx'], load: async () => (await import('@codemirror/legacy-modes/mode/clike')).cpp },
  { id: 'java', label: 'Java', extensions: ['java'], load: async () => (await import('@codemirror/legacy-modes/mode/clike')).java },
  { id: 'csharp', label: 'C#', extensions: ['cs'], load: async () => (await import('@codemirror/legacy-modes/mode/clike')).csharp },
  { id: 'go', label: 'Go', extensions: ['go'], load: async () => (await import('@codemirror/legacy-modes/mode/go')).go },
  { id: 'rust', label: 'Rust', extensions: ['rs'], load: async () => (await import('@codemirror/legacy-modes/mode/rust')).rust },
  { id: 'sql', label: 'SQL', extensions: ['sql'], load: async () => (await import('@codemirror/legacy-modes/mode/sql')).standardSQL },
  { id: 'toml', label: 'TOML', extensions: ['toml'], load: async () => (await import('@codemirror/legacy-modes/mode/toml')).toml },
  { id: 'dockerfile', label: 'Dockerfile', extensions: ['dockerfile'], filenames: ['Dockerfile', 'Containerfile'], load: async () => (await import('@codemirror/legacy-modes/mode/dockerfile')).dockerFile },
]

/** @param ctx Browser context with the viewer's language registry. */
export function apply(ctx: Context): void {
  for (const language of languages) {
    ctx.effect(() => ctx.resourceWorkbench.registerEditorLanguage(language))
  }
}
