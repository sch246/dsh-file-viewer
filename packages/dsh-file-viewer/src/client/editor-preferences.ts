import type { FileViewerEditorAppearance } from './editor-module.ts'

/** Browser-wide text typography; existing views apply changes without losing their history. */
export interface EditorPreferences {
  readonly font: 'monospace' | 'system' | 'serif'
  readonly fontSize: number
}

const key = 'dsh:file-viewer:editor-preferences:v1'
const defaults: EditorPreferences = { font: 'monospace', fontSize: 14 }
let current: EditorPreferences | undefined
const listeners = new Set<() => void>()

/** @returns Valid browser preferences, or readable defaults when storage is unavailable. */
export function editorPreferences(): EditorPreferences {
  if (current) return current
  current = defaults
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(key) ?? 'null')
    if (typeof value === 'object' && value !== null && 'font' in value && 'fontSize' in value
      && (value.font === 'monospace' || value.font === 'system' || value.font === 'serif')
      && typeof value.fontSize === 'number' && Number.isInteger(value.fontSize) && value.fontSize >= 8 && value.fontSize <= 40) {
      current = { font: value.font, fontSize: value.fontSize }
    }
  } catch {
    // Invalid JSON and unavailable browser storage retain readable defaults.
  }
  return current
}

/** @param value Valid typography chosen by the editor controls. */
export function setEditorPreferences(value: EditorPreferences): void {
  current = value
  try { window.localStorage.setItem(key, JSON.stringify(value)) } catch {
    // Full or unavailable storage keeps the preference for this page lifetime.
  }
  for (const listener of listeners) listener()
}

/** @param listener Typography-change callback. @returns Subscription disposer. */
export function subscribeEditorPreferences(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

/** @param preferences User-selected typography. @returns CSS font configuration for both panes. */
export function editorAppearance(preferences: EditorPreferences): FileViewerEditorAppearance {
  const families = { monospace: 'ui-monospace, SFMono-Regular, Consolas, monospace', system: 'system-ui, sans-serif', serif: 'Georgia, serif' }
  return { fontFamily: families[preferences.font], fontSize: preferences.fontSize }
}
