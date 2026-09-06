/** Host-owned resource watching and editor advisory configuration. */
export interface FileViewerMetadata {
  readonly resourcePollIntervalMs: number
  readonly largeDocumentCharacters: number
}
