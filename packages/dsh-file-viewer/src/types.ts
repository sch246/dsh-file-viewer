/** Host-owned resource watching and editor advisory configuration. */
export interface FileViewerMetadata {
  readonly resourcePollIntervalMs: number
  readonly largeResourcePollIntervalMs: number
  readonly hugeResourcePollIntervalMs: number
  readonly resourcePollBackoffMaxMs: number
  readonly maxDeltaBytes: number
  readonly textBlockMinBytes: number
  readonly textBlockTargetBytes: number
  readonly textBlockMaxBytes: number
  readonly largeEditCheckDelayMs: number
  readonly textReadConcurrency: number
  readonly textReadTimeoutMs: number
  readonly textReadRetries: number
  readonly textReadRetryDelayMs: number
  readonly progressiveFlushIntervalMs: number
  readonly largeFileBytes: number
  readonly hugeFileBytes: number
}

/** Shared editor appearance stored in the Host settings document's file-viewer namespace. */
export interface FileViewerEditorPreferences {
  readonly fontFamily: string
  readonly fontSize: number
  /** auto, a supplied theme id, or a Host theme file path relative to the settings document. */
  readonly theme: string
}

/** A partial appearance change; omitted fields retain their current shared values. */
export interface FileViewerEditorSettingsUpdate {
  readonly fontFamily?: string
  readonly fontSize?: number
  readonly theme?: string
}

/** Uninterpreted TextMate selectors and styling for the editor's maintained theme parser. */
export interface FileViewerThemeRule {
  readonly name?: string
  readonly scope?: string | string[]
  readonly settings: Record<string, string>
}

/** Included themes merged in source order without translating TextMate scopes or font styles. */
export interface FileViewerThemeData {
  readonly name: string
  readonly type?: 'light' | 'dark'
  readonly colors: Record<string, string>
  readonly tokenColors: FileViewerThemeRule[]
}

/** One selectable bundled editor theme. Automatic appearance is locale-owned Client copy. */
export interface FileViewerThemeChoice {
  readonly id: string
  readonly label: string
}

/** Current shared appearance and its provider-owned document location. */
export interface FileViewerEditorSettingsSnapshot {
  readonly preferences: FileViewerEditorPreferences
  /** Null delegates light/dark selection to the Client. */
  readonly themeData: FileViewerThemeData | null
  readonly themeChoices: FileViewerThemeChoice[]
  /** Null when the configured provider has no local settings document. */
  readonly documentPath: string | null
}
