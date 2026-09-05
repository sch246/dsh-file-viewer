import type {
  FileViewerDocumentRef,
  FileViewerLoadedText,
  FileViewerSource,
  FileViewerWatchEvent,
} from '../../src/client/service.ts'
import { FileViewerSourceId } from '../../src/client/service.ts'

interface MemoryDocument {
  text: string
  title: string
  version: number
}

/** Small source implementation that external Client plugins can copy for demos and tests. */
export class MemoryFileViewerSource implements FileViewerSource {
  readonly id = FileViewerSourceId('example.memory')
  readonly supportsConditionalSave = true
  readonly documents = new Map<string, MemoryDocument>()
  readonly watchers = new Map<string, Set<(event: FileViewerWatchEvent) => void>>()

  /** Add or externally replace one memory document. */
  put(resourceId: string, text: string, title = resourceId): void {
    const previous = this.documents.get(resourceId)
    const document = { text, title, version: (previous?.version ?? 0) + 1 }
    this.documents.set(resourceId, document)
    for (const listener of this.watchers.get(resourceId) ?? []) {
      listener({ kind: 'snapshot', snapshot: this.loaded(document) })
    }
  }

  /** @inheritdoc */
  async load(ref: FileViewerDocumentRef): Promise<FileViewerLoadedText> {
    return this.loaded(this.document(ref.resourceId))
  }

  /** @inheritdoc */
  async save(ref: FileViewerDocumentRef, text: string, version: unknown): Promise<{ version: number }> {
    const current = this.document(ref.resourceId)
    if (version !== current.version) throw new Error('memory document changed')
    this.put(ref.resourceId, text, current.title)
    return { version: this.document(ref.resourceId).version }
  }

  /** @inheritdoc */
  watch(ref: FileViewerDocumentRef, listener: (event: FileViewerWatchEvent) => void): () => void {
    let listeners = this.watchers.get(ref.resourceId)
    if (listeners === undefined) {
      listeners = new Set()
      this.watchers.set(ref.resourceId, listeners)
    }
    listeners.add(listener)
    return () => {
      listeners?.delete(listener)
      if (listeners?.size === 0) this.watchers.delete(ref.resourceId)
    }
  }

  private document(resourceId: string): MemoryDocument {
    const document = this.documents.get(resourceId)
    if (document === undefined) throw new Error(`missing memory document: ${resourceId}`)
    return document
  }

  private loaded(document: MemoryDocument): FileViewerLoadedText {
    return {
      ...document,
      location: {
        label: 'Memory',
        segments: [{ label: document.title, selectionHint: document.title }],
        selectorId: 'memory-documents',
      },
    }
  }
}
