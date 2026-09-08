import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import type { EditorPreferencesModel } from './editor-preferences.ts'
import type { FileViewerLocaleKey } from './locales.ts'

/** Shared editor settings controls; local font enumeration requires an explicit user click. */
export function EditorSettings({ model, hidden, openConfiguration, t, children }: {
  readonly model: EditorPreferencesModel
  readonly hidden: boolean
  readonly openConfiguration: () => Promise<void>
  readonly t: (key: FileViewerLocaleKey) => string
  readonly children: ReactNode
}) {
  const state = useSyncExternalStore(model.subscribe, model.snapshot, model.snapshot)
  const preferences = state.settings?.preferences
  const [fontFamily, setFontFamily] = useState('')
  const [fontSize, setFontSize] = useState('')
  const [customTheme, setCustomTheme] = useState('')
  const [themeChoice, setThemeChoice] = useState('auto')
  const [fontFamilies, setFontFamilies] = useState<readonly string[]>([])
  const [fontStatus, setFontStatus] = useState<'idle' | 'loading' | 'unavailable'>('idle')
  const [opening, setOpening] = useState(false)
  const [openError, setOpenError] = useState<string>()
  const details = useRef<HTMLDetailsElement>(null)
  const listId = useId()
  useEffect(() => { if (!hidden && details.current?.open) void model.refresh() }, [hidden, model])
  const live = useRef(true)
  useEffect(() => { live.current = true; return () => { live.current = false } }, [])
  useEffect(() => { setFontFamily(preferences?.fontFamily ?? ''); setFontSize(String(preferences?.fontSize ?? '')) }, [preferences])
  useEffect(() => {
    const theme = preferences?.theme
    const custom = theme && theme !== 'auto' && !state.settings?.themeChoices.some(choice => choice.id === theme)
    setThemeChoice(custom ? 'custom' : theme ?? 'auto')
    if (custom) setCustomTheme(theme)
  }, [preferences?.theme, state.settings?.themeChoices])
  const chooseFonts = async () => {
    const browser = window as Window & { queryLocalFonts?: () => Promise<readonly { readonly family: string }[]> }
    if (!browser.queryLocalFonts) { setFontStatus('unavailable'); return }
    setFontStatus('loading')
    try {
      const fonts = await browser.queryLocalFonts()
      if (!live.current) return
      setFontFamilies([...new Set(fonts.map(font => font.family))].sort((a, b) => a.localeCompare(b)))
      setFontStatus('idle')
    } catch {
      // Browser denial and unavailable local-font access leave manual family entry usable.
      if (live.current) setFontStatus('unavailable')
    }
  }
  const applyFont = () => {
    const value = fontFamily.trim()
    if (value && value !== preferences?.fontFamily) void model.update({ fontFamily: value })
  }
  const applySize = () => {
    const value = Number(fontSize)
    if (Number.isInteger(value) && value >= 8 && value <= 40 && value !== preferences?.fontSize) void model.update({ fontSize: value })
    else setFontSize(String(preferences?.fontSize ?? ''))
  }
  return <details ref={details} className="dsh-file-viewer-editor-settings" hidden={hidden}
    onToggle={event => { if (event.currentTarget.open) void model.refresh() }}>
    <summary>{t('editorSettings')}</summary>
    <label>{t('font')}<input aria-label={t('font')} list={listId} value={fontFamily} disabled={!preferences}
      onChange={event => { setFontFamily(event.currentTarget.value) }} onBlur={applyFont}
      onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); applyFont() } }} /></label>
    <datalist id={listId}>{fontFamilies.map(family => <option key={family} value={family} />)}</datalist>
    <button type="button" disabled={fontStatus === 'loading'} onClick={() => { void chooseFonts() }}>{t('chooseLocalFonts')}</button>
    {fontStatus === 'unavailable' && <p role="status">{t('localFontsUnavailable')}</p>}
    {fontFamilies.length > 0 && <label>{t('localFonts')}<select aria-label={t('localFonts')} value=""
      onChange={event => { const family = event.currentTarget.value; if (family) { setFontFamily(family); void model.update({ fontFamily: family }) } }}>
      <option value="">{t('chooseFont')}</option>{fontFamilies.map(family => <option key={family} value={family}>{family}</option>)}
    </select></label>}
    <label>{t('fontSize')}<input type="number" aria-label={t('fontSize')} min={8} max={40} value={fontSize} disabled={!preferences}
      onChange={event => { setFontSize(event.currentTarget.value) }} onBlur={applySize}
      onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); applySize() } }} /></label>
    <label>{t('editorTheme')}<select aria-label={t('editorTheme')} value={themeChoice} disabled={!preferences}
      onChange={event => {
        setThemeChoice(event.currentTarget.value)
        if (event.currentTarget.value === 'custom') return
        void model.update({ theme: event.currentTarget.value })
      }}>
      <option value="auto">{t('themeAuto')}</option>
      {state.settings?.themeChoices.map(choice => <option key={choice.id} value={choice.id}>{choice.label}</option>)}
      <option value="custom">{t('themeCustom')}</option>
    </select></label>
    <div hidden={themeChoice !== 'custom'}>
    <label>{t('themePath')}<input aria-label={t('themePath')} value={customTheme} disabled={!preferences}
      onChange={event => { setCustomTheme(event.currentTarget.value) }} /></label>
    <button type="button" disabled={!customTheme.trim() || !preferences} onClick={() => { void model.update({ theme: customTheme.trim() }) }}>{t('applyTheme')}</button>
    </div>
    {children}
    <button type="button" disabled={opening} onClick={() => {
      setOpening(true); setOpenError(undefined)
      void Promise.resolve().then(openConfiguration).catch(error => { if (live.current) setOpenError(error instanceof Error ? error.message : String(error)) }).finally(() => { if (live.current) setOpening(false) })
    }}>{t('openEditorConfiguration')}</button>
    {state.busy && <p role="status">{t('editorSettingsSaving')}</p>}
    {openError && <p role="alert">{t('editorSettingsFailed')} {openError}</p>}
  </details>
}
