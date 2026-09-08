/** A plugin contributes a plain tokenizer, never a bundled CodeMirror Extension instance. */
export interface EditorLanguage {
  readonly id: string
  readonly label: string
  readonly extensions?: readonly string[]
  readonly filenames?: readonly string[]
  /** Resolve the language's StreamParser object only when selected by an editor. */
  readonly load: () => Promise<unknown>
}

/** Runtime-owned language contributions observed by all mounted text editors. */
export class EditorLanguageRegistry {
  private disposed = false
  private languages: readonly EditorLanguage[] = []
  private readonly listeners = new Set<() => void>()

  /** @returns Current immutable language choices. */
  readonly snapshot = (): readonly EditorLanguage[] => this.languages

  /** @param listener Choice-change callback. @returns Subscription disposer. */
  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /** @param language Plugin-owned tokenizer and filename hints. @returns Registration disposer. */
  register(language: EditorLanguage): () => void {
    if (this.disposed) throw new Error('file-viewer: editor language registry is disposed')
    if (!language.id || language.id === 'auto' || language.id === 'plain' || this.languages.some(item => item.id === language.id)) {
      throw new Error(`file-viewer: unavailable editor language id ${language.id}`)
    }
    this.languages = [...this.languages, language]
    this.notify()
    return () => {
      if (!this.languages.includes(language)) return
      this.languages = this.languages.filter(item => item !== language)
      this.notify()
    }
  }

  /** @param filename Resource filename. @returns First matching installed language, if present. */
  detect(filename: string): EditorLanguage | undefined {
    const name = filename.split(/[\\/]/).pop()!.toLowerCase()
    return this.languages.find(language => language.filenames?.some(value => value.toLowerCase() === name))
      ?? this.languages.find(language => language.extensions?.some(value => name.endsWith(`.${value.replace(/^\./, '').toLowerCase()}`)))
  }

  /** Remove contributions and update mounted editors before releasing subscriptions. */
  dispose(): void {
    this.disposed = true
    this.languages = []
    this.notify()
    this.listeners.clear()
  }

  private notify(): void {
    for (const listener of this.listeners) listener()
  }
}
