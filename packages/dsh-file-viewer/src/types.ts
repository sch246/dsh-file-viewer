/** Host-owned resource watching and editor advisory configuration. */
export interface FileViewerMetadata {
  readonly resourcePollIntervalMs: number
  readonly progressiveFlushIntervalMs: number
  readonly largeFileBytes: number
  readonly hugeFileBytes: number
}
