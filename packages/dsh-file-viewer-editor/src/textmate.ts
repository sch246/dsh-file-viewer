/** TextMate scope matching feeds CodeMirror's incremental line parser and theme compartments. */
import { StreamLanguage, syntaxHighlighting, HighlightStyle } from '@codemirror/language'
import { EditorView } from '@codemirror/view'
import { Tag } from '@lezer/highlight'
import { createShikiPrimitive, normalizeTheme } from '@shikijs/primitive'
import { createOnigurumaEngine } from '@shikijs/engine-oniguruma'
import wasm from '@shikijs/engine-oniguruma/wasm-inlined'
import { EncodedTokenMetadata, INITIAL, type StateStack } from '@shikijs/vscode-textmate'
import type { LanguageRegistration, ShikiPrimitive, ThemeRegistrationAny, ThemeRegistrationResolved } from '@shikijs/types'

/** Language plugins deliver grammar data without CodeMirror runtime objects. */
export interface TextMateLanguage {
  readonly kind: 'textmate'
  readonly language: string
  readonly grammars: readonly unknown[]
}

const foregrounds = Array.from({ length: 512 }, () => Tag.define())
const backgrounds = Array.from({ length: 256 }, () => Tag.define())
const fonts = Array.from({ length: 16 }, () => Tag.define())
const tokenTable = Object.fromEntries([
  ...foregrounds.map((tag, i) => [`tmfg${i}`, tag]),
  ...backgrounds.map((tag, i) => [`tmbg${i}`, tag]),
  ...fonts.map((tag, i) => [`tmfont${i}`, tag]),
])
const defaultTheme: ThemeRegistrationAny = {
  name: 'file-viewer-default', fg: '#808080', bg: '#ffffff',
  settings: [
    { scope: ['comment'], settings: { foreground: '#808080', fontStyle: 'italic' } },
    { scope: ['string'], settings: { foreground: '#a56c36' } },
    { scope: ['constant.numeric', 'constant.language'], settings: { foreground: '#8b72c8' } },
    { scope: ['keyword', 'storage'], settings: { foreground: '#a45da5' } },
    { scope: ['entity.name.function', 'support.function'], settings: { foreground: '#487eae' } },
    { scope: ['entity.name.type', 'entity.name.tag'], settings: { foreground: '#458d80' } },
  ],
}
const normalizedThemes = new WeakMap<object, ThemeRegistrationResolved>()
let engine: ReturnType<typeof createOnigurumaEngine> | undefined

/** @param value Parsed VS Code or TextMate theme. @returns Normalized theme; absent input selects host appearance. */
export function editorTheme(value: unknown) {
  value ??= defaultTheme
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('file-viewer: theme must be a JSON object')
  const cached = normalizedThemes.get(value)
  if (cached) return cached
  const raw = value as ThemeRegistrationAny
  const normalized = normalizeTheme({ ...raw, name: 'file-viewer-custom',
    ...('settings' in raw && raw.settings ? { settings: [...raw.settings] } : {}),
    ...('tokenColors' in raw && raw.tokenColors ? { tokenColors: [...raw.tokenColors] } : {}),
  })
  normalizedThemes.set(value, normalized)
  return normalized
}

/** @param value Parsed theme, or undefined for host defaults. @returns Editor chrome colors independent of grammar selection. */
export function themeAppearance(value: unknown) {
  if (value === undefined || value === null) return []
  const theme = editorTheme(value)
  const colors = theme.colors ?? {}
  const globals: Readonly<Record<string, string | undefined>> = theme.settings.find(setting => !setting.scope)?.settings ?? {}
  const foreground = colors['editor.foreground'] ?? theme.fg
  const background = colors['editor.background'] ?? theme.bg
  const cursor = colors['editorCursor.foreground'] ?? globals.caret ?? foreground
  const selection = colors['editor.selectionBackground'] ?? globals.selection
  const inactive = colors['editor.inactiveSelectionBackground'] ?? selection
  return EditorView.theme({
    '&': { color: foreground, backgroundColor: background },
    '.cm-content': { caretColor: cursor },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: cursor },
    '.cm-gutters': { backgroundColor: colors['editorGutter.background'] ?? background,
      color: colors['editorLineNumber.foreground'] ?? foreground,
      borderRightColor: colors['editorGutter.border'] ?? colors['editorWidget.border'] ?? background },
    '.cm-activeLineGutter': { color: colors['editorLineNumber.activeForeground'] ?? foreground },
    ...(selection ? { '&.cm-focused .cm-selectionBackground, &.cm-focused .cm-content ::selection': { backgroundColor: selection } } : {}),
    ...(inactive ? { '.cm-selectionBackground, .cm-content ::selection': { backgroundColor: inactive } } : {}),
    ...(colors['editor.selectionForeground'] ? { '& .cm-content ::selection': { color: colors['editor.selectionForeground'] } } : {}),
    '.cm-panels': { backgroundColor: colors['editorWidget.background'] ?? background,
      color: colors['editorWidget.foreground'] ?? foreground },
    '.cm-textfield, .cm-button': { backgroundColor: colors['input.background'] ?? background,
      color: colors['input.foreground'] ?? foreground },
  }, { dark: theme.type === 'dark' })
}

interface LineState { stack: StateStack; tokens: Uint32Array; index: number }

/**
 * Create an independently disposable grammar registry sharing the module's WebAssembly engine.
 * @returns Registry whose compiled grammars and themes live until the editor is disposed.
 */
export async function createTextMateRegistry(): Promise<ShikiPrimitive> {
  engine ??= createOnigurumaEngine(wasm)
  return createShikiPrimitive({ engine: await engine, langs: [], themes: [] })
}

/**
 * Compile theme rules and adapt immutable TextMate line states to CodeMirror checkpoints.
 * @param registry Editor-owned grammar registry.
 * @param language Raw grammar contribution.
 * @param value Parsed theme; absent input uses host colors.
 * @returns Incremental language and resolved token styles.
 */
export function textMateExtensions(registry: ShikiPrimitive, language: TextMateLanguage, value: unknown) {
  for (const grammar of language.grammars) {
    if (!grammar || typeof grammar !== 'object' || !('scopeName' in grammar) || !('name' in grammar)) {
      throw new Error('file-viewer: TextMate language requires named grammar objects')
    }
  }
  registry.loadLanguageSync(language.grammars as LanguageRegistration[])
  const { colorMap, theme } = registry.setTheme(editorTheme(value))
  const grammar = registry.getLanguage(language.language)
  const automatic = value === undefined || value === null
  const styles = HighlightStyle.define([
    ...colorMap.flatMap((encodedColor, index) => {
      const color = theme.colorReplacements?.[encodedColor] ?? encodedColor
      return [
        ...(foregrounds[index] ? [{ tag: foregrounds[index]!, color: automatic && index === 1 ? 'inherit' : color }] : []),
        ...(backgrounds[index] ? [{ tag: backgrounds[index]!, backgroundColor: index === 2 ? 'transparent' : color }] : []),
      ]
    }),
    ...fonts.map((tag, style) => ({ tag, fontStyle: style & 1 ? 'italic' : 'normal',
      fontWeight: style & 2 ? 'bold' : 'normal',
      textDecoration: [style & 4 ? 'underline' : '', style & 8 ? 'line-through' : ''].filter(Boolean).join(' ') || 'none' })),
  ])
  const parser = StreamLanguage.define<LineState>({
    name: language.language,
    startState: () => ({ stack: INITIAL, tokens: new Uint32Array(), index: 0 }),
    copyState: state => ({ stack: state.stack, tokens: state.tokens, index: state.index }),
    blankLine: state => { state.stack = grammar.tokenizeLine2('', state.stack).ruleStack },
    token(stream, state) {
      if (stream.sol()) {
        const line = grammar.tokenizeLine2(stream.string, state.stack)
        state.stack = line.ruleStack
        state.tokens = line.tokens
        state.index = 0
      }
      while (state.index + 2 < state.tokens.length && state.tokens[state.index + 2]! <= stream.pos) state.index += 2
      const metadata = state.tokens[state.index + 1]!
      stream.pos = Math.min(stream.string.length, state.tokens[state.index + 2] ?? stream.string.length)
      return `tmfg${EncodedTokenMetadata.getForeground(metadata)} tmbg${EncodedTokenMetadata.getBackground(metadata)} tmfont${EncodedTokenMetadata.getFontStyle(metadata)}`
    },
    tokenTable,
  })
  return [parser, syntaxHighlighting(styles)]
}
