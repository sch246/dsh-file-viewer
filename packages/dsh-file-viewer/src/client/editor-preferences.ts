import type { FileViewerEditorSettingsSnapshot, FileViewerEditorSettingsUpdate } from '../types.ts'
import type { FileViewerEditorAppearance } from './editor-module.ts'

/** Remote methods backed by the shared Harness user settings document. */
export interface EditorPreferencesGateway {
  editorSettings(): Promise<FileViewerEditorSettingsSnapshot>
  setEditorSettings(update: FileViewerEditorSettingsUpdate): Promise<FileViewerEditorSettingsSnapshot>
}

/** Observable settings, request activity and the latest settings diagnostic. */
export interface EditorPreferencesState {
  readonly settings?: FileViewerEditorSettingsSnapshot
  readonly busy: boolean
  readonly error?: string
}

/** One Client cache and ordered update queue shared by every mounted editor. */
export class EditorPreferencesModel {
  private current: EditorPreferencesState = { busy: false }
  private readonly listeners = new Set<() => void>()
  private tail = Promise.resolve()
  private reading: Promise<void> | undefined
  private pending = 0
  private disposed = false

  constructor(private readonly gateway: EditorPreferencesGateway) { window.addEventListener('focus', this.onFocus) }

  private readonly onFocus = () => { void this.refresh() }

  /** @returns Current stable settings snapshot. */
  readonly snapshot = (): EditorPreferencesState => this.current

  /** @param listener Settings-change callback. @returns Subscription disposer. */
  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /** Refresh after opening controls or returning to the browser; simultaneous requests share one read. */
  readonly refresh = (): Promise<void> => {
    if (this.reading) return this.reading
    const reading = this.enqueue(() => this.gateway.editorSettings())
    this.reading = reading
    void reading.finally(() => { if (this.reading === reading) this.reading = undefined })
    return reading
  }

  /** @param update User-selected fields to persist in the shared settings document. */
  readonly update = (update: FileViewerEditorSettingsUpdate): Promise<void> => this.enqueue(() => this.gateway.setEditorSettings(update))

  /** @param delta Font-size increment from an editor shortcut. */
  readonly changeFontSize = (delta: number): Promise<void> => this.enqueue(async () => {
    const settings = this.current.settings ?? await this.gateway.editorSettings()
    return this.gateway.setEditorSettings({ fontSize: Math.max(8, Math.min(40, settings.preferences.fontSize + delta)) })
  })

  /** Stop publishing results and release all mounted-editor subscriptions. */
  dispose(): void {
    this.disposed = true
    window.removeEventListener('focus', this.onFocus)
    this.listeners.clear()
  }

  private enqueue(operation: () => Promise<FileViewerEditorSettingsSnapshot>): Promise<void> {
    if (this.disposed) return Promise.resolve()
    this.pending += 1
    this.publish({ ...this.current, busy: true })
    const next = this.tail.then(async () => {
      if (this.disposed) return
      try {
        const result = await operation()
        const previous = this.current.settings
        const settings = JSON.stringify(result) === JSON.stringify(previous) ? previous! : {
          ...result,
          themeData: previous && JSON.stringify(result.themeData) === JSON.stringify(previous.themeData) ? previous.themeData : result.themeData,
          themeChoices: previous && JSON.stringify(result.themeChoices) === JSON.stringify(previous.themeChoices) ? previous.themeChoices : result.themeChoices,
          preferences: previous && JSON.stringify(result.preferences) === JSON.stringify(previous.preferences) ? previous.preferences : result.preferences,
        }
        this.publish({ settings, busy: this.pending > 1 })
      } catch (error) {
        this.publish({ ...this.current, busy: this.pending > 1, error: error instanceof Error ? error.message : String(error) })
      } finally {
        this.pending -= 1
      }
    })
    this.tail = next
    return next
  }

  private publish(state: EditorPreferencesState): void {
    if (this.disposed) return
    this.current = state
    for (const listener of this.listeners) listener()
  }
}

/** @param settings Shared user typography. @returns CSS font configuration with a local monospace fallback. */
export function editorAppearance(settings: FileViewerEditorSettingsSnapshot): FileViewerEditorAppearance {
  return { fontFamily: `${settings.preferences.fontFamily}, ui-monospace, SFMono-Regular, Consolas, monospace`, fontSize: settings.preferences.fontSize }
}
