/** Host-owned resource watching and editor advisory configuration. */
export interface FileViewerMetadata {
  readonly resourcePollIntervalMs: number
  readonly largeResourcePollIntervalMs: number
  readonly hugeResourcePollIntervalMs: number
  readonly resourcePollBackoffMaxMs: number
  readonly maxDeltaBytes: number
  readonly largeEditCheckDelayMs: number
  readonly textReadConcurrency: number
  readonly textReadTimeoutMs: number
  readonly textReadRetries: number
  readonly textReadRetryDelayMs: number
  readonly progressiveFlushIntervalMs: number
  readonly largeFileBytes: number
  readonly hugeFileBytes: number
}
