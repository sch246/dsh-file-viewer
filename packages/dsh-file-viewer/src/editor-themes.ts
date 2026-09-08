/** Host loading of VS Code JSONC and TextMate plist themes for the editor's theme parser. */
import type { Stats } from 'node:fs'
import { readFile, realpath, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, dirname, extname, isAbsolute, resolve } from 'node:path'
import { parse as parseJsonc, type ParseError } from 'jsonc-parser'
import { parse as parsePlist } from 'plist'
import { z } from 'zod'
import type { FileViewerThemeChoice, FileViewerThemeData, FileViewerThemeRule } from './types.ts'

const bundled = [
  { id: 'github-light', label: 'GitHub Light', load: () => import('@shikijs/themes/github-light') },
  { id: 'github-dark', label: 'GitHub Dark', load: () => import('@shikijs/themes/github-dark') },
  { id: 'light-plus', label: 'Light Plus', load: () => import('@shikijs/themes/light-plus') },
  { id: 'dark-plus', label: 'Dark Plus', load: () => import('@shikijs/themes/dark-plus') },
  { id: 'monokai', label: 'Monokai', load: () => import('@shikijs/themes/monokai') },
  { id: 'nord', label: 'Nord', load: () => import('@shikijs/themes/nord') },
  { id: 'solarized-light', label: 'Solarized Light', load: () => import('@shikijs/themes/solarized-light') },
  { id: 'solarized-dark', label: 'Solarized Dark', load: () => import('@shikijs/themes/solarized-dark') },
]

const ruleSchema = z.object({
  name: z.string().optional(),
  scope: z.union([z.string(), z.array(z.string())]).optional(),
  settings: z.record(z.string(), z.string()),
})
const themeSchema = z.object({
  name: z.string().optional(),
  type: z.enum(['light', 'dark']).optional(),
  include: z.string().min(1).optional(),
  colors: z.record(z.string(), z.string()).optional(),
  tokenColors: z.union([z.array(ruleSchema), z.string().min(1)]).optional(),
  settings: z.array(ruleSchema).optional(),
})
type ParsedTheme = z.infer<typeof themeSchema>

function decode(value: unknown, path: string): ParsedTheme {
  const result = themeSchema.safeParse(value)
  if (!result.success) throw new Error(`file-viewer: invalid theme fields in ${path}: ${result.error.message}`)
  if (result.data.colors === undefined && result.data.tokenColors === undefined
    && result.data.settings === undefined && result.data.include === undefined) {
    throw new Error(`file-viewer: ${path} contains no theme colors, token rules or include`)
  }
  return result.data
}

function fileIdentity(info: Stats): string {
  return `${info.dev}:${info.ino}:${info.size}:${info.mtimeMs}:${info.ctimeMs}`
}

/** Decode selected theme files once per filesystem identity; includes are rechecked on each settings read. */
export class FileViewerThemeLoader {
  private readonly builtins = new Map<string, FileViewerThemeData>()
  private readonly files = new Map<string, { identity: string; theme: ParsedTheme }>()

  /** @returns The small supplied theme catalog; custom paths remain accepted separately. */
  choices(): FileViewerThemeChoice[] {
    return bundled.map(({ id, label }) => ({ id, label }))
  }

  /** @param selection Auto, a supplied id, or a custom Host path. @param documentPath Actual provider document path for relative custom paths. @returns Raw theme rules, or null for automatic Client appearance. */
  async load(selection: string, documentPath: string | undefined): Promise<FileViewerThemeData | null> {
    if (selection === 'auto') { this.files.clear(); return null }
    const builtin = bundled.find(theme => theme.id === selection)
    if (builtin !== undefined) {
      this.files.clear()
      const cached = this.builtins.get(selection)
      if (cached !== undefined) return cached
      const theme = this.merge(decode((await builtin.load()).default, selection), selection)
      this.builtins.set(selection, theme)
      return theme
    }
    const expanded = selection.startsWith('~/') || selection.startsWith('~\\')
      ? resolve(homedir(), selection.slice(2)) : selection
    if (!isAbsolute(expanded) && documentPath === undefined) {
      throw new Error('file-viewer: a relative theme path requires a file-backed settings provider')
    }
    const path = isAbsolute(expanded) ? expanded : resolve(dirname(documentPath!), expanded)
    const used = new Set<string>()
    const theme = await this.read(path, new Set(), used)
    for (const key of this.files.keys()) if (!used.has(key)) this.files.delete(key)
    return theme
  }

  private async read(path: string, ancestors: Set<string>, used: Set<string>): Promise<FileViewerThemeData> {
    const canonical = await realpath(path)
    if (ancestors.has(canonical)) throw new Error(`file-viewer: theme include cycle at ${canonical}`)
    const chain = new Set(ancestors).add(canonical)
    used.add(canonical)
    const info = await stat(canonical)
    if (!info.isFile()) throw new Error(`file-viewer: theme is not a regular file: ${canonical}`)
    const identity = fileIdentity(info)
    let parsed = this.files.get(canonical)?.identity === identity ? this.files.get(canonical)?.theme : undefined
    if (parsed === undefined) {
      const text = await readFile(canonical, 'utf8')
      if (fileIdentity(await stat(canonical)) !== identity) throw new Error(`file-viewer: theme changed while reading ${canonical}; retry the selection`)
      let value: unknown
      if (extname(canonical).toLowerCase() === '.tmtheme' || text.trimStart().startsWith('<')) value = parsePlist(text)
      else {
        const errors: ParseError[] = []
        value = parseJsonc(text.replace(/^\uFEFF/u, ''), errors, { allowTrailingComma: true, disallowComments: false })
        if (errors.length > 0) throw new Error(`file-viewer: invalid JSONC theme ${canonical} at offset ${errors[0]!.offset}`)
      }
      parsed = decode(value, canonical)
      this.files.set(canonical, { identity, theme: parsed })
    }
    const inherited = parsed.include === undefined ? undefined : await this.read(resolve(dirname(canonical), parsed.include), chain, used)
    const tokens = typeof parsed.tokenColors === 'string'
      ? await this.read(resolve(dirname(canonical), parsed.tokenColors), chain, used)
      : undefined
    return this.merge(parsed, basename(canonical), inherited, tokens)
  }

  private rules(entries: z.infer<typeof ruleSchema>[] | undefined): FileViewerThemeRule[] {
    return (entries ?? []).map(entry => ({
      ...(entry.name === undefined ? {} : { name: entry.name }),
      ...(entry.scope === undefined ? {} : { scope: entry.scope }),
      settings: entry.settings,
    }))
  }

  private merge(theme: ParsedTheme, fallbackName: string, inherited?: FileViewerThemeData, tokens?: FileViewerThemeData): FileViewerThemeData {
    const type = theme.type ?? inherited?.type ?? tokens?.type
    return {
      name: theme.name ?? fallbackName,
      ...(type === undefined ? {} : { type }),
      colors: { ...inherited?.colors, ...tokens?.colors, ...theme.colors },
      tokenColors: [
        ...(inherited?.tokenColors ?? []),
        ...(tokens?.tokenColors ?? []),
        ...this.rules(theme.settings),
        ...this.rules(Array.isArray(theme.tokenColors) ? theme.tokenColors : undefined),
      ],
    }
  }
}
